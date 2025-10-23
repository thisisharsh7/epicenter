import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Ok, tryAsync, trySync } from 'wellcrafted/result';
import * as Y from 'yjs';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type { Row, TableSchema, WorkspaceSchema } from '../../core/schema';
import { serializeRow } from '../../core/schema';
import type { Db } from '../../db/core';
import { syncYArrayToDiff, syncYTextToDiff } from '../../utils/yjs';
import { parseMarkdownWithValidation } from './parser';

/**
 * Bidirectional sync coordination state
 *
 * Prevents infinite loops during two-way synchronization between YJS (in-memory)
 * and markdown files (on disk). Without this coordination:
 *
 * 1. YJS change → writes markdown file → triggers file watcher
 * 2. File watcher → updates YJS → triggers YJS observer
 * 3. YJS observer → writes markdown file → back to step 1 (infinite loop)
 *
 * The state ensures changes only flow in one direction at a time by tracking
 * which system is currently processing changes.
 */
type SyncCoordination = {
	/**
	 * True when the file watcher is currently processing a change from disk
	 * YJS observers check this and skip processing to avoid the loop
	 */
	isProcessingFileChange: boolean;

	/**
	 * True when YJS observers are currently processing a change from memory
	 * File watcher checks this and skips processing to avoid the loop
	 */
	isProcessingYJSChange: boolean;
};

/**
 * Per-table markdown configuration
 */
type TableMarkdownConfig<TTableSchema extends TableSchema> = {
	/**
	 * Field name to map markdown body content to for this table
	 * Must be a valid field name from the table's schema
	 * If undefined, markdown body will be empty and only frontmatter fields are synced
	 */
	bodyField?: keyof TTableSchema & string;

	/**
	 * Whether to omit null/undefined values from frontmatter when writing markdown files
	 * If true, fields with null or undefined values won't be written to frontmatter
	 * When reading, missing schema fields will be populated with null
	 * Default: false
	 */
	omitNullValues?: boolean;
};

/**
 * Create a markdown index
 *
 * This index maintains two-way synchronization between YJS (in-memory) and markdown files (on disk):
 *
 * Direction 1: YJS → Markdown (via observers)
 * - When a row is added/updated/deleted in YJS
 * - Extract the bodyField value as markdown body
 * - Write/update/delete the corresponding .md file
 *
 * Direction 2: Markdown → YJS (via file watcher)
 * - When a .md file is created/modified/deleted
 * - Parse frontmatter as row fields
 * - Parse body content and insert into bodyField
 * - Update YJS with granular diffs
 *
 * Loop prevention flags ensure these two directions don't trigger each other infinitely.
 * Without them, we'd get stuck in an infinite loop:
 * 1. YJS change -> writes markdown file -> triggers file watcher
 * 2. File watcher -> updates YJS -> triggers YJS observer
 * 3. YJS observer -> writes markdown file -> back to step 1
 *
 * The flags break the cycle by ensuring changes only flow in one direction at a time.
 *
 * Expected directory structure:
 * ```
 * {storagePath}/
 *   {tableName}/
 *     {row-id}.md
 *     {row-id}.md
 *   {tableName}/
 *     {row-id}.md
 * ```
 *
 * @param db - Epicenter database instance
 * @param config - Markdown configuration options
 * @param config.storagePath - Path where markdown files should be stored (relative or absolute).
 *                              Will be converted to absolute path internally. Defaults to current directory.
 * @param config.tableConfigs - Per-table configuration for bodyField and other options
 */
export function markdownIndex<TSchema extends WorkspaceSchema>(
	db: Db<TSchema>,
	{
		storagePath: relativeStoragePath = '.',
		tableConfigs = {},
	}: MarkdownIndexConfig<TSchema> = {},
) {
	/**
	 * Convert storagePath to absolute path immediately to ensure consistency
	 * even if the working directory changes during execution.
	 */
	const storagePath = path.resolve(relativeStoragePath);

	/**
	 * Coordination state to prevent infinite sync loops
	 *
	 * How it works:
	 * - Before YJS observers write files: set isProcessingYJSChange = true
	 *   - File watcher checks this and skips processing
	 * - Before file watcher updates YJS: set isProcessingFileChange = true
	 *   - YJS observers check this and skip processing
	 */
	const syncCoordination: SyncCoordination = {
		isProcessingFileChange: false,
		isProcessingYJSChange: false,
	};

	// Set up observers for each table
	const unsubscribers = registerYJSObservers({
		db,
		storagePath,
		tableConfigs,
		syncCoordination,
	});

	// Set up file watcher for bidirectional sync
	const watcher = registerFileWatcher({
		db,
		storagePath,
		tableConfigs,
		syncCoordination,
	});

	return defineIndex({
		destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
			watcher.close();
		},
	});
}

/**
 * Update a YJS row from markdown file data using granular diffs
 *
 * This function handles two scenarios:
 * 1. Row doesn't exist: Converts plain values to YJS types and inserts new row
 * 2. Row exists: Applies granular diffs to minimize changes
 *
 * For primitive columns (text, integer, boolean, etc.), directly overwrites values.
 * For Y.Text columns, uses syncYTextToDiff() for granular character-level updates.
 * For Y.Array columns, uses syncYArrayToDiff() for granular element-level updates.
 *
 * @param db - Database instance
 * @param tableName - Name of the table to update
 * @param rowId - ID of the row to update or insert
 * @param newData - Plain JavaScript object from markdown file (already validated against schema)
 */
function updateYJSRowFromMarkdown<TWorkspaceSchema extends WorkspaceSchema>({
	db,
	tableName,
	rowId,
	newData,
}: {
	db: Db<TWorkspaceSchema>;
	tableName: string;
	rowId: string;
	newData: Row;
}): void {
	const table = db.tables[tableName];
	if (!table) {
		throw new Error(`Table "${tableName}" not found`);
	}

	const schema = db.schema[tableName];
	if (!schema) {
		throw new Error(`Schema for table "${tableName}" not found`);
	}

	// Get the existing row
	const rowResult = table.get(rowId);
	if (rowResult.status === 'not-found') {
		// Row doesn't exist yet in YJS
		// Markdown files contain plain JavaScript values (strings, arrays, etc.)
		// but YJS needs specialized types (Y.Text, Y.Array) for CRDT collaboration.
		// Convert plain values to their YJS equivalents before inserting.
		const convertedRow: Record<string, any> = {};
		for (const [columnName, columnSchema] of Object.entries(schema)) {
			const value = newData[columnName];
			switch (columnSchema.type) {
				case 'ytext':
					// Convert plain string to Y.Text for collaborative editing
					if (typeof value === 'string') {
						const ytext = new Y.Text();
						ytext.insert(0, value);
						convertedRow[columnName] = ytext;
					} else {
						convertedRow[columnName] = value;
					}
					break;

				case 'multi-select':
					// Convert plain array to Y.Array for collaborative list editing
					if (Array.isArray(value)) {
						convertedRow[columnName] = Y.Array.from(value);
					} else {
						convertedRow[columnName] = value;
					}
					break;

				default:
					// Primitive types (string, number, boolean) don't need conversion
					convertedRow[columnName] = value;
					break;
			}
		}
		table.insert(convertedRow as any);
		return;
	}

	if (rowResult.status !== 'valid') {
		console.warn(
			`Cannot update invalid row ${tableName}/${rowId}: ${rowResult.status}`,
		);
		return;
	}

	const existingRow = rowResult.row;

	// Group all updates in a single YJS transaction
	// This ensures atomicity and generates only one update event for observers
	db.transact(() => {
		for (const [columnName, columnSchema] of Object.entries(schema)) {
			const newValue = newData[columnName];
			const existingValue = existingRow[columnName];

			// Skip if values are identical (primitives only - object references won't match)
			// This optimization avoids unnecessary update() calls for unchanged fields
			if (newValue === existingValue) {
				continue;
			}

			// Handle different column types
			switch (columnSchema.type) {
				case 'ytext': {
					// Use granular character-level diffs instead of replacing entire content
					// This preserves cursor positions and reduces network traffic in collaborative scenarios
					// syncYTextToDiff calculates the minimal insertions/deletions needed
					if (existingValue instanceof Y.Text && typeof newValue === 'string') {
						syncYTextToDiff(existingValue, newValue);
					} else if (newValue === null && columnSchema.nullable) {
						table.update({ id: rowId, [columnName]: null } as any);
					}
					break;
				}

				case 'multi-select': {
					// Use granular element-level diffs instead of replacing entire array
					// This preserves array positions and reduces conflicts in collaborative scenarios
					// syncYArrayToDiff calculates the minimal insertions/deletions needed
					if (existingValue instanceof Y.Array && Array.isArray(newValue)) {
						syncYArrayToDiff(existingValue, newValue);
					} else if (newValue === null && columnSchema.nullable) {
						table.update({ id: rowId, [columnName]: null } as any);
					}
					break;
				}

				default: {
					// For all other types (primitives: string, number, boolean, etc.)
					// No special YJS types needed, just update directly
					table.update({ id: rowId, [columnName]: newValue } as any);
					break;
				}
			}
		}
	});
}

/**
 * Creates table-specific markdown operations with captured context
 *
 * Returns an object with methods to write and delete markdown files for a specific table.
 * The table name, configuration, and storage path are captured, eliminating the need
 * to pass them on every operation call.
 *
 * @param tableName - Name of the table to create operations for
 * @param storagePath - Absolute path where markdown files are stored. Should be pre-resolved to absolute.
 * @param tableConfig - Optional table-specific markdown configuration
 * @returns Object with write and delete methods
 *
 * @example
 * ```typescript
 * const absolutePath = path.resolve('./vault');
 * const markdown = createTableMarkdownOperations({
 *   tableName: 'pages',
 *   storagePath: absolutePath,
 *   tableConfig: { bodyField: 'content' }
 * });
 * await markdown.write(row);
 * await markdown.delete('row-id');
 * ```
 */
function createTableMarkdownOperations<TTableSchema extends TableSchema>({
	tableName,
	storagePath,
	tableConfig,
}: {
	tableName: string;
	storagePath: string;
	tableConfig?: TableMarkdownConfig<TTableSchema>;
}) {
	const bodyFieldKey = tableConfig?.bodyField;

	/**
	 * Helper to construct the full file path for a given row ID
	 *
	 * File structure: {storagePath}/{tableName}/{id}.md
	 * Example: /Users/name/vault/pages/my-page.md
	 *
	 * @param id - The row ID (becomes the markdown filename without extension)
	 * @returns Absolute path to the markdown file
	 */
	const getFilePath = (id: string) =>
		path.join(storagePath, tableName, `${id}.md`);

	// Helper to determine if a field should be included in frontmatter

	return {
		/**
		 * Write a YJS row to markdown file
		 * Handles serialization and frontmatter/content extraction
		 */
		write: async (row: Row) => {
			// Serialize YJS types (Y.Text, Y.Array) to plain values (string, array)
			const serialized = serializeRow(row);
			const filePath = getFilePath(row.id);

			// Build frontmatter by filtering serialized data
			const frontmatter = Object.fromEntries(
				Object.entries(serialized).filter(([key, value]) => {
					// Filter out body field since it goes in markdown content
					const isBodyField = key === bodyFieldKey;
					if (isBodyField) return false;

					// If omitNullValues is enabled, exclude null/undefined values
					if (tableConfig?.omitNullValues) {
						const isValueNullOrUndefined =
							value === null || value === undefined;
						if (isValueNullOrUndefined) return false;
					}

					return true;
				}),
			);

			// Extract content from configured body field
			const content = bodyFieldKey ? serialized[bodyFieldKey] : '';

			// Write markdown file with frontmatter
			return tryAsync({
				try: async () => {
					// Ensure directory exists
					await tryAsync({
						try: () => mkdir(path.dirname(filePath), { recursive: true }),
						catch: () => Ok(undefined), // Directory might already exist
					});

					// Create markdown content with frontmatter
					const yamlContent = Bun.YAML.stringify(frontmatter, null, 2);
					const markdown = `---\n${yamlContent}\n---\n${content}`;

					// Write file
					await Bun.write(filePath, markdown);
				},
				catch: (error) =>
					IndexErr({
						message: `Failed to write markdown file ${filePath}`,
						context: { filePath, tableName },
						cause: error,
					}),
			});
		},

		/**
		 * Delete a markdown file for a row
		 */
		delete: async (id: string) => {
			const filePath = getFilePath(id);
			return tryAsync({
				try: () => Bun.file(filePath).delete(),
				catch: (error) => {
					console.warn(`Could not delete markdown file ${filePath}:`, error);
					// Return Ok anyway as deletion failures are often not critical
					return Ok(undefined);
				},
			});
		},
	};
}

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/**
	 * Path where markdown files should be stored
	 *
	 * Can be relative or absolute. Will be converted to absolute path internally
	 * using `path.resolve()` to ensure consistency even if the working directory changes.
	 *
	 * Examples:
	 * - './vault' (relative, will be resolved to absolute)
	 * - '../data/markdown' (relative, will be resolved to absolute)
	 * - '/Users/name/vault' (already absolute, will be used as-is)
	 *
	 * Default: '.' (current directory)
	 */
	storagePath?: string;
	/**
	 * Per-table configuration
	 *
	 * Keys must be valid table names from the workspace schema.
	 * Each table can specify which field should contain the markdown body content
	 * and whether to omit null values from frontmatter.
	 *
	 * Example:
	 * ```typescript
	 * {
	 *   pages: { bodyField: 'body', omitNullValues: true },
	 *   posts: { bodyField: 'content' }
	 * }
	 * ```
	 *
	 * If omitted, all tables will use default configuration (no bodyField, include null values)
	 */
	tableConfigs?: {
		[K in keyof TWorkspaceSchema]?: TableMarkdownConfig<TWorkspaceSchema[K]>;
	};
};

/**
 * Register YJS observers to sync changes from YJS to markdown files
 *
 * When rows are added/updated/deleted in YJS, this writes the changes to corresponding
 * markdown files on disk. Coordinates with the file watcher through shared state to
 * prevent infinite sync loops.
 *
 * @param db - Database instance
 * @param storagePath - Absolute path where markdown files are stored
 * @param tableConfigs - Per-table configuration
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns Array of unsubscribe functions for cleanup
 */
function registerYJSObservers<TSchema extends WorkspaceSchema>({
	db,
	storagePath,
	tableConfigs,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: string;
	tableConfigs: MarkdownIndexConfig<TSchema>['tableConfigs'];
	syncCoordination: SyncCoordination;
}): Array<() => void> {
	const unsubscribers: Array<() => void> = [];

	for (const tableName of db.getTableNames()) {
		const table = db.tables[tableName];
		if (!table) {
			throw new Error(`Table "${tableName}" not found`);
		}

		const tableConfig = tableConfigs?.[tableName];
		const markdown = createTableMarkdownOperations({
			tableName,
			storagePath,
			tableConfig,
		});

		const unsub = table.observe({
			onAdd: async (row) => {
				// Skip if this YJS change was triggered by a file change we're processing
				// (prevents markdown -> YJS -> markdown infinite loop)
				if (syncCoordination.isProcessingFileChange) return;

				syncCoordination.isProcessingYJSChange = true;
				const { error } = await markdown.write(row);
				syncCoordination.isProcessingYJSChange = false;

				if (error) {
					console.error(
						IndexErr({
							message: `Markdown index onAdd failed for ${tableName}/${row.id}`,
							context: { tableName, id: row.id },
							cause: error,
						}),
					);
				}
			},
			onUpdate: async (row) => {
				// Skip if this YJS change was triggered by a file change we're processing
				// (prevents markdown -> YJS -> markdown infinite loop)
				if (syncCoordination.isProcessingFileChange) return;

				syncCoordination.isProcessingYJSChange = true;
				const { error } = await markdown.write(row);
				syncCoordination.isProcessingYJSChange = false;

				if (error) {
					console.error(
						IndexErr({
							message: `Markdown index onUpdate failed for ${tableName}/${row.id}`,
							context: { tableName, id: row.id },
							cause: error,
						}),
					);
				}
			},
			onDelete: async (id) => {
				// Skip if this YJS change was triggered by a file change we're processing
				// (prevents markdown -> YJS -> markdown infinite loop)
				if (syncCoordination.isProcessingFileChange) return;

				syncCoordination.isProcessingYJSChange = true;
				const { error } = await markdown.delete(id);
				syncCoordination.isProcessingYJSChange = false;

				if (error) {
					console.error(
						IndexErr({
							message: `Markdown index onDelete failed for ${tableName}/${id}`,
							context: { tableName, id },
							cause: error,
						}),
					);
				}
			},
		});
		unsubscribers.push(unsub);
	}

	return unsubscribers;
}

/**
 * Register file watcher to sync changes from markdown files to YJS
 *
 * When markdown files are created/modified/deleted on disk, this updates the
 * corresponding YJS rows. Coordinates with YJS observers through shared state to
 * prevent infinite sync loops.
 *
 * @param db - Database instance
 * @param storagePath - Absolute path where markdown files are stored
 * @param tableConfigs - Per-table configuration
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns File watcher instance for cleanup
 */
function registerFileWatcher<TSchema extends WorkspaceSchema>({
	db,
	storagePath,
	tableConfigs,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: string;
	tableConfigs: MarkdownIndexConfig<TSchema>['tableConfigs'];
	syncCoordination: SyncCoordination;
}): FSWatcher {
	// Ensure the directory exists before watching
	trySync({
		try: () => {
			mkdirSync(storagePath, { recursive: true });
		},
		catch: () => Ok(undefined),
	});

	const watcher = watch(
		storagePath,
		{ recursive: true },
		async (eventType, relativePath) => {
			// Skip if this file change was triggered by a YJS change we're processing
			// (prevents YJS -> markdown -> YJS infinite loop)
			if (syncCoordination.isProcessingYJSChange) return;

			// Skip non-markdown files
			if (!relativePath || !relativePath.endsWith('.md')) return;

			/**
			 * Parse the relative path from the watcher to extract table name and row ID
			 *
			 * The watcher provides relativePath relative to storagePath.
			 * Expected directory structure:
			 *   {storagePath}/
			 *     {tableName}/
			 *       {id}.md
			 *
			 * Example:
			 *   storagePath = "/Users/name/vault"
			 *   relativePath = "pages/my-page.md"
			 *   Result: tableName = "pages", id = "my-page"
			 *
			 * We strictly enforce this 2-level structure and ignore any files that don't match
			 * (e.g., files in the root or nested deeper than 2 levels).
			 */
			const parts = relativePath.split(path.sep);
			if (parts.length !== 2) return; // Ignore files that don't match our expected structure
			const [tableName, filenameWithExt] = parts;
			if (!tableName || !filenameWithExt) return;

			// Extract the row ID from the filename (without .md extension)
			const id = path.basename(filenameWithExt, '.md');

			/**
			 * Construct the full absolute path to the file
			 *
			 * We use storagePath (not the original storagePath parameter) to ensure
			 * we always work with absolute paths, preventing issues when the working directory changes.
			 */
			const filePath = path.join(storagePath, relativePath);

			// Get table and schema once for this file event
			const table = db.tables[tableName];
			const tableSchema = db.schema[tableName];
			const tableConfig = tableConfigs?.[tableName as keyof TSchema];

			if (!table || !tableSchema) {
				console.warn(
					`File watcher: Unknown table "${tableName}" from file ${relativePath}`,
				);
				return;
			}

			syncCoordination.isProcessingFileChange = true;

			/**
			 * Handle file system events
			 *
			 * Event types:
			 * - 'change': File content was modified
			 * - 'rename': File was renamed, moved, created, or deleted
			 *
			 * Important: On some filesystems (especially macOS), file writes generate 'rename'
			 * events instead of 'change' events due to atomic rename operations. This means
			 * 'rename' can indicate either deletion OR modification.
			 *
			 * To distinguish between deletion and modification:
			 * - Check if file exists
			 * - If not exists: deletion (remove from YJS)
			 * - If exists: modification (parse and update YJS)
			 */
			if (eventType === 'rename') {
				// Check if the file still exists to distinguish between deletion and modification
				const file = Bun.file(filePath);
				const exists = await file.exists();
				if (!exists) {
					/**
					 * File was deleted: Remove the row from YJS
					 *
					 * We only delete if the row exists in the table to avoid
					 * unnecessary operations and potential errors.
					 */
					if (table.has(id)) table.delete(id);
					return; // Exit early for deletions
				}
				/**
				 * File still exists: This is a modification, not a deletion.
				 * Fall through to the change handling logic below.
				 */
			}

			/**
			 * Process file modification (works for both 'change' and 'rename' with existing file)
			 *
			 * Steps:
			 * 1. Validate that the table exists in the schema
			 * 2. Parse and validate the markdown file
			 * 3. Update YJS with the parsed data using granular diffs
			 */
			if (eventType === 'change' || eventType === 'rename') {

				// File was modified, parse and update YJS
				const parseResult = await parseMarkdownWithValidation(
					filePath,
					tableSchema,
				);

				switch (parseResult.status) {
					case 'failed-to-parse':
						console.error(
							IndexErr({
								message: `Failed to parse markdown file ${tableName}/${id}`,
								context: { tableName, id, filePath },
								cause: parseResult.error,
							}),
						);
						break;

					case 'failed-to-validate':
						console.error(
							IndexErr({
								message: `Failed to validate markdown file ${tableName}/${id}`,
								context: {
									tableName,
									id,
									filePath,
									validationResult: parseResult.validationResult,
									rawData: parseResult.data,
									cause: undefined,
								},
							}),
						);
						console.error(
							'Validation details:',
							JSON.stringify(parseResult.validationResult, null, 2),
						);
						break;

					case 'success':
						// Update YJS document with granular diffs
						try {
							// Reconstruct the full row data by merging:
							// - parseResult.data (frontmatter fields)
							// - parseResult.content (markdown body) -> stored in the configured bodyField (if any)
							const rowData = tableConfig?.bodyField
								? {
										...parseResult.data,
										[tableConfig.bodyField]: parseResult.content,
									}
								: parseResult.data;

							updateYJSRowFromMarkdown({
								db,
								tableName,
								rowId: id,
								newData: rowData,
							});
						} catch (error) {
							console.error(
								IndexErr({
									message: `Failed to update YJS from markdown file ${tableName}/${id}`,
									context: { tableName, id, filePath },
									cause: error,
								}),
							);
						}
						break;
				}
			}
			syncCoordination.isProcessingFileChange = false;
		},
	);

	return watcher;
}
