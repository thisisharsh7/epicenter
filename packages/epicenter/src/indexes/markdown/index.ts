import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync, trySync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import type { Db } from '../../core/db/core';
import { IndexErr } from '../../core/errors';
import {
	type Index,
	type IndexContext,
	defineIndexExports,
} from '../../core/indexes';
import type {
	Row,
	SerializedRow,
	TableSchema,
	TableSchemaWithValidation,
	WorkspaceSchema,
} from '../../core/schema';
import { createTableSchemaWithValidation } from '../../core/schema';
import type { AbsolutePath } from '../../core/types';
import { deleteMarkdownFile, writeMarkdownFile } from './operations';
import { parseMarkdownFile } from './parser';

/**
 * Error types for markdown index diagnostics
 * Used to track files that fail to process during indexing
 */
export const { MarkdownIndexError, MarkdownIndexErr } =
	createTaggedError('MarkdownIndexError');
export type MarkdownIndexError = ReturnType<typeof MarkdownIndexError>;

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
 * Required types for internal functions (after defaults have been applied)
 *
 * These types represent the runtime reality that optional config parameters
 * have been given default values by the time they reach internal functions.
 */
type TableConfigs<TSchema extends WorkspaceSchema> = {
	[K in keyof TSchema]?: TableMarkdownConfig<TSchema[K]>;
};

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/**
	 * Workspace-level directory where markdown files should be stored.
	 *
	 * **Optional**: Defaults to the workspace `id` if not provided
	 * ```typescript
	 * // If workspace id is "blog", defaults to "<storageDir>/blog"
	 * markdownIndex({ id, db, storageDir })
	 * ```
	 *
	 * **Three ways to specify the path**:
	 *
	 * **Option 1: Relative paths** (recommended): Resolved relative to storageDir from epicenter config
	 * ```typescript
	 * directory: './vault'      // → <storageDir>/vault
	 * directory: '../content'   // → <storageDir>/../content
	 * ```
	 *
	 * **Option 2: Absolute paths**: Used as-is, no resolution needed
	 * ```typescript
	 * directory: '/absolute/path/to/vault'
	 * ```
	 *
	 * **Option 3: Relative to current file**: Use import.meta.dirname to create absolute path relative to the workspace file
	 * ```typescript
	 * // In workspace.ts, places files in ./vault folder next to workspace.ts
	 * directory: path.join(import.meta.dirname, './vault')
	 * ```
	 *
	 * Each table's directory will be resolved relative to this workspace directory (unless the table uses an absolute path).
	 *
	 * @default `./${id}` where id is the workspace ID
	 */
	directory?: string;

	/**
	 * Per-table markdown configuration.
	 *
	 * Defines how each table is serialized to markdown files and deserialized back.
	 * Tables without custom configuration use default behavior:
	 * - Directory: `{tableName}` (relative to workspace directory)
	 * - Serialize: all fields in frontmatter, empty body, filename `{id}.md`
	 * - Deserialize: extract ID from filename, validate all frontmatter fields
	 *
	 * Example:
	 * ```typescript
	 * {
	 *   posts: {
	 *     directory: './blog-posts', // relative to workspace directory
	 *     serialize: ({ row, context }) => ({
	 *       frontmatter: { title: row.title, date: row.createdAt },
	 *       body: row.content,
	 *       filename: `${row.id}.md`
	 *     }),
	 *     deserialize: ({ frontmatter, body, filename, context }) => {
	 *       const id = path.basename(filename, '.md');
	 *       return Ok({ id, title: frontmatter.title, content: body });
	 *     }
	 *   }
	 * }
	 * ```
	 */
	tables?: TableConfigs<TWorkspaceSchema>;
};

/**
 * Custom serialization/deserialization behavior for a table
 *
 * Defines how rows are converted to markdown files and vice versa.
 * When not provided, uses default behavior.
 */
type TableMarkdownConfig<TTableSchema extends TableSchema> = {
	/**
	 * Directory for this table's markdown files.
	 *
	 * **Optional**: Defaults to the table name
	 *
	 * **Two ways to specify the path**:
	 *
	 * **Option 1: Relative paths** (recommended): Resolved relative to workspace directory
	 * ```typescript
	 * directory: './my-notes'      // → <workspace-dir>/my-notes
	 * directory: '../shared'       // → <workspace-dir>/../shared
	 * ```
	 *
	 * **Option 2: Absolute paths**: Used as-is, ignores workspace directory
	 * ```typescript
	 * directory: '/absolute/path/to/notes'
	 * ```
	 *
	 * @default table name (e.g., "posts" → workspace-dir/posts)
	 */
	directory?: string;

	/**
	 * Serialize a row to markdown frontmatter, body, and filename.
	 *
	 * @param params.row - Row to serialize (already validated against schema)
	 * @param params.context.tableName - Table name (for context)
	 * @param params.context.schema - Table schema with validation methods
	 * @returns Frontmatter object, markdown body string, and filename (without directory path)
	 */
	serialize(params: {
		row: SerializedRow<TTableSchema>;
		context: {
			tableName: string;
			schema: TableSchemaWithValidation<TTableSchema>;
		};
	}): {
		frontmatter: Record<string, unknown>;
		body: string;
		filename: string;
	};

	/**
	 * Deserialize markdown frontmatter and body back to a full row.
	 * Returns a complete row (including id) that can be directly inserted/updated in YJS.
	 * Returns error if the file should be skipped (e.g., invalid data, doesn't match schema).
	 *
	 * The deserialize function is responsible for extracting the row ID from whatever source
	 * makes sense (frontmatter, filename, body content, etc.).
	 *
	 * @param params.frontmatter - Parsed YAML frontmatter as a plain object
	 * @param params.body - Markdown body content (text after frontmatter delimiters)
	 * @param params.filename - Just the filename (without directory path)
	 * @param params.context.tableName - Table name (for context)
	 * @param params.context.schema - Table schema with validation methods
	 * @param params.context.filePath - Full file path (for error messages)
	 * @returns Result with complete row (with id field), or error to skip this file
	 */
	deserialize(params: {
		frontmatter: Record<string, unknown>;
		body: string;
		filename: string;
		context: {
			tableName: string;
			schema: TableSchemaWithValidation<TTableSchema>;
			filePath: string;
		};
	}): Result<SerializedRow<TTableSchema>, MarkdownIndexError>;
};

/**
 * Create a markdown index
 *
 * This index maintains two-way synchronization between YJS (in-memory) and markdown files (on disk):
 *
 * Direction 1: YJS → Markdown (via observers)
 * - When a row is added/updated/deleted in YJS
 * - Use the serializer to transform the row into frontmatter and body
 * - Write/update/delete the corresponding .md file with both parts
 *
 * Direction 2: Markdown → YJS (via file watcher)
 * - When a .md file is created/modified/deleted
 * - Parse the file into frontmatter and body (two separate pieces)
 * - Use the serializer to combine frontmatter and body back into a complete row
 * - Update YJS with granular diffs
 *
 * Loop prevention flags ensure these two directions don't trigger each other infinitely.
 * Without them, we'd get stuck in an infinite loop:
 * 1. YJS change -> serializer creates frontmatter+body -> writes markdown file -> triggers file watcher
 * 2. File watcher -> parses frontmatter+body -> serializer creates row -> updates YJS -> triggers YJS observer
 * 3. YJS observer -> serializer creates frontmatter+body -> writes markdown file -> back to step 1
 *
 * The flags break the cycle by ensuring changes only flow in one direction at a time.
 *
 * Expected directory structure (with default path functions):
 * ```
 * {rootDir}/
 *   {tableName}/
 *     {row-id}.md
 *     {row-id}.md
 *   {tableName}/
 *     {row-id}.md
 * ```
 *
 * @param context - Index context (workspace ID, database, storage directory)
 * @param context.id - Workspace ID (required)
 * @param context.db - Epicenter database instance (required)
 * @param context.storageDir - Resolved storage directory from epicenter config (required)
 * @param config - Optional markdown configuration
 * @param config.directory - Optional directory for markdown files (defaults to `{workspaceId}`, resolved relative to storageDir)
 * @param config.pathToTableAndId - Optional function to extract table name and ID from file paths (defaults to `{tableName}/{id}.md`)
 * @param config.tableAndIdToPath - Optional function to build file paths from table name and ID (defaults to `{tableName}/{id}.md`)
 * @param config.serializers - Optional custom serializers per table (defaults to all fields in frontmatter)
 *
 * **Storage**: By default, stores markdown files in `{storageDir}/{workspaceId}/`
 *
 * @example Minimal usage with all defaults
 * ```typescript
 * indexes: {
 *   markdown: markdownIndex  // Stores in {storageDir}/{workspaceId}/
 * }
 * ```
 *
 * @example Custom table config - combining title and body in markdown body
 * ```typescript
 * import path from 'node:path';
 * import { Ok } from 'wellcrafted/result';
 *
 * indexes: {
 *   markdown: (context) => markdownIndex(context, {
 *     tables: {
 *       posts: {
 *         directory: './blog-posts', // optional, defaults to 'posts'
 *         serialize: ({ row, context }) => ({
 *           frontmatter: { tags: row.tags, published: row.published },
 *           body: `# ${row.title}\n\n${row.content || ''}`,
 *           filename: `${row.id}.md`
 *         }),
 *         deserialize: ({ frontmatter, body, filename, context }) => {
 *           const id = path.basename(filename, '.md');
 *           const lines = body.split('\n');
 *           const title = lines[0]?.replace(/^# /, '') || '';
 *           const bodyContent = lines.slice(2).join('\n');
 *           return Ok({ id, title, tags: frontmatter.tags, published: frontmatter.published, content: bodyContent });
 *         }
 *       }
 *     }
 *   })
 * }
 * ```
 */
export const markdownIndex = (<TSchema extends WorkspaceSchema>(
	context: IndexContext<TSchema>,
	config: MarkdownIndexConfig<TSchema> = {},
) => {
	const { id, db, storageDir } = context;
	const {
		directory = `./${id}`,
		tables: tableConfigs = {},
	} = config;
	// Require Node.js environment with filesystem access
	if (!storageDir) {
		throw new Error(
			'Markdown index requires Node.js environment with filesystem access',
		);
	}

	// Resolve workspace directory to absolute path
	// If directory is relative, resolve it relative to storageDir
	// If directory is absolute, use it as-is
	const absoluteWorkspaceDir = path.resolve(
		storageDir,
		directory,
	) as AbsolutePath;

	/**
	 * Resolve a table's directory to an absolute path
	 *
	 * @param tableName - Name of the table
	 * @param tableDirectory - Optional directory from table config (defaults to table name)
	 * @returns Absolute path to the table's directory
	 */
	function resolveTableDirectory(
		tableName: string,
		tableDirectory?: string,
	): AbsolutePath {
		const dir = tableDirectory ?? tableName;

		// If the table directory is absolute, use it as-is
		// Otherwise, resolve it relative to the workspace directory
		return path.resolve(absoluteWorkspaceDir, dir) as AbsolutePath;
	}

	/**
	 * Find which table a file belongs to based on its absolute path
	 *
	 * @param absoluteFilePath - Absolute path to the file
	 * @returns Object with tableName and filename, or null if no table matches
	 */
	function findTableForFile(absoluteFilePath: string): {
		tableName: string;
		filename: string;
	} | null {
		for (const tableName of db.getTableNames()) {
			const tableConfig = tableConfigs[tableName];
			const tableDir = resolveTableDirectory(tableName, tableConfig?.directory);

			// Check if the file is within this table's directory
			const relativePath = path.relative(tableDir, absoluteFilePath);

			// If relative path doesn't start with '..' or '/', it's within the directory
			if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
				return {
					tableName,
					filename: relativePath,
				};
			}
		}

		return null;
	}

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

	/**
	 * Shared filename tracking map
	 *
	 * Tracks the mapping of row IDs to filenames for each table.
	 * This is used to:
	 * 1. Detect filename changes when rows are updated (to delete old files)
	 * 2. Find row IDs when files are deleted (to delete corresponding YJS rows)
	 *
	 * Structure: tableName → rowId → filename
	 */
	const rowFilenames = new Map<string, Map<string, string>>();

	// Set up observers for each table
	const unsubscribers = registerYJSObservers({
		db,
		workspaceDir: absoluteWorkspaceDir,
		tableConfigs,
		resolveTableDirectory,
		syncCoordination,
	});

	// Set up file watcher for bidirectional sync
	const watcher = registerFileWatcher({
		db,
		workspaceDir: absoluteWorkspaceDir,
		tableConfigs,
		resolveTableDirectory,
		findTableForFile,
		syncCoordination,
	});

	return defineIndexExports({
		destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
			watcher.close();
		},

		/**
		 * Pull: Sync from YJS to Markdown (replace all markdown files with current YJS data)
		 */
		pullToMarkdown: defineQuery({
			description:
				'Pull all YJS data to markdown files (deletes existing files and writes fresh copies)',
			handler: async () => {
				return tryAsync({
					try: async () => {
						syncCoordination.isProcessingYJSChange = true;

						// Find and delete all markdown files in table directories
						const entries = await readdir(absoluteWorkspaceDir, {
							recursive: true,
							withFileTypes: true,
						});

						for (const entry of entries) {
							if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

							// Build absolute path
							const fullPath = path.join(
								entry.parentPath ?? entry.path,
								entry.name,
							) as AbsolutePath;

							// Check if this file belongs to any table
							const tableInfo = findTableForFile(fullPath);
							if (!tableInfo) continue; // Skip files that don't belong to any table

							// Delete the file
							const { error } = await deleteMarkdownFile({
								filePath: fullPath,
							});
							if (error) {
								console.warn(
									`Failed to delete markdown file ${fullPath} during pull:`,
									error,
								);
							}
						}

						// Write all current YJS rows to markdown files
						for (const tableName of db.getTableNames()) {
							const tableSchema = db.schema[tableName];
							if (!tableSchema) {
								throw new Error(`Schema for table "${tableName}" not found`);
							}

							const schemaWithValidation =
								createTableSchemaWithValidation(tableSchema);
							const tableConfig =
								tableConfigs[tableName] ??
								createDefaultTableConfig(schemaWithValidation);

							const tableDir = resolveTableDirectory(
								tableName,
								tableConfig.directory,
							);

							const results = db.tables[tableName].getAll();
							const validRows = results
								.filter((r) => r.status === 'valid')
								.map((r) => r.row);

							for (const row of validRows) {
								const serializedRow = row.toJSON();
								const { frontmatter, body, filename } = tableConfig.serialize({
									row: serializedRow,
									context: {
										tableName,
										schema: schemaWithValidation,
									},
								});
								const filePath = path.join(tableDir, filename) as AbsolutePath;

								const { error } = await writeMarkdownFile({
									filePath,
									frontmatter,
									body,
								});
								if (error) {
									console.warn(
										`Failed to write markdown file ${filePath} during pull:`,
										error,
									);
								}
							}
						}

						syncCoordination.isProcessingYJSChange = false;
					},
					catch: (error) => {
						syncCoordination.isProcessingYJSChange = false;
						return IndexErr({
							message: `Markdown index pull failed: ${extractErrorMessage(error)}`,
							context: { operation: 'pull' },
						});
					},
				});
			},
		}),

		/**
		 * Push: Sync from Markdown to YJS (replace all YJS data with current markdown files)
		 */
		pushFromMarkdown: defineQuery({
			description:
				'Push all markdown files into YJS (clears YJS tables and imports from files)',
			handler: async () => {
				return tryAsync({
					try: async () => {
						syncCoordination.isProcessingFileChange = true;

						// Clear all YJS tables
						db.transact(() => {
							for (const tableName of db.getTableNames()) {
								db.tables[tableName].clear();
							}
						});

						// Find all markdown files
						const entries = await readdir(absoluteWorkspaceDir, {
							recursive: true,
							withFileTypes: true,
						});

						// Track diagnostics for files that fail to process
						const diagnostics: MarkdownIndexError[] = [];

						for (const entry of entries) {
							if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

							// Build absolute path
							const fullPath = path.join(
								entry.parentPath ?? entry.path,
								entry.name,
							) as AbsolutePath;

							// Find which table this file belongs to
							const tableInfo = findTableForFile(fullPath);
							if (!tableInfo) {
								// File doesn't belong to any table, skip it
								continue;
							}

							const { tableName, filename } = tableInfo;

							// Get table and schema
							const table = db.tables[tableName];
							const tableSchema = db.schema[tableName] as
								| TSchema[keyof TSchema & string]
								| undefined;

							if (!table || !tableSchema) {
								console.warn(
									`Push: Unknown table "${tableName}" from file ${fullPath}`,
								);
								continue;
							}

							// Create schema with validation methods
							const schemaWithValidation =
								createTableSchemaWithValidation(tableSchema);

							// Get table config (use default if not provided)
							const tableConfig =
								tableConfigs[tableName] ??
								createDefaultTableConfig(schemaWithValidation);

							// Parse markdown file
							const parseResult = await parseMarkdownFile(fullPath);

							if (parseResult.error) {
								// Convert MarkdownError to MarkdownIndexError for diagnostics
								diagnostics.push(
									MarkdownIndexError({
										message: `Failed to parse markdown file: ${parseResult.error.message}`,
										context: { filePath: fullPath, cause: parseResult.error },
									}),
								);
								console.warn(
									`Failed to parse markdown file ${fullPath} during push:`,
									parseResult.error,
								);
								continue;
							}

							const { data: frontmatter, body } = parseResult.data;

							// Deserialize using the table config
							const { data: row, error: deserializeError } =
								tableConfig.deserialize({
									frontmatter,
									body,
									filename,
									context: {
										tableName,
										schema: schemaWithValidation,
										filePath: fullPath,
									},
								});

							if (deserializeError) {
								diagnostics.push(deserializeError);
								console.warn(
									`Skipping markdown file ${fullPath}: ${deserializeError.message}`,
								);
								continue;
							}

							// Insert into YJS
							const insertResult = table.insert(row);
							if (insertResult.error) {
								console.warn(
									`Failed to insert row ${row.id} from markdown into YJS table ${tableName}:`,
									insertResult.error,
								);
							}
						}

						// Write diagnostics to file
						if (diagnostics.length > 0) {
							const diagnosticsPath = path.join(
								storageDir,
								'.epicenter',
								`${id}-diagnostics.json`,
							);

							// Bun.write creates parent directories by default
							await Bun.write(
								diagnosticsPath,
								JSON.stringify(
									{
										timestamp: new Date().toISOString(),
										errors: diagnostics,
									},
									null,
									2,
								),
							);
						}

						syncCoordination.isProcessingFileChange = false;
					},
					catch: (error) => {
						syncCoordination.isProcessingFileChange = false;
						return IndexErr({
							message: `Markdown index push failed: ${extractErrorMessage(error)}`,
							context: { operation: 'push' },
						});
					},
				});
			},
		}),
	});
}) satisfies Index;

/**
 * Create default table config
 *
 * Default behavior:
 * - Directory: table name
 * - Serialize: All row fields → frontmatter, empty body, filename "{id}.md"
 * - Deserialize: Extract ID from filename, all frontmatter fields → row with validation
 */
function createDefaultTableConfig<TTableSchema extends TableSchema>(
	schemaWithValidation: TableSchemaWithValidation<TTableSchema>,
): TableMarkdownConfig<TTableSchema> {
	return {
		serialize: ({ row }) => ({
			frontmatter: row,
			body: '',
			filename: `${row.id}.md`,
		}),
		deserialize: ({ frontmatter, body, filename, context }) => {
			// Extract ID from filename (strip .md extension)
			const id = path.basename(filename, '.md');

			// Combine id with frontmatter
			const data = {
				id,
				...frontmatter,
			};

			// Validate using schema.validateUnknown
			const result = context.schema.validateUnknown(data);

			switch (result.status) {
				case 'valid':
					return Ok(result.row);

				case 'schema-mismatch':
					return MarkdownIndexErr({
						message: `Schema mismatch for row ${id}`,
						context: { filePath: context.filePath, id, reason: result.reason },
					});

				case 'invalid-structure':
					return MarkdownIndexErr({
						message: `Invalid structure for row ${id}`,
						context: { filePath: context.filePath, id, reason: result.reason },
					});
			}
		},
	};
}

/**
 * Register YJS observers to sync changes from YJS to markdown files
 *
 * When rows are added/updated/deleted in YJS, this writes the changes to corresponding
 * markdown files on disk. Coordinates with the file watcher through shared state to
 * prevent infinite sync loops.
 *
 * @param db - Database instance
 * @param workspaceDir - Absolute workspace directory
 * @param tableConfigs - Per-table markdown configuration
 * @param resolveTableDirectory - Function to resolve table directory
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns Array of unsubscribe functions for cleanup
 */
function registerYJSObservers<TSchema extends WorkspaceSchema>({
	db,
	workspaceDir,
	tableConfigs,
	resolveTableDirectory,
	syncCoordination,
}: {
	db: Db<TSchema>;
	workspaceDir: AbsolutePath;
	tableConfigs: TableConfigs<TSchema>;
	resolveTableDirectory: (tableName: string, tableDirectory?: string) => AbsolutePath;
	syncCoordination: SyncCoordination;
}): Array<() => void> {
	const unsubscribers: Array<() => void> = [];

	// Track filename for each row to detect filename changes
	const rowFilenames = new Map<string, Map<string, string>>();

	for (const tableName of db.getTableNames()) {
		const table = db.tables[tableName];
		if (!table) {
			throw new Error(`Table "${tableName}" not found`);
		}

		const tableSchema = db.schema[tableName];
		if (!tableSchema) {
			throw new Error(`Schema for table "${tableName}" not found`);
		}

		// Create schema with validation methods
		const schemaWithValidation = createTableSchemaWithValidation(tableSchema);

		// Get table config (use default if not provided)
		const tableConfig =
			tableConfigs[tableName] ?? createDefaultTableConfig(schemaWithValidation);

		// Get the table's directory
		const tableDir = resolveTableDirectory(tableName, tableConfig.directory);

		// Initialize filename tracking for this table
		if (!rowFilenames.has(tableName)) {
			rowFilenames.set(tableName, new Map());
		}
		const filenameMap = rowFilenames.get(tableName)!;

		/**
		 * Get the absolute file path for a row
		 */
		function getMarkdownFilePath(row: SerializedRow<TableSchema>): {
			filePath: AbsolutePath;
			filename: string;
		} {
			const { filename } = tableConfig.serialize({
				row,
				context: {
					tableName,
					schema: schemaWithValidation,
				},
			});
			const filePath = path.join(tableDir, filename) as AbsolutePath;
			return { filePath, filename };
		}

		/**
		 * Write a YJS row to markdown file
		 */
		async function writeRowToMarkdown<TTableSchema extends TableSchema>(
			row: Row<TTableSchema>,
		) {
			const serialized = row.toJSON();
			const { filePath, filename } = getMarkdownFilePath(serialized);

			// Check if filename changed
			const oldFilename = filenameMap.get(row.id);
			if (oldFilename && oldFilename !== filename) {
				// Filename changed, delete old file
				const oldFilePath = path.join(tableDir, oldFilename) as AbsolutePath;
				await deleteMarkdownFile({ filePath: oldFilePath });
			}

			// Update filename tracking
			filenameMap.set(row.id, filename);

			// Serialize row
			const { frontmatter, body } = tableConfig.serialize({
				row: serialized,
				context: {
					tableName,
					schema: schemaWithValidation,
				},
			});

			return writeMarkdownFile({
				filePath,
				frontmatter,
				body,
			});
		}

		const unsub = table.observe({
			onAdd: async (row) => {
				// Skip if this YJS change was triggered by a file change we're processing
				// (prevents markdown -> YJS -> markdown infinite loop)
				if (syncCoordination.isProcessingFileChange) return;

				syncCoordination.isProcessingYJSChange = true;
				const { error } = await writeRowToMarkdown(row);
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
				const { error } = await writeRowToMarkdown(row);
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

				// Get filename from tracking map
				const filename = filenameMap.get(id);
				if (filename) {
					const filePath = path.join(tableDir, filename) as AbsolutePath;
					const { error } = await deleteMarkdownFile({ filePath });
					filenameMap.delete(id); // Clean up tracking

					if (error) {
						console.error(
							IndexErr({
								message: `Markdown index onDelete failed for ${tableName}/${id}`,
								context: { tableName, id },
								cause: error,
							}),
						);
					}
				}

				syncCoordination.isProcessingYJSChange = false;
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
 * @param workspaceDir - Absolute workspace directory
 * @param tableConfigs - Per-table markdown configuration
 * @param resolveTableDirectory - Function to resolve table directory
 * @param findTableForFile - Function to find which table owns a file
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns File watcher instance for cleanup
 */
function registerFileWatcher<TSchema extends WorkspaceSchema>({
	db,
	workspaceDir,
	tableConfigs,
	resolveTableDirectory,
	findTableForFile,
	syncCoordination,
}: {
	db: Db<TSchema>;
	workspaceDir: AbsolutePath;
	tableConfigs: TableConfigs<TSchema>;
	resolveTableDirectory: (tableName: string, tableDirectory?: string) => AbsolutePath;
	findTableForFile: (absoluteFilePath: string) => {
		tableName: string;
		filename: string;
	} | null;
	syncCoordination: SyncCoordination;
}): FSWatcher {
	// Ensure the workspace directory exists before watching
	trySync({
		try: () => {
			mkdirSync(workspaceDir, { recursive: true });
		},
		catch: () => Ok(undefined),
	});

	const watcher = watch(
		workspaceDir,
		{ recursive: true },
		async (eventType, relativePath) => {
			// Skip if this file change was triggered by a YJS change we're processing
			// (prevents YJS -> markdown -> YJS infinite loop)
			if (syncCoordination.isProcessingYJSChange) return;

			// Skip non-markdown files
			if (!relativePath || !relativePath.endsWith('.md')) return;

			/**
			 * Construct the full absolute path to the file
			 */
			const filePath = path.join(workspaceDir, relativePath) as AbsolutePath;

			// Find which table this file belongs to
			const tableInfo = findTableForFile(filePath);
			if (!tableInfo) {
				// File doesn't belong to any table, skip it
				return;
			}

			const { tableName, filename } = tableInfo;

			// Get table and schema
			const table = db.tables[tableName];
			const tableSchema = db.schema[tableName];

			if (!table || !tableSchema) {
				console.warn(
					`File watcher: Unknown table "${tableName}" from file ${relativePath}`,
				);
				return;
			}

			// Create schema with validation methods
			const schemaWithValidation = createTableSchemaWithValidation(tableSchema);

			// Get table config (use default if not provided)
			const tableConfig =
				tableConfigs[tableName] ??
				createDefaultTableConfig(schemaWithValidation);

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
					 * File was deleted: We need to deserialize to extract the ID,
					 * then remove the row from YJS.
					 *
					 * However, since the file is deleted, we can't parse it.
					 * We need to track row IDs to filenames to handle deletions.
					 * For now, skip deletions if we can't determine the ID.
					 *
					 * TODO: Implement filename -> ID tracking for proper deletion handling
					 */
					syncCoordination.isProcessingFileChange = false;
					return;
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
			 * 1. Parse the markdown file
			 * 2. Deserialize to extract row data (including ID)
			 * 3. Update YJS with the parsed data using granular diffs
			 */
			if (eventType === 'change' || eventType === 'rename') {
				// Step 1: Parse markdown file
				const parseResult = await parseMarkdownFile(filePath);

				if (parseResult.error) {
					console.error(
						IndexErr({
							message: `Failed to parse markdown file ${tableName}`,
							context: { tableName, filePath },
							cause: parseResult.error,
						}),
					);
					syncCoordination.isProcessingFileChange = false;
					return;
				}

				const { data: frontmatter, body } = parseResult.data;

				// Step 2: Deserialize using the table config (handles validation and ID extraction)
				const { data: row, error: deserializeError } = tableConfig.deserialize({
					frontmatter,
					body,
					filename,
					context: {
						tableName,
						schema: schemaWithValidation,
						filePath,
					},
				});

				// If deserialize returns error, skip this file (invalid/unsupported)
				if (deserializeError) {
					console.warn(
						`Skipping markdown file ${tableName}/${filename}: ${deserializeError.message}`,
					);
					syncCoordination.isProcessingFileChange = false;
					return;
				}

				// Step 3: Insert or update the row in YJS
				if (table.has({ id: row.id })) {
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
