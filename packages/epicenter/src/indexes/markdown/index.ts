import { mkdirSync, watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Ok, tryAsync, trySync } from 'wellcrafted/result';
import * as Y from 'yjs';
import { IndexErr } from '../../core/errors';
import { defineIndex, type Index } from '../../core/indexes';
import type { Row, TableSchema, WorkspaceSchema } from '../../core/schema';
import { serializeRow } from '../../core/schema';
import type { Db } from '../../db/core';
import { syncYArrayToDiff, syncYTextToDiff } from '../../utils/yjs';
import { parseMarkdownWithValidation } from './parser';


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
 * @param db - Epicenter database instance
 * @param config - Markdown configuration options
 */
export function markdownIndex<TSchema extends WorkspaceSchema>(
	db: Db<TSchema>,
	{ storagePath = '.', tables = {} }: MarkdownIndexConfig<TSchema> = {},
) {

	/**
	 * Loop prevention flags to avoid infinite sync cycles
	 *
	 * How it works:
	 * - Before YJS observers write files: set isProcessingYJSChange = true
	 *   - File watcher checks this flag and skips processing
	 * - Before file watcher updates YJS: set isProcessingFileChange = true
	 *   - YJS observers check this flag and skip processing
	 */
	let isProcessingFileChange = false;
	let isProcessingYJSChange = false;

	// Set up observers for each table
	const unsubscribers: Array<() => void> = [];

	for (const tableName of db.getTableNames()) {
		const table = db.tables[tableName];
		if (!table) {
			throw new Error(`Table "${tableName}" not found`);
		}

		const tableConfig = tables[tableName];
		const markdown = createTableMarkdownOperations({ tableName, storagePath, tableConfig });

		const unsub = table.observe({
			onAdd: async (row) => {
				// Skip if this YJS change was triggered by a file change we're processing
				// (prevents markdown -> YJS -> markdown infinite loop)
				if (isProcessingFileChange) return;

				isProcessingYJSChange = true;
				const { error } = await markdown.write(row);
				isProcessingYJSChange = false;

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
				if (isProcessingFileChange) return;

				isProcessingYJSChange = true;
				const { error } = await markdown.write(row);
				isProcessingYJSChange = false;

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
				if (isProcessingFileChange) return;

				isProcessingYJSChange = true;
				const { error } = await markdown.delete(id);
				isProcessingYJSChange = false;

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

	// Set up file watcher for bidirectional sync
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
			if (isProcessingYJSChange) return;

			if (!relativePath || !relativePath.endsWith('.md')) return;

			// Parse relative path from watcher
			// filename is already relative to storagePath (e.g., "pages/my-page.md")
			// Expected format: [tableName]/[id].md
			const parts = relativePath.split(path.sep);
			if (parts.length !== 2) return; // Ignore files that don't match our expected structure
			const [tableName, filenameWithExt] = parts;
			if (!tableName || !filenameWithExt) return;

			const id = path.basename(filenameWithExt, '.md');
			const filePath = path.join(storagePath, relativePath);

			isProcessingFileChange = true;
			// Handle file changes
			// Note: On some filesystems (like macOS), file writes generate 'rename' events
			// instead of 'change' events due to atomic rename operations.
			// Therefore 'rename' can mean either deletion or modification.
			if (eventType === 'rename') {
				// Distinguish between deletion and modification by checking file existence
				const file = Bun.file(filePath);
				const exists = await file.exists();
				if (!exists) {
					// File no longer exists -> this is a deletion
					const table = db.tables[tableName];
					if (table?.has(id)) table.delete(id);
					return; // Exit early for deletions
				}
				// File still exists -> this is a modification, fall through to change handling below
			}

			// Process file change (works for both 'change' and 'rename' with existing file)
			if (eventType === 'change' || eventType === 'rename') {
				// Get the table schema
				const tableSchema = db.schema[tableName];
				if (!tableSchema) {
					console.warn(
						`File watcher: Unknown table "${tableName}" from file ${relativePath}`,
					);
					return;
				}

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
						console.error('Validation details:', JSON.stringify(parseResult.validationResult, null, 2));
						break;

					case 'success':
						// Update YJS document with granular diffs
						try {
							// Reconstruct the full row data by merging:
							// - parseResult.data (frontmatter fields)
							// - parseResult.content (markdown body) -> stored in the configured bodyField (if any)
							const tableConfig = tables[tableName as keyof TSchema];
							const rowData = tableConfig?.bodyField
								? { ...parseResult.data, [tableConfig.bodyField]: parseResult.content }
								: parseResult.data;

							updateYJSRowFromMarkdown({ db, tableName, rowId: id, newData: rowData });
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
			isProcessingFileChange = false;
		},
	);

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
function updateYJSRowFromMarkdown<TWorkspaceSchema extends WorkspaceSchema>(
	{ db, tableName, rowId, newData }: { db: Db<TWorkspaceSchema>; tableName: string; rowId: string; newData: Row; },
): void {
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
					if (
						existingValue instanceof Y.Array &&
						Array.isArray(newValue)
					) {
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
 * @param storagePath - Path where markdown files are stored
 * @param tableConfig - Optional table-specific markdown configuration
 * @returns Object with write and delete methods
 *
 * @example
 * ```typescript
 * const markdown = createTableMarkdownOperations('pages', './vault', { bodyField: 'content' });
 * await markdown.write(row);
 * await markdown.delete('row-id');
 * ```
 */
function createTableMarkdownOperations<TTableSchema extends TableSchema>(
	{ tableName, storagePath, tableConfig }: { tableName: string; storagePath: string; tableConfig?: TableMarkdownConfig<TTableSchema>; },
) {
	const bodyFieldKey = tableConfig?.bodyField;

	// Helper to construct file path for a given row ID
	const getFilePath = (id: string) => path.join(storagePath, tableName, `${id}.md`);

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
						const isValueNullOrUndefined = value === null || value === undefined
						if (isValueNullOrUndefined) return false;
					}

					return true;
				}
				)
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
		}
	};
}

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig<TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema> = {
	/**
	 * Path where markdown files should be stored
	 * Example: './data/markdown'
	 * Default: '.' (current directory)
	 */
	storagePath?: string;
	/**
	 * Per-table configuration
	 * Keys must be valid table names from the workspace schema
	 * Example: { pages: { bodyField: 'body' }, posts: { bodyField: 'content' } }
	 * If omitted, all tables will use default configuration (no bodyField, include null values)
	 */
	tables?: {
		[K in keyof TWorkspaceSchema]?: TableMarkdownConfig<TWorkspaceSchema[K]>;
	};
};