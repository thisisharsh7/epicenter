import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Brand } from 'wellcrafted/brand';
import { Ok, tryAsync, trySync } from 'wellcrafted/result';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type {
	Row,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from '../../core/schema';
import type { Db } from '../../db/core';
import { parseMarkdownFile } from './parser';

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
 *
 * Provides complete control over how rows are serialized to markdown files
 * and how markdown files are parsed back into rows.
 */
type TableMarkdownConfig<TTableSchema extends TableSchema> = {
	/**
	 * Serialize a row to markdown frontmatter and content.
	 *
	 * @param params.row - Row to serialize (already validated against schema)
	 * @param params.tableName - Table name (for context)
	 * @returns Frontmatter object and markdown content string
	 */
	serialize(params: {
		row: SerializedRow<TTableSchema>;
		tableName: string;
	}): {
		frontmatter: Record<string, unknown>;
		content: string;
	};

	/**
	 * Deserialize markdown frontmatter and content back to a full row.
	 * Returns a complete row (including id) that can be directly inserted/updated in YJS.
	 * Returns null if the file should be skipped (e.g., invalid data, doesn't match schema).
	 *
	 * @param params.id - Row ID extracted from file path
	 * @param params.frontmatter - Parsed YAML frontmatter (can be any type, validate before using)
	 * @param params.content - Markdown body content
	 * @param params.tableName - Table name (for context)
	 * @param params.schema - Table schema (for validation)
	 * @returns Complete row (with id field), or null to skip this file
	 */
	deserialize(params: {
		id: string;
		frontmatter: unknown;
		content: string;
		tableName: string;
		schema: TTableSchema;
	}): SerializedRow<TTableSchema> | null;
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
	 */
	storagePath: string;

	/**
	 * Parse a file path to extract table name and row ID.
	 * This is the inverse of formatFilePath.
	 *
	 * @param params.filePath - Relative path to markdown file (e.g., "posts/my-post.md")
	 * @returns Object with tableName and id extracted from the path
	 *
	 * @example
	 * parseFilePath({ filePath: "posts/my-post.md" }) // → { tableName: "posts", id: "my-post" }
	 */
	parseFilePath(params: { filePath: string }): {
		tableName: string;
		id: string;
	};

	/**
	 * Format a file path from table name and row ID.
	 * This is the inverse of parseFilePath.
	 *
	 * @param params.id - Row ID
	 * @param params.tableName - Name of the table
	 * @returns Absolute path where file should be written
	 *
	 * @example
	 * formatFilePath({ id: "my-post", tableName: "posts" })
	 * // → "/absolute/path/vault/posts/my-post.md"
	 */
	formatFilePath(params: { id: string; tableName: string }): string;

	/**
	 * Per-table configuration
	 *
	 * Keys must be valid table names from the workspace schema.
	 * Each table defines how to serialize/deserialize markdown files.
	 *
	 * Example:
	 * ```typescript
	 * {
	 *   pages: {
	 *     serialize: ({ row }) => ({ frontmatter: { title: row.title }, content: row.body }),
	 *     deserialize: ({ id, frontmatter, content }) => ({ id, title: frontmatter.title, body: content })
	 *   }
	 * }
	 * ```
	 */
	tableConfigs: {
		[K in keyof TWorkspaceSchema]: TableMarkdownConfig<TWorkspaceSchema[K]>;
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
		storagePath: relativeStoragePath,
		parseFilePath,
		formatFilePath,
		tableConfigs,
	}: MarkdownIndexConfig<TSchema>,
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
		formatFilePath,
		tableConfigs,
		syncCoordination,
	});

	// Set up file watcher for bidirectional sync
	const watcher = registerFileWatcher({
		db,
		storagePath,
		parseFilePath,
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
	formatFilePath,
	tableConfigs,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: AbsolutePath;
	formatFilePath: MarkdownIndexConfig<TSchema>['formatFilePath'];
	tableConfigs: MarkdownIndexConfig<TSchema>['tableConfigs'];
	syncCoordination: SyncCoordination;
}): Array<() => void> {
	const unsubscribers: Array<() => void> = [];

	for (const tableName of db.getTableNames()) {
		const table = db.tables[tableName];
		if (!table) {
			throw new Error(`Table "${tableName}" not found`);
		}

		const tableSchema = db.schema[tableName];
		if (!tableSchema) {
			throw new Error(`Schema for table "${tableName}" not found`);
		}

		const markdown = createTableMarkdownOperations({
			tableName,
			formatFilePath,
			tableConfig: tableConfigs[tableName],
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
 * @param tableConfig - Optional table-specific markdown configuration with transform functions
 * @param tableSchema - Table schema for validation and type handling
 * @returns Object with write and delete methods
 *
 * @example
 * ```typescript
 * const absolutePath = path.resolve('./vault');
 * const markdown = createTableMarkdownOperations({
 *   tableName: 'pages',
 *   storagePath: absolutePath,
 *   tableConfig: { transform: myTransform },
 *   tableSchema: pagesSchema
 * });
 * await markdown.write(row);
 * await markdown.delete('row-id');
 * ```
 */
function createTableMarkdownOperations<TTableSchema extends TableSchema>({
	tableName,
	formatFilePath,
	tableConfig,
}: {
	tableName: string;
	formatFilePath(params: { id: string; tableName: string }): string;
	tableConfig: TableMarkdownConfig<TTableSchema>;
}) {
	return {
		/**
		 * Write a YJS row to markdown file
		 * Uses config functions to serialize and determine file path
		 */
		write: async (row: Row<TTableSchema>) => {
			// Serialize YJS types (Y.Text, Y.Array) to plain values (string, array)
			const serialized = row.toJSON();

			// Use formatFilePath to get absolute file path (id → path)
			const filePath = formatFilePath({
				id: row.id,
				tableName,
			}) as AbsolutePath;

			// Use config to serialize to frontmatter and content
			const { frontmatter, content } = tableConfig.serialize({
				row: serialized,
				tableName,
			});

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
		 * Uses formatFilePath to determine file path from row id (id → path)
		 */
		delete: async (id: string) => {
			const filePath = formatFilePath({
				id,
				tableName,
			}) as AbsolutePath;

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
	parseFilePath,
	tableConfigs,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: AbsolutePath;
	parseFilePath: MarkdownIndexConfig<TSchema>['parseFilePath'];
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

			// Extract table name and row ID from the file path
			const { tableName, id } = parseFilePath({ filePath: relativePath });

			// Get table, schema, and config
			const table = db.tables[tableName];
			const tableSchema = db.schema[tableName];
			const tableConfig = tableConfigs[tableName];

			if (!table || !tableSchema || !tableConfig) {
				if (!table || !tableSchema) {
					console.warn(
						`File watcher: Unknown table "${tableName}" from file ${relativePath}`,
					);
				}
				return;
			}

			/**
			 * Construct the full absolute path to the file
			 *
			 * Since storagePath is already absolute (guaranteed by AbsolutePath brand),
			 * joining it with relativePath produces an absolute path.
			 */
			const filePath = path.join(storagePath, relativePath) as AbsolutePath;

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
				// Step 1: Parse markdown file
				const parseResult = await parseMarkdownFile(filePath);

				if (parseResult.error) {
					console.error(
						IndexErr({
							message: `Failed to parse markdown file ${tableName}/${id}`,
							context: { tableName, id, filePath },
							cause: parseResult.error,
						}),
					);
					syncCoordination.isProcessingFileChange = false;
					return;
				}

				const { data: frontmatter, content } = parseResult.data;

				// Step 2: Deserialize using the config (handles validation and transformation)
				const row = tableConfig.deserialize({
					id,
					frontmatter,
					content,
					tableName,
					schema: tableSchema as any,
				});

				// If deserialize returns null, skip this file (invalid/unsupported)
				if (row === null) {
					console.warn(
						`Skipping markdown file ${tableName}/${id}: deserialize returned null`,
					);
					syncCoordination.isProcessingFileChange = false;
					return;
				}

				// Step 3: Insert or update the row in YJS
				if (table.has(id)) {
					table.update(row);
				} else {
					table.insert(row);
				}
			}
			syncCoordination.isProcessingFileChange = false;
		},
	);

	return watcher;
}
