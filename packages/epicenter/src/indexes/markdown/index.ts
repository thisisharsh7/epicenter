import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Brand } from 'wellcrafted/brand';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, type Result, tryAsync, trySync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import type { Db } from '../../core/db/core';
import { IndexErr } from '../../core/errors';
import { getConfigDir } from '../../core/helpers';
import { type IndexContext, defineIndexExports } from '../../core/indexes';
import type {
	Row,
	SerializedRow,
	TableSchema,
	TableSchemaWithValidation,
	WorkspaceSchema,
} from '../../core/schema';
import { createTableSchemaWithValidation } from '../../core/schema';
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
 * Required types for internal functions (after defaults have been applied)
 *
 * These types represent the runtime reality that optional config parameters
 * have been given default values by the time they reach internal functions.
 */
type TableAndIdToPath = (params: { id: string; tableName: string }) => string;
type PathToTableAndId = (params: {
	path: string;
}) => Result<{ tableName: string; id: string }, MarkdownIndexError>;
type Serializers<TSchema extends WorkspaceSchema> = {
	[K in keyof TSchema]?: MarkdownSerializer<TSchema[K]>;
};

/**
 * Markdown index configuration
 */
export type MarkdownIndexConfig<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/**
	 * Storage path where markdown files should be stored.
	 *
	 * **Optional**: Defaults to the workspace `id` if not provided
	 * ```typescript
	 * // If workspace id is "blog", defaults to "./blog"
	 * markdownIndex({ id, db })
	 * ```
	 *
	 * **Three ways to specify the path**:
	 *
	 * **Option 1: Relative paths** (recommended): Resolved relative to directory containing epicenter.config.ts (where epicenter commands are run)
	 * ```typescript
	 * storagePath: './vault'      // → <configDir>/vault
	 * storagePath: '../content'   // → <configDir>/../content
	 * ```
	 *
	 * **Option 2: Absolute paths**: Used as-is, no resolution needed
	 * ```typescript
	 * storagePath: '/absolute/path/to/vault'
	 * ```
	 *
	 * **Option 3: Explicit control**: Use import.meta.dirname for precision (produces absolute paths)
	 * ```typescript
	 * storagePath: path.join(import.meta.dirname, './vault')
	 * ```
	 *
	 * All file paths returned by tableAndIdToPath will be relative to this storage path.
	 *
	 * @default `./${id}` where id is the workspace ID
	 */
	storagePath?: string;

	/**
	 * Extract table name and row ID from a relative file path.
	 * This is the inverse of tableAndIdToPath.
	 *
	 * **Optional**: Defaults to `defaultPathToTableAndId`, which expects the structure `{tableName}/{id}.md`
	 *
	 * @param params.path - Relative path to markdown file (e.g., "posts/my-post.md")
	 * @returns Result with tableName and id, or error to skip this file
	 *
	 * Returning an error indicates that this file path should be ignored by the file watcher.
	 * This is useful for skipping files that don't match your expected structure or are
	 * metadata files that shouldn't be processed as rows.
	 *
	 * @default defaultPathToTableAndId
	 *
	 * @example
	 * // Default behavior (when omitted):
	 * pathToTableAndId({ path: "posts/my-post.md" }) // → Ok({ tableName: "posts", id: "my-post" })
	 * pathToTableAndId({ path: ".DS_Store" }) // → Err (skip this file)
	 * pathToTableAndId({ path: "README.md" }) // → Err (skip this file)
	 *
	 * @example
	 * // Custom implementation:
	 * pathToTableAndId: ({ path }) => {
	 *   // Custom logic for nested folders or different file structures
	 *   const match = path.match(/^(\w+)\/blog\/(.+)\.md$/);
	 *   if (!match) return MarkdownIndexErr({ message: 'Invalid path structure', context: { path } });
	 *   return Ok({ tableName: match[1], id: match[2] });
	 * }
	 */
	pathToTableAndId?: PathToTableAndId;

	/**
	 * Build a relative file path from table name and row ID.
	 * This is the inverse of pathToTableAndId.
	 *
	 * **Optional**: Defaults to `defaultTableAndIdToPath`, which creates the structure `{tableName}/{id}.md`
	 *
	 * The returned path should be relative to storagePath.
	 *
	 * @param params.id - Row ID
	 * @param params.tableName - Name of the table
	 * @returns Relative path where file should be written (e.g., "posts/my-post.md")
	 *
	 * @default defaultTableAndIdToPath
	 *
	 * @example
	 * // Default behavior (when omitted):
	 * tableAndIdToPath({ id: "my-post", tableName: "posts" })
	 * // → "posts/my-post.md"
	 *
	 * @example
	 * // Custom implementation:
	 * tableAndIdToPath: ({ id, tableName }) => `${tableName}/blog/${id}.md`
	 */
	tableAndIdToPath?: TableAndIdToPath;

	/**
	 * Optional custom serializers for tables
	 *
	 * Defines how rows are serialized to markdown and deserialized back.
	 * Tables without custom serializers use default behavior:
	 * - All row fields become frontmatter
	 * - Markdown body is empty string
	 *
	 * Use custom serializers when you need:
	 * - A specific field to be the markdown body content
	 * - Custom transformation of field values
	 * - Validation or filtering during deserialization
	 *
	 * Example:
	 * ```typescript
	 * {
	 *   posts: {
	 *     serialize: ({ row }) => ({
	 *       frontmatter: { title: row.title, date: row.createdAt },
	 *       body: row.body
	 *     }),
	 *     deserialize: ({ id, frontmatter, body }) => ({
	 *       id,
	 *       title: frontmatter.title,
	 *       body: body
	 *     })
	 *   }
	 * }
	 * ```
	 */
	serializers?: Serializers<TWorkspaceSchema>;
};

/**
 * Custom serialization/deserialization behavior for a table
 *
 * Defines how rows are converted to markdown files and vice versa.
 * When not provided, uses default behavior (all fields in frontmatter, empty body).
 */
type MarkdownSerializer<TTableSchema extends TableSchema> = {
	/**
	 * Serialize a row to markdown frontmatter and body.
	 *
	 * @param params.row - Row to serialize (already validated against schema)
	 * @param params.tableName - Table name (for context)
	 * @returns Frontmatter object and markdown body string
	 */
	serialize(params: {
		row: SerializedRow<TTableSchema>;
		tableName: string;
	}): {
		frontmatter: Record<string, unknown>;
		body: string;
	};

	/**
	 * Deserialize markdown frontmatter and body back to a full row.
	 * Returns a complete row (including id) that can be directly inserted/updated in YJS.
	 * Returns error if the file should be skipped (e.g., invalid data, doesn't match schema).
	 *
	 * @param params.id - Row ID extracted from file path
	 * @param params.frontmatter - Parsed YAML frontmatter as a plain object
	 * @param params.body - Markdown body content (text after frontmatter delimiters)
	 * @param params.tableName - Table name (for context)
	 * @param params.schema - Table schema (for validation)
	 * @param params.filePath - File path (for error context)
	 * @returns Result with complete row (with id field), or error to skip this file
	 */
	deserialize(params: {
		id: string;
		frontmatter: Record<string, unknown>;
		body: string;
		tableName: string;
		schema: TTableSchema;
		filePath: string;
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
 * {storagePath}/
 *   {tableName}/
 *     {row-id}.md
 *     {row-id}.md
 *   {tableName}/
 *     {row-id}.md
 * ```
 *
 * @param context - Index context and markdown configuration
 * @param context.id - Workspace ID (required)
 * @param context.db - Epicenter database instance (required)
 * @param context.storagePath - Storage path where markdown files should be stored (optional, defaults to `./${id}`). Can be relative (resolved from directory containing epicenter.config.ts) or absolute.
 * @param context.pathToTableAndId - Optional function to extract table name and ID from file paths (defaults to `{tableName}/{id}.md`)
 * @param context.tableAndIdToPath - Optional function to build file paths from table name and ID (defaults to `{tableName}/{id}.md`)
 * @param context.serializers - Optional custom serializers per table (defaults to all fields in frontmatter)
 *
 * @example Minimal usage with all defaults
 * ```typescript
 * indexes: {
 *   markdown: markdownIndex
 * }
 * ```
 *
 * @example Explicit usage with all defaults
 * ```typescript
 * indexes: {
 *   markdown: ({ id, db }) => markdownIndex({ id, db })
 * }
 * ```
 *
 * @example Custom storage path
 * ```typescript
 * indexes: {
 *   markdown: ({ id, db }) => markdownIndex({
 *     id,
 *     db,
 *     storagePath: './content'
 *   })
 * }
 * ```
 *
 * @example Custom serializers - combining title and body in markdown body
 * ```typescript
 * indexes: {
 *   markdown: ({ id, db }) => markdownIndex({
 *     id,
 *     db,
 *     serializers: {
 *       posts: {
 *         serialize: ({ row }) => ({
 *           frontmatter: { tags: row.tags, published: row.published },
 *           body: `# ${row.title}\n\n${row.content || ''}`
 *         }),
 *         deserialize: ({ id, frontmatter, body }) => {
 *           const lines = body.split('\n');
 *           const title = lines[0]?.replace(/^# /, '') || '';
 *           const bodyContent = lines.slice(2).join('\n');
 *           return { id, title, tags: frontmatter.tags, published: frontmatter.published, content: bodyContent };
 *         }
 *       }
 *     }
 *   })
 * }
 * ```
 */
export function markdownIndex<TSchema extends WorkspaceSchema>({
	id,
	db,
	storagePath = `./${id}`,
	pathToTableAndId = defaultPathToTableAndId,
	tableAndIdToPath = defaultTableAndIdToPath,
	serializers = {},
}: IndexContext<TSchema> & MarkdownIndexConfig<TSchema>) {
	/**
	 * Directory containing epicenter.config.ts (where epicenter commands are run)
	 * Relative storage paths are resolved from here
	 */
	const configDir = getConfigDir();

	/**
	 * Resolve storagePath to absolute path using three-layer resolution pattern:
	 * 1. Relative paths (./content, ../vault) → resolved relative to directory containing epicenter.config.ts
	 * 2. Absolute paths (/absolute/path) → used as-is
	 * 3. Explicit paths (import.meta.dirname) → already absolute, pass through unchanged
	 */
	const absoluteStoragePath = (
		path.isAbsolute(storagePath)
			? storagePath
			: path.resolve(configDir, storagePath)
	) as AbsolutePath;

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
		storagePath: absoluteStoragePath,
		tableAndIdToPath,
		serializers,
		syncCoordination,
	});

	// Set up file watcher for bidirectional sync
	const watcher = registerFileWatcher({
		db,
		storagePath: absoluteStoragePath,
		pathToTableAndId,
		serializers,
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

						// Find and delete all markdown files that match our structure
						const entries = await readdir(absoluteStoragePath, {
							recursive: true,
							withFileTypes: true,
						});

						for (const entry of entries) {
							if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

							// Build relative path from root
							const relativePath = path.relative(
								absoluteStoragePath,
								path.join(entry.parentPath ?? entry.path, entry.name),
							);

							// Check if this file matches our structure
							const { error: pathError } = pathToTableAndId({
								path: relativePath,
							});
							if (pathError) continue; // Skip files that don't match

							// Delete the file
							const fullPath = path.join(absoluteStoragePath, relativePath);
							const { error } = await deleteMarkdownFile({
								filePath: fullPath,
							});
							if (error) {
								console.warn(
									`Failed to delete markdown file ${relativePath} during push:`,
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
							const serializer =
								serializers?.[tableName] ??
								createDefaultSerializer(schemaWithValidation);

							const results = db.tables[tableName].getAll();
							const validRows = results
								.filter((r) => r.status === 'valid')
								.map((r) => r.row);

							for (const row of validRows) {
								const serializedRow = row.toJSON();
								const relativePath = tableAndIdToPath({
									id: row.id,
									tableName,
								});
								const filePath = path.join(absoluteStoragePath, relativePath);
								const { frontmatter, body } = serializer.serialize({
									row: serializedRow,
									tableName,
								});

								const { error } = await writeMarkdownFile({
									filePath,
									frontmatter,
									body,
								});
								if (error) {
									console.warn(
										`Failed to write markdown file ${relativePath} during push:`,
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
							message: `Markdown index push failed: ${extractErrorMessage(error)}`,
							context: { operation: 'push' },
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
						const entries = await readdir(absoluteStoragePath, {
							recursive: true,
							withFileTypes: true,
						});

						// Track diagnostics for files that fail to process
						const diagnostics: MarkdownIndexError[] = [];

						for (const entry of entries) {
							if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

							// Build relative path from root
							const relativePath = path.relative(
								absoluteStoragePath,
								path.join(entry.parentPath ?? entry.path, entry.name),
							);

							// Extract table name and ID from path
							const { data: pathData, error: pathError } = pathToTableAndId({
								path: relativePath,
							});
							if (pathError) {
								diagnostics.push(pathError);
								continue; // Skip files that don't match
							}

							const { tableName, id } = pathData;

							// Get table and schema
							const table = db.tables[tableName];
							const tableSchema = db.schema[tableName] as
								| TSchema[keyof TSchema & string]
								| undefined;

							if (!table || !tableSchema) {
								console.warn(
									`Pull: Unknown table "${tableName}" from file ${relativePath}`,
								);
								continue;
							}

							// Create schema with validation methods
							const schemaWithValidation =
								createTableSchemaWithValidation(tableSchema);

							// Use custom serializer if provided, otherwise use default
							const serializer =
								serializers?.[tableName] ??
								createDefaultSerializer(schemaWithValidation);

							// Parse markdown file
							const fullPath = path.join(absoluteStoragePath, relativePath);
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
									`Failed to parse markdown file ${relativePath} during pull:`,
									parseResult.error,
								);
								continue;
							}

							const { data: frontmatter, body } = parseResult.data;

							// Deserialize using the serializer
							const { data: row, error: deserializeError } =
								serializer.deserialize({
									id,
									frontmatter,
									body,
									tableName,
									schema: tableSchema,
									filePath: fullPath,
								});

							if (deserializeError) {
								diagnostics.push(deserializeError);
								console.warn(
									`Skipping markdown file ${relativePath}: ${deserializeError.message}`,
								);
								continue;
							}

							// Insert into YJS
							const insertResult = table.insert(row);
							if (insertResult.error) {
								console.warn(
									`Failed to insert row ${id} from markdown into YJS table ${tableName}:`,
									insertResult.error,
								);
							}
						}

						// Write diagnostics to file
						if (diagnostics.length > 0) {
							const diagnosticsPath = path.join(
								configDir,
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
							message: `Markdown index pull failed: ${extractErrorMessage(error)}`,
							context: { operation: 'pull' },
						});
					},
				});
			},
		}),
	});
}

/**
 * Default implementation for pathToTableAndId
 *
 * Expects files in the structure: `{tableName}/{id}.md`
 *
 * @param params.path - Relative path to markdown file (e.g., "posts/my-post.md")
 * @returns Result with tableName and id, or error to skip this file
 *
 * @example
 * defaultPathToTableAndId({ path: "posts/my-post.md" }) // → Ok({ tableName: "posts", id: "my-post" })
 * defaultPathToTableAndId({ path: ".DS_Store" }) // → Err (skip this file)
 * defaultPathToTableAndId({ path: "README.md" }) // → Err (skip this file)
 * defaultPathToTableAndId({ path: "posts/subfolder/file.md" }) // → Err (unexpected structure)
 */
function defaultPathToTableAndId({
	path: filePath,
}: {
	path: string;
}): Result<{ tableName: string; id: string }, MarkdownIndexError> {
	const parts = filePath.split(path.sep);
	if (parts.length !== 2) {
		return MarkdownIndexErr({
			message: `Invalid path structure: expected {tableName}/{id}.md, got ${filePath}`,
			context: { filePath, reason: 'invalid-structure' },
		});
	}
	const [tableName, fileName] = parts as [string, string];
	const id = path.basename(fileName, '.md');
	return Ok({ tableName, id });
}

/**
 * Default implementation for tableAndIdToPath
 *
 * Creates files in the structure: `{tableName}/{id}.md`
 *
 * @param params.id - Row ID
 * @param params.tableName - Name of the table
 * @returns Relative path where file should be written (e.g., "posts/my-post.md")
 *
 * @example
 * defaultTableAndIdToPath({ id: "my-post", tableName: "posts" })
 * // → "posts/my-post.md"
 */
function defaultTableAndIdToPath({
	id,
	tableName,
}: {
	id: string;
	tableName: string;
}): string {
	return path.join(tableName, `${id}.md`);
}

/**
 * Create default serializer for a table
 *
 * Default behavior:
 * - Serialize: All row fields → frontmatter, empty body
 * - Deserialize: All frontmatter fields → row with validation (returns error if invalid)
 */
function createDefaultSerializer<TTableSchema extends TableSchema>(
	schemaWithValidation: TableSchemaWithValidation<TTableSchema>,
): MarkdownSerializer<TTableSchema> {
	return {
		serialize: ({ row }) => ({
			frontmatter: row,
			body: '',
		}),
		deserialize: ({ id, frontmatter, filePath }) => {
			// Combine id with frontmatter
			const data = {
				id,
				...frontmatter,
			};

			// Validate using schema.validateUnknown
			const result = schemaWithValidation.validateUnknown(data);

			switch (result.status) {
				case 'valid':
					return Ok(result.row);

				case 'schema-mismatch':
					return MarkdownIndexErr({
						message: `Schema mismatch for row ${id}`,
						context: { filePath, id, reason: result.reason },
					});

				case 'invalid-structure':
					return MarkdownIndexErr({
						message: `Invalid structure for row ${id}`,
						context: { filePath, id, reason: result.reason },
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
 * @param storagePath - Absolute storage path where markdown files are stored
 * @param tableAndIdToPath - Function to build relative file paths from table name and ID
 * @param serializers - Optional custom serializers per table
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns Array of unsubscribe functions for cleanup
 */
function registerYJSObservers<TSchema extends WorkspaceSchema>({
	db,
	storagePath,
	tableAndIdToPath,
	serializers,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: AbsolutePath;
	tableAndIdToPath: TableAndIdToPath;
	serializers: Serializers<TSchema>;
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

		// Create schema with validation methods
		const schemaWithValidation = createTableSchemaWithValidation(tableSchema);

		// Use custom serializer if provided, otherwise use default
		const serializer =
			serializers?.[tableName] ?? createDefaultSerializer(schemaWithValidation);

		/**
		 * Get the absolute file path for a row ID
		 * Combines storagePath with the relative path from tableAndIdToPath
		 */
		function getMarkdownFilePath(id: string): AbsolutePath {
			const relativePath = tableAndIdToPath({ id, tableName });
			return path.join(storagePath, relativePath) as AbsolutePath;
		}

		/**
		 * Write a YJS row to markdown file
		 */
		async function writeRowToMarkdown<TTableSchema extends TableSchema>(
			row: Row<TTableSchema>,
		) {
			const serialized = row.toJSON();
			const filePath = getMarkdownFilePath(row.id);
			const { frontmatter, body } = serializer.serialize({
				row: serialized,
				tableName,
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
				const filePath = getMarkdownFilePath(id);
				const { error } = await deleteMarkdownFile({ filePath });
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
 * @param storagePath - Absolute storage path where markdown files are stored
 * @param pathToTableAndId - Function to extract table name and ID from relative paths
 * @param serializers - Optional custom serializers per table
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns File watcher instance for cleanup
 */
function registerFileWatcher<TSchema extends WorkspaceSchema>({
	db,
	storagePath,
	pathToTableAndId,
	serializers,
	syncCoordination,
}: {
	db: Db<TSchema>;
	storagePath: AbsolutePath;
	pathToTableAndId: PathToTableAndId;
	serializers: Serializers<TSchema>;
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
			// Returns error if this file should be skipped
			const { data: pathData, error: pathError } = pathToTableAndId({
				path: relativePath,
			});
			if (pathError) return;

			const { tableName, id } = pathData;

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

			// Use custom serializer if provided, otherwise use default
			const serializer =
				serializers?.[tableName] ??
				createDefaultSerializer(schemaWithValidation);

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
					if (table.has({ id })) table.delete({ id });
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

				const { data: frontmatter, body } = parseResult.data;

				// Step 2: Deserialize using the serializer (handles validation and transformation)
				const { data: row, error: deserializeError } = serializer.deserialize({
					id,
					frontmatter,
					body,
					tableName,
					schema: tableSchema,
					filePath,
				});

				// If deserialize returns error, skip this file (invalid/unsupported)
				if (deserializeError) {
					console.warn(
						`Skipping markdown file ${tableName}/${id}: ${deserializeError.message}`,
					);
					syncCoordination.isProcessingFileChange = false;
					return;
				}

				// Step 3: Insert or update the row in YJS
				if (table.has({ id })) {
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
