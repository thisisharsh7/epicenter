import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import type { Brand } from 'wellcrafted/brand';
import { Ok, trySync } from 'wellcrafted/result';
import { IndexErr } from '../../core/errors';
import { defineIndex } from '../../core/indexes';
import type {
	Row,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from '../../core/schema';
import type { Db } from '../../db/core';
import { deleteMarkdownFile, writeMarkdownFile } from './operations';
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
 * Markdown index configuration
 */
export type MarkdownIndexConfig<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/**
	 * Absolute root path where markdown files should be stored
	 *
	 * Must be an absolute path. Use `path.join(import.meta.dirname, './vault')` to create
	 * an absolute path from a relative path at the call site.
	 *
	 * All file paths returned by tableAndIdToPath will be relative to this root path.
	 *
	 * Example:
	 * ```typescript
	 * rootPath: path.join(import.meta.dirname, './vault')
	 * ```
	 */
	rootPath: string;

	/**
	 * Extract table name and row ID from a relative file path.
	 * This is the inverse of tableAndIdToPath.
	 *
	 * @param params.path - Relative path to markdown file (e.g., "posts/my-post.md")
	 * @returns Object with tableName and id extracted from the path
	 *
	 * @example
	 * pathToTableAndId({ path: "posts/my-post.md" }) // → { tableName: "posts", id: "my-post" }
	 */
	pathToTableAndId(params: { path: string }): {
		tableName: string;
		id: string;
	};

	/**
	 * Build a relative file path from table name and row ID.
	 * This is the inverse of pathToTableAndId.
	 *
	 * The returned path should be relative to rootPath.
	 *
	 * @param params.id - Row ID
	 * @param params.tableName - Name of the table
	 * @returns Relative path where file should be written (e.g., "posts/my-post.md")
	 *
	 * @example
	 * tableAndIdToPath({ id: "my-post", tableName: "posts" })
	 * // → "posts/my-post.md"
	 */
	tableAndIdToPath(params: { id: string; tableName: string }): string;

	/**
	 * Optional custom serializers for tables
	 *
	 * Defines how rows are serialized to markdown and deserialized back.
	 * Tables without custom serializers use default behavior:
	 * - All row fields become frontmatter
	 * - Content body is empty string
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
	 *       content: row.body
	 *     }),
	 *     deserialize: ({ id, frontmatter, content }) => ({
	 *       id,
	 *       title: frontmatter.title,
	 *       body: content
	 *     })
	 *   }
	 * }
	 * ```
	 */
	serializers?: {
		[K in keyof TWorkspaceSchema]?: MarkdownSerializer<TWorkspaceSchema[K]>;
	};
};

/**
 * Custom serialization/deserialization behavior for a table
 *
 * Defines how rows are converted to markdown files and vice versa.
 * When not provided, uses default behavior (all fields in frontmatter, empty content).
 */
type MarkdownSerializer<TTableSchema extends TableSchema> = {
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
 * Create default serializer for a table
 *
 * Default behavior:
 * - Serialize: All row fields → frontmatter, empty content
 * - Deserialize: All frontmatter fields → row, ignore content
 */
function createDefaultSerializer<TTableSchema extends TableSchema>(
	schema: TTableSchema,
): MarkdownSerializer<TTableSchema> {
	return {
		serialize: ({ row }) => ({
			frontmatter: row,
			content: '',
		}),
		deserialize: ({ id, frontmatter }) => {
			// Simple passthrough: all frontmatter becomes row fields
			return {
				id,
				...frontmatter,
			} as SerializedRow<TTableSchema>;
		},
	};
}

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
 * @param config.rootPath - Absolute root path where markdown files should be stored.
 *                          Use path.join(import.meta.dirname, './vault') to create absolute paths.
 * @param config.serializers - Optional custom serializers per table. Uses defaults when omitted.
 */
export function markdownIndex<TSchema extends WorkspaceSchema>(
	db: Db<TSchema>,
	{
		rootPath,
		pathToTableAndId,
		tableAndIdToPath,
		serializers = {},
	}: MarkdownIndexConfig<TSchema>,
) {
	/**
	 * Assert rootPath as AbsolutePath for type safety
	 * Caller is responsible for ensuring the path is absolute
	 */
	const absoluteRootPath = rootPath as AbsolutePath;

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
		rootPath: absoluteRootPath,
		tableAndIdToPath,
		serializers,
		syncCoordination,
	});

	// Set up file watcher for bidirectional sync
	const watcher = registerFileWatcher({
		db,
		rootPath: absoluteRootPath,
		pathToTableAndId,
		serializers,
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
 * @param rootPath - Absolute root path where markdown files are stored
 * @param tableAndIdToPath - Function to build relative file paths from table name and ID
 * @param serializers - Optional custom serializers per table
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns Array of unsubscribe functions for cleanup
 */
function registerYJSObservers<TSchema extends WorkspaceSchema>({
	db,
	rootPath,
	tableAndIdToPath,
	serializers,
	syncCoordination,
}: {
	db: Db<TSchema>;
	rootPath: AbsolutePath;
	tableAndIdToPath: MarkdownIndexConfig<TSchema>['tableAndIdToPath'];
	serializers: MarkdownIndexConfig<TSchema>['serializers'];
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

		// Use custom serializer if provided, otherwise use default
		const serializer =
			serializers?.[tableName] ?? createDefaultSerializer(tableSchema);

		/**
		 * Get the absolute file path for a row ID
		 * Combines rootPath with the relative path from tableAndIdToPath
		 */
		function getMarkdownFilePath(id: string): AbsolutePath {
			const relativePath = tableAndIdToPath({ id, tableName });
			return path.join(rootPath, relativePath) as AbsolutePath;
		}

		/**
		 * Write a YJS row to markdown file
		 */
		async function writeRowToMarkdown<TTableSchema extends TableSchema>(
			row: Row<TTableSchema>,
		) {
			const serialized = row.toJSON();
			const filePath = getMarkdownFilePath(row.id);
			const { frontmatter, content } = serializer.serialize({
				row: serialized,
				tableName,
			});

			return writeMarkdownFile({
				filePath,
				frontmatter,
				content,
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
 * @param rootPath - Absolute root path where markdown files are stored
 * @param pathToTableAndId - Function to extract table name and ID from relative paths
 * @param serializers - Optional custom serializers per table
 * @param syncCoordination - Shared coordination state to prevent infinite loops
 * @returns File watcher instance for cleanup
 */
function registerFileWatcher<TSchema extends WorkspaceSchema>({
	db,
	rootPath,
	pathToTableAndId,
	serializers,
	syncCoordination,
}: {
	db: Db<TSchema>;
	rootPath: AbsolutePath;
	pathToTableAndId: MarkdownIndexConfig<TSchema>['pathToTableAndId'];
	serializers: MarkdownIndexConfig<TSchema>['serializers'];
	syncCoordination: SyncCoordination;
}): FSWatcher {
	// Ensure the directory exists before watching
	trySync({
		try: () => {
			mkdirSync(rootPath, { recursive: true });
		},
		catch: () => Ok(undefined),
	});

	const watcher = watch(
		rootPath,
		{ recursive: true },
		async (eventType, relativePath) => {
			// Skip if this file change was triggered by a YJS change we're processing
			// (prevents YJS -> markdown -> YJS infinite loop)
			if (syncCoordination.isProcessingYJSChange) return;

			// Skip non-markdown files
			if (!relativePath || !relativePath.endsWith('.md')) return;

			// Extract table name and row ID from the file path
			const { tableName, id } = pathToTableAndId({ path: relativePath });

			// Get table and schema
			const table = db.tables[tableName];
			const tableSchema = db.schema[tableName];

			if (!table || !tableSchema) {
				console.warn(
					`File watcher: Unknown table "${tableName}" from file ${relativePath}`,
				);
				return;
			}

			// Use custom serializer if provided, otherwise use default
			const serializer =
				serializers?.[tableName] ?? createDefaultSerializer(tableSchema);

			/**
			 * Construct the full absolute path to the file
			 *
			 * Since rootPath is already absolute (guaranteed by AbsolutePath brand),
			 * joining it with relativePath produces an absolute path.
			 */
			const filePath = path.join(rootPath, relativePath) as AbsolutePath;

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

				// Step 2: Deserialize using the serializer (handles validation and transformation)
				const row = serializer.deserialize({
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
