import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Brand } from 'wellcrafted/brand';
import { Ok, tryAsync, trySync } from 'wellcrafted/result';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type { Row, TableSchema, WorkspaceSchema } from '../../core/schema';
import type { Db } from '../../db/core';
import { parseMarkdownWithValidation } from './parser';

/**
 * Branded type for absolute file system paths
 *
 * This brand ensures that we only work with absolute paths in functions that require them,
 * preventing bugs from accidentally passing relative paths where absolute paths are expected.
 *
 * Use `path.resolve()` to convert relative paths to absolute paths and assert the brand:
 * ```typescript
 * const absolutePath = path.resolve('./relative/path') as AbsolutePath;
 * ```
 */
type AbsolutePath = string & Brand<'AbsolutePath'>;

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
	const storagePath = path.resolve(relativeStoragePath) as AbsolutePath;

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
	storagePath: AbsolutePath;
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
	storagePath: AbsolutePath;
	tableConfig?: TableMarkdownConfig<TTableSchema>;
}) {
	const bodyFieldKey = tableConfig?.bodyField;

	/**
	 * Helper to construct the full file path for a given row ID
	 *
	 * File structure: {storagePath}/{tableName}/{id}.md
	 * Example: /Users/name/vault/pages/my-page.md
	 *
	 * The brand assertion is safe because path.join() with an absolute path as the first
	 * argument always produces an absolute path.
	 *
	 * @param id - The row ID (becomes the markdown filename without extension)
	 * @returns Absolute path to the markdown file
	 */
	const getFilePath = (id: string): AbsolutePath =>
		path.join(storagePath, tableName, `${id}.md`) as AbsolutePath;

	// Helper to determine if a field should be included in frontmatter

	return {
		/**
		 * Write a YJS row to markdown file
		 * Handles serialization and frontmatter/content extraction
		 */
		write: async (row: Row) => {
			// Serialize YJS types (Y.Text, Y.Array) to plain values (string, array)
			const serialized = row.toJSON();
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
	storagePath: AbsolutePath;
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
			 * Expected directory structure:
			 *   {storagePath}/{tableName}/{id}.md
			 *
			 * Example:
			 *   relativePath = "pages/my-page.md"
			 *   Result: tableName = "pages", id = "my-page"
			 *
			 * We strictly enforce this 2-level structure and ignore any files that don't match.
			 */
			const parts = relativePath.split(path.sep);
			if (parts.length !== 2) return;

			// Extract the tableName and row ID (filename without the .md) from the parts
			const [tableName, filename] = parts as [string, `${string}.md`];
			const id = path.basename(filename, '.md');

			/**
			 * Construct the full absolute path to the file
			 *
			 * Since storagePath is already absolute (guaranteed by AbsolutePath brand),
			 * joining it with relativePath produces an absolute path.
			 */
			const filePath = path.join(storagePath, relativePath) as AbsolutePath;

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
				// Get existing YRow if the row already exists
				const existingYRow = table.has(id) ? table.get(id) : undefined;
				const yrow =
					existingYRow?.status === 'valid' ? existingYRow.row.$yRow : undefined;

				const parseResult = await parseMarkdownWithValidation({
					filePath,
					schema: tableSchema,
					bodyField: tableConfig?.bodyField,
					yrow,
				});

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

					case 'invalid-structure':
						console.error(
							IndexErr({
								message: `Invalid structure in markdown file ${tableName}/${id}`,
								context: {
									tableName,
									id,
									filePath,
									reason: parseResult.reason,
									actualData: parseResult.row,
								},
								cause: new Error(
									`Expected object, got ${parseResult.reason.type}`,
								),
							}),
						);
						break;

					case 'schema-mismatch':
						console.error(
							IndexErr({
								message: `Schema mismatch in markdown file ${tableName}/${id}`,
								context: {
									tableName,
									id,
									filePath,
									reason: parseResult.reason,
								},
								cause: new Error(JSON.stringify(parseResult.reason, null, 2)),
							}),
						);
						console.error(
							'Validation details:',
							JSON.stringify(parseResult.reason, null, 2),
						);
						break;

					case 'valid':
						// Insert row if it doesn't exist yet
						// (if it already existed, the parser updated it in place)
						if (!table.has(id)) {
							try {
								table.insert(parseResult.row.toJSON());
							} catch (error) {
								console.error(
									IndexErr({
										message: `Failed to insert row from markdown file ${tableName}/${id}`,
										context: { tableName, id, filePath },
										cause: error,
									}),
								);
							}
						}
						break;
				}
			}
			syncCoordination.isProcessingFileChange = false;
		},
	);

	return watcher;
}
