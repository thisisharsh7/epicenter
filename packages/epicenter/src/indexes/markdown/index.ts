import type { FSWatcher } from 'node:fs';
import { mkdirSync, watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync, trySync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import { IndexErr, IndexError } from '../../core/errors';
import {
	type Index,
	type IndexContext,
	defineIndexExports,
} from '../../core/indexes';
import type {
	Row,
	SerializedRow,
	TableSchema,
	TableValidators,
	WorkspaceSchema,
} from '../../core/schema';
import type { AbsolutePath } from '../../core/types';
import { createIndexLogger } from '../error-logger';
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
 * Bidirectional map API for tracking row ID ↔ filename relationships
 */
type BidirectionalMap = {
	/**
	 * Set or update a mapping in both directions
	 * @param params.rowId - The row identifier
	 * @param params.filename - The filename (without path)
	 */
	set(params: { rowId: string; filename: string }): void;

	/**
	 * Removes both the rowId→filename and filename→rowId entries.
	 * Use when a row is deleted from YJS.
	 *
	 * @param params.rowId - The row identifier to remove
	 */
	deleteByRowId(params: { rowId: string }): void;

	/**
	 * Removes both the filename→rowId and rowId→filename entries.
	 * Use when a file is deleted from disk, or when cleaning up an old
	 * filename before setting a new one for the same row.
	 *
	 * @param params.filename - The filename to remove
	 *
	 * @example
	 * // When a row's filename changes:
	 * const oldFilename = map.getFilename({ rowId: row.id });
	 * const needsOldFileCleanup = oldFilename && oldFilename !== newFilename;
	 * if (needsOldFileCleanup) {
	 *   await deleteMarkdownFile(path.join(tableConfig.directory, oldFilename));
	 *   map.deleteByFilename({ filename: oldFilename });
	 * }
	 * map.set({ rowId: row.id, filename: newFilename });
	 */
	deleteByFilename(params: { filename: string }): void;

	/**
	 * Get the filename for a given row ID
	 * @param params.rowId - The row identifier
	 * @returns The filename, or undefined if not found
	 */
	getFilename(params: { rowId: string }): string | undefined;

	/**
	 * Get the row ID for a given filename
	 * @param params.filename - The filename to look up
	 * @returns The row ID, or undefined if not found
	 */
	getRowId(params: { filename: string }): string | undefined;
};

/**
 * Create a bidirectional map for tracking row ID ↔ filename relationships
 *
 * Encapsulates the bidirectional tracking logic in a closure with methods
 * to manipulate the internal state. This consolidates all the repetitive
 * tracking operations into a single reusable abstraction.
 *
 * @returns An object with methods to interact with the bidirectional map
 */
function createBidirectionalMap(): BidirectionalMap {
	const rowToFile: Record<string, string> = {};
	const fileToRow: Record<string, string> = {};

	return {
		set({ rowId, filename }) {
			rowToFile[rowId] = filename;
			fileToRow[filename] = rowId;
		},

		deleteByRowId({ rowId }) {
			const filename = rowToFile[rowId];
			if (filename) {
				delete fileToRow[filename];
			}
			delete rowToFile[rowId];
		},

		deleteByFilename({ filename }) {
			const rowId = fileToRow[filename];
			if (rowId) {
				delete rowToFile[rowId];
			}
			delete fileToRow[filename];
		},

		getFilename({ rowId }) {
			return rowToFile[rowId];
		},

		getRowId({ filename }) {
			return fileToRow[filename];
		},
	};
}

/**
 * User-provided table configs (with optional serialize/deserialize)
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
	 *     serialize: ({ row, table }) => ({
	 *       frontmatter: { title: row.title, date: row.createdAt },
	 *       body: row.content,
	 *       filename: `${row.id}.md`
	 *     }),
	 *     deserialize: ({ frontmatter, body, filename, table }) => {
	 *       const id = path.basename(filename, '.md');
	 *       return Ok({ id, title: frontmatter.title, content: body });
	 *     }
	 *   }
	 * }
	 * ```
	 */
	tableConfigs?: TableConfigs<TWorkspaceSchema>;
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
	 * **Optional**: When not provided, uses default behavior:
	 * - All fields except id go to frontmatter
	 * - Empty body
	 * - Filename: `{id}.md`
	 *
	 * IMPORTANT: The filename MUST be a simple filename without path separators.
	 * The table's directory setting determines where the file is written.
	 *
	 * @param params.row - Row to serialize (already validated against schema)
	 * @param params.table.name - Table name (for context)
	 * @returns Frontmatter object, markdown body string, and simple filename (without directory path)
	 */
	serialize?(params: {
		row: SerializedRow<TTableSchema>;
		table: {
			name: string;
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
	 * **Optional**: When not provided, uses default behavior:
	 * - Extracts id from filename (strips .md extension)
	 * - Merges id with frontmatter fields
	 * - Validates against schema using validateUnknown
	 *
	 * The deserialize function is responsible for extracting the row ID from whatever source
	 * makes sense (frontmatter, filename, body content, etc.).
	 *
	 * @param params.frontmatter - Parsed YAML frontmatter as a plain object
	 * @param params.body - Markdown body content (text after frontmatter delimiters)
	 * @param params.filename - Simple filename only (validated to not contain path separators)
	 * @param params.table.name - Table name (for context)
	 * @param params.table.validators - Table validators with validation methods
	 * @returns Result with complete row (with id field), or error to skip this file
	 */
	deserialize?(params: {
		frontmatter: Record<string, unknown>;
		body: string;
		filename: string;
		table: {
			name: string;
			validators: TableValidators<TTableSchema>;
		};
	}): Result<SerializedRow<TTableSchema>, MarkdownIndexError>;
};

export const markdownIndex = (<TSchema extends WorkspaceSchema>(
	context: IndexContext<TSchema>,
	config: MarkdownIndexConfig<TSchema> = {},
) => {
	const { id, db, storageDir } = context;
	const { directory = `./${id}`, tableConfigs = {} as TableConfigs<TSchema> } =
		config;
	// Require Node.js environment with filesystem access
	if (!storageDir) {
		throw new Error(
			'Markdown index requires Node.js environment with filesystem access',
		);
	}

	// Create error logger for this index
	const logPath = path.join(
		storageDir,
		'.epicenter',
		'markdown',
		`${id}.log`,
	);
	const logger = createIndexLogger({ logPath });

	// Resolve workspace directory to absolute path
	// If directory is relative, resolve it relative to storageDir
	// If directory is absolute, use it as-is
	const absoluteWorkspaceDir = path.resolve(
		storageDir,
		directory,
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

	/**
	 * Bidirectional filename tracking: Maps row IDs ↔ filenames for each table
	 *
	 * Structure: `Record<tableName, BidirectionalMap>`
	 *
	 * This is critical because the file watcher only knows filenames when files are deleted.
	 * When a .md file is deleted, we can't read its content to extract the row ID.
	 * We MUST have a way to look up: "which row owned filename 'post.md'?"
	 *
	 * Used for two scenarios:
	 *
	 * **Scenario 1: Row Update with Filename Change**
	 * - Row "abc123" previously serialized to "draft.md"
	 * - Row is updated and now serializes to "published.md"
	 * - We need to know the OLD filename ("draft.md") so we can delete it
	 * - Flow: serialize() → get "published.md" → prepareFilenameChange() → delete "draft.md" → set()
	 * - Without this: orphaned "draft.md" remains on disk
	 *
	 * **Scenario 2: File Deletion (the critical case)**
	 * - User deletes "post.md" from disk
	 * - File watcher sees deletion event with filename "post.md"
	 * - File is gone, so we can't read its content to extract the row ID
	 * - We look up: getRowId("post.md") → "abc123" → delete row "abc123" from YJS
	 * - Without this: orphaned row "abc123" remains in YJS
	 *
	 * Both directions are O(1) lookups using plain object property access.
	 */
	const tracking: Record<string, BidirectionalMap> = {};

	/**
	 * Compute table metadata once and reuse everywhere
	 * This avoids prop-drilling db, tableConfigs, and absoluteWorkspaceDir
	 */
	const tables = db
		.getTableNames()
		.map((tableName) => {
			const table = db.tables[tableName];
			const tableSchema = db.schema[tableName];

			// Skip tables that don't exist
			if (!table || !tableSchema) return null;

			// biome-ignore lint/style/noNonNullAssertion: validators is created by createWorkspaceValidators which maps over the same schema object, so every key in schema has a corresponding key in validators
			const validators = db.validators[tableName]!;

			// Destructure user config with defaults
			const userConfig = tableConfigs[tableName];

			// Fully resolved table configuration type
			type ResolvedConfig = {
				serialize: NonNullable<
					TableMarkdownConfig<typeof tableSchema>['serialize']
				>;
				deserialize: NonNullable<
					TableMarkdownConfig<typeof tableSchema>['deserialize']
				>;
				directory: AbsolutePath;
			};

			// Merge user config with defaults and resolve directory to absolute path
			const tableConfig = {
				serialize: userConfig?.serialize ?? DEFAULT_TABLE_CONFIG.serialize,
				deserialize:
					userConfig?.deserialize ?? DEFAULT_TABLE_CONFIG.deserialize,
				directory: path.resolve(
					absoluteWorkspaceDir,
					userConfig?.directory ?? tableName,
				) as AbsolutePath,
			} satisfies ResolvedConfig;

			return {
				tableName,
				table,
				tableSchema,
				validators,
				tableConfig,
			};
		})
		.filter((item) => item !== null);

	/**
	 * Register YJS observers to sync changes from YJS to markdown files
	 *
	 * When rows are added/updated/deleted in YJS, this writes the changes to corresponding
	 * markdown files on disk. Coordinates with the file watcher through shared state to
	 * prevent infinite sync loops.
	 */
	const registerYJSObservers = () => {
		const unsubscribers: Array<() => void> = [];

		for (const { tableName, table, tableConfig } of tables) {
			// Initialize bidirectional tracking for this table
			if (!tracking[tableName]) {
				tracking[tableName] = createBidirectionalMap();
			}

			/**
			 * Write a YJS row to markdown file
			 */
			async function writeRowToMarkdown<TTableSchema extends TableSchema>(
				row: Row<TTableSchema>,
			) {
				const serialized = row.toJSON();

				// Serialize row once
				const { frontmatter, body, filename } = tableConfig.serialize({
					row: serialized,
					table: {
						name: tableName,
					},
				});

				// Construct file path
				const filePath = path.join(
					tableConfig.directory,
					filename,
				) as AbsolutePath;

				// Check if we need to clean up an old file before updating tracking
				const oldFilename = tracking[tableName].getFilename({ rowId: row.id });

				/**
				 * This is checking if there's an old filename AND if it's different
				 * from the new one. It's essentially checking: "has the filename
				 * changed?" and "do we need to clean up the old file?"
				 */
				const needsOldFileCleanup = oldFilename && oldFilename !== filename;
				if (needsOldFileCleanup) {
					const oldFilePath = path.join(
						tableConfig.directory,
						oldFilename,
					) as AbsolutePath;
					await deleteMarkdownFile({ filePath: oldFilePath });
					tracking[tableName].deleteByFilename({ filename: oldFilename });
				}

				// Update tracking in both directions
				tracking[tableName].set({ rowId: row.id, filename });

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
						await logger.log(
							IndexError({
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
						await logger.log(
							IndexError({
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

					// Get filename and delete file if it exists
					const filename = tracking[tableName].getFilename({ rowId: id });
					if (filename) {
						const filePath = path.join(
							tableConfig.directory,
							filename,
						) as AbsolutePath;
						const { error } = await deleteMarkdownFile({ filePath });

						// Clean up tracking in both directions
						tracking[tableName].deleteByRowId({ rowId: id });

						if (error) {
							await logger.log(
								IndexError({
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
	};

	/**
	 * Register file watchers to sync changes from markdown files to YJS
	 *
	 * Creates one watcher per table directory to monitor markdown file changes.
	 * When files are created/modified/deleted, updates the corresponding YJS rows.
	 * Coordinates with YJS observers through shared state to prevent infinite loops.
	 */
	const registerFileWatchers = () => {
		const watchers: FSWatcher[] = [];

		for (const {
			tableName,
			table,
			validators,
			tableConfig,
		} of tables) {
			// Ensure table directory exists
			trySync({
				try: () => {
					mkdirSync(tableConfig.directory, { recursive: true });
				},
				catch: () => Ok(undefined),
			});

			// Create watcher for this table's directory
			const watcher = watch(
				tableConfig.directory,
				async (eventType, filename) => {
					// Skip if this file change was triggered by a YJS change
					if (syncCoordination.isProcessingYJSChange) return;

					// Skip non-markdown files
					if (!filename || !filename.endsWith('.md')) return;

					syncCoordination.isProcessingFileChange = true;

					const filePath = path.join(
						tableConfig.directory,
						filename,
					) as AbsolutePath;

					// Handle file system events
					if (eventType === 'rename') {
						// Check if file was deleted or modified
						const file = Bun.file(filePath);
						const exists = await file.exists();

						if (!exists) {
							// File was deleted: find and delete the row
							const rowIdToDelete = tracking[tableName]?.getRowId({ filename });

							if (rowIdToDelete) {
								if (table.has({ id: rowIdToDelete })) {
									table.delete({ id: rowIdToDelete });
								}

								// Clean up tracking in both directions
								tracking[tableName].deleteByFilename({ filename });
							} else {
								await logger.log(
									MarkdownIndexError({
										message:
											'File deleted but row ID not found in tracking map',
										context: { tableName, filename },
									}),
								);
							}

							syncCoordination.isProcessingFileChange = false;
							return;
						}
						// File exists: fall through to change handling
					}

					// Process file modification (works for both 'change' and 'rename' with existing file)
					if (eventType === 'change' || eventType === 'rename') {
						// Parse markdown file
						const parseResult = await parseMarkdownFile(filePath);

						if (parseResult.error) {
							await logger.log(
								IndexError({
									message: `Failed to parse markdown file ${tableName}`,
									context: { tableName, filePath },
									cause: parseResult.error,
								}),
							);
							syncCoordination.isProcessingFileChange = false;
							return;
						}

						const { data: frontmatter, body } = parseResult.data;

						// Deserialize using the table config
						const { data: row, error: deserializeError } =
							tableConfig.deserialize({
								frontmatter,
								body,
								filename,
								table: {
									name: tableName,
									validators,
								},
							});

						if (deserializeError) {
							await logger.log(
								IndexError({
									message: `Skipping markdown file ${tableName}/${filename}: ${deserializeError.message}`,
									context: { tableName, filename },
									cause: deserializeError,
								}),
							);
							syncCoordination.isProcessingFileChange = false;
							return;
						}

						// Insert or update the row in YJS
						if (table.has({ id: row.id })) {
							table.update(row);
						} else {
							table.insert(row);
						}
					}

					syncCoordination.isProcessingFileChange = false;
				},
			);

			watchers.push(watcher);
		}

		return watchers;
	};

	// Set up observers and watchers
	const unsubscribers = registerYJSObservers();
	const watchers = registerFileWatchers();

	/**
	 * Initialize filename tracking map on startup
	 *
	 * This is CRITICAL for correctness after server restart:
	 *
	 * Problem: The rowFilenames map only exists in memory. When the server restarts,
	 * YJS data is restored from persistence, but the map is brand new and empty.
	 * Without initialization, the sync would break:
	 *
	 * 1. User edits a row in the app, triggering onUpdate
	 * 2. We compute newFilename = "published.md"
	 * 3. We look up: oldFilename = map.get(rowId) → undefined (map is empty!)
	 * 4. We think filename didn't change, so we don't delete old files
	 * 5. Result: Orphaned old files accumulate on disk
	 *
	 * Solution: Serialize all existing YJS rows on startup to rebuild the map.
	 * This one-time O(n) cost ensures the map is accurate for all future operations.
	 *
	 * Cost: O(n * serialize) where n = number of rows. Runs synchronously on startup.
	 * For 10,000 rows, calls serialize() 10,000 times. Usually acceptable.
	 */
	for (const { tableName, table, tableConfig } of tables) {
		// Initialize bidirectional tracking for this table
		if (!tracking[tableName]) {
			tracking[tableName] = createBidirectionalMap();
		}

		// Get all valid rows from YJS
		const results = table.getAll();
		const validRows = results
			.filter((r) => r.status === 'valid')
			.map((r) => r.row);

		// Serialize each row to extract filename and populate tracking in BOTH directions
		for (const row of validRows) {
			const serializedRow = row.toJSON();
			const { filename } = tableConfig.serialize({
				row: serializedRow,
				table: {
					name: tableName,
				},
			});

			// Store both directions for O(1) lookups
			tracking[tableName].set({ rowId: row.id, filename });
		}
	}

	return defineIndexExports({
		destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
			for (const watcher of watchers) {
				watcher.close();
			}
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

						// Process each table independently
						for (const { tableName, tableConfig } of tables) {
							// Delete all existing markdown files in this table's directory
							const entries = await readdir(tableConfig.directory, {
								recursive: false,
								withFileTypes: true,
							});

							for (const entry of entries) {
								if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

								const filePath = path.join(entry.name) as AbsolutePath;

								const { error } = await deleteMarkdownFile({ filePath });
								if (error) {
									console.warn(
										`Failed to delete markdown file ${filePath} during pull:`,
										error,
									);
								}
							}

							// Write all current YJS rows for this table to markdown files

							const results = db.tables[tableName].getAll();
							const validRows = results
								.filter((r) => r.status === 'valid')
								.map((r) => r.row);

							for (const row of validRows) {
								const serializedRow = row.toJSON();
								const { frontmatter, body, filename } = tableConfig.serialize({
									row: serializedRow,
									table: {
										name: tableName,
									},
								});

								const filePath = path.join(
									tableConfig.directory,
									filename,
								) as AbsolutePath;

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

						// Track diagnostics for files that fail to process
						const diagnostics: MarkdownIndexError[] = [];

						// Process each table independently
						for (const {
							tableName,
							table,
							validators,
							tableConfig,
						} of tables) {
							// Read all markdown files from this table's directory
							const entries = await readdir(tableConfig.directory, {
								withFileTypes: true,
							});

							for (const entry of entries) {
								if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

								const filename = entry.name;
								const fullPath = path.join(
									tableConfig.directory,
									filename,
								) as AbsolutePath;

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
										table: {
											name: tableName,
											validators,
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
 * Default table config
 *
 * Default behavior:
 * - Directory: table name
 * - Serialize: All row fields → frontmatter, empty body, filename "{id}.md"
 * - Deserialize: Extract ID from filename, all frontmatter fields → row with validation
 */
const DEFAULT_TABLE_CONFIG = {
	serialize: ({ row: { id, ...row } }) => ({
		frontmatter: row,
		body: '',
		filename: `${id}.md`,
	}),
	deserialize: ({ frontmatter, body: _, filename, table }) => {
		// Extract ID from filename (strip .md extension)
		const id = path.basename(filename, '.md');

		// Combine id with frontmatter
		const data = { id, ...frontmatter };

		// Validate using validators.validateUnknown
		const result = table.validators.validateUnknown(data);

		switch (result.status) {
			case 'valid':
				return Ok(result.row);

			case 'schema-mismatch':
				return MarkdownIndexErr({
					message: `Schema mismatch for row ${id}`,
					context: { filename, id, reason: result.reason },
				});

			case 'invalid-structure':
				return MarkdownIndexErr({
					message: `Invalid structure for row ${id}`,
					context: { filename, id, reason: result.reason },
				});
		}
	},
} satisfies TableMarkdownConfig<TableSchema>;
