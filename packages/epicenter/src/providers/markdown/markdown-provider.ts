import { mkdirSync } from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { tryAsync, trySync } from 'wellcrafted/result';
import { defineQuery } from '../../core/actions';
import { ProviderErr, ProviderError } from '../../core/errors';
import type { Provider, ProviderContext } from '../../core/provider.node';
import { defineProviderExports } from '../../core/provider.shared';
import type {
	Row,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from '../../core/schema';
import type { AbsolutePath } from '../../core/types';
import { createProviderLogger } from '../error-logger';
import { DEFAULT_TABLE_CONFIG, type TableMarkdownConfig } from './configs';
import { createDiagnosticsManager } from './diagnostics-manager';
import {
	deleteMarkdownFile,
	listMarkdownFiles,
	readMarkdownFile,
	writeMarkdownFile,
} from './io';

/**
 * Error types for markdown provider diagnostics
 * Used to track files that fail to process during indexing
 *
 * Context is optional since some errors (like read failures) may not
 * have all the structured data (fileName, id, reason) available.
 */
type MarkdownProviderContext = {
	fileName: string;
	id: string;
	reason: string;
};

export const { MarkdownProviderError, MarkdownProviderErr } = createTaggedError(
	'MarkdownProviderError',
).withContext<MarkdownProviderContext | undefined>();
export type MarkdownProviderError = ReturnType<typeof MarkdownProviderError>;

// Re-export config types and functions
export type { TableMarkdownConfig, WithBodyFieldOptions } from './configs';
export {
	DEFAULT_TABLE_CONFIG,
	defaultTableConfig,
	defineTableConfig,
	withBodyField,
	withTitleFilename,
} from './configs';

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
	 * Counter for concurrent YJS observers writing to disk.
	 * File watcher checks this and skips processing when > 0.
	 *
	 * We use a counter instead of a boolean because multiple async observers
	 * can be writing files concurrently. A boolean would cause race conditions:
	 * - Observer A sets flag = true, awaits write
	 * - Observer B sets flag = true, awaits write
	 * - Observer A completes, sets flag = false (BUG! B is still writing)
	 * - File watcher sees false, processes B's file event, creates loop
	 *
	 * With a counter:
	 * - Observer A increments to 1, awaits write
	 * - Observer B increments to 2, awaits write
	 * - Observer A completes, decrements to 1 (still > 0, protected)
	 * - Observer B completes, decrements to 0
	 */
	yjsWriteCount: number;
};

/**
 * Unidirectional map from row ID to filename
 *
 * Used to track the current filename for each row. This is needed to detect
 * filename changes when a row is updated (e.g., title change in withTitleFilename).
 *
 * The reverse direction (filename → rowId) is handled by parseFilename,
 * which extracts structured data (including the row ID) from the filename string.
 */
type RowToFilenameMap = Record<string, string>;

/**
 * Per-table markdown configuration.
 * Use factory functions like `defaultTableConfig()`, `withBodyField()`, or `withTitleFilename()`.
 */
type TableConfigs<TSchema extends WorkspaceSchema> = {
	[K in keyof TSchema]?: TableMarkdownConfig<TSchema[K]>;
};

/**
 * Markdown provider configuration
 */
export type MarkdownProviderConfig<
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	/**
	 * Workspace-level directory where markdown files should be stored.
	 *
	 * **Optional**: Defaults to the workspace `id` if not provided
	 * ```typescript
	 * // If workspace id is "blog", defaults to "<storageDir>/blog"
	 * markdownProvider({ id, db, storageDir })
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

	/**
	 * Enable verbose debug logging for troubleshooting file sync issues.
	 *
	 * When enabled, logs:
	 * - Every chokidar event (add, change, unlink)
	 * - Handler entry/exit with filename
	 * - Early returns (skipped files, duplicates, validation failures)
	 * - Sync coordination state (yjsWriteCount, isProcessingFileChange)
	 *
	 * Useful for debugging bulk file operations where some files don't sync.
	 *
	 * @default false
	 */
	debug?: boolean;
};

export const markdownProvider = (async <TSchema extends WorkspaceSchema>(
	context: ProviderContext<TSchema>,
	config: MarkdownProviderConfig<TSchema> = {},
) => {
	const { id, providerId, tables, storageDir, epicenterDir } = context;
	const { directory = `./${id}`, debug = false } = config;

	// Debug logger - no-op when debug is disabled
	const dbg = debug
		? (tag: string, msg: string, data?: Record<string, unknown>) => {
				const timestamp = new Date().toISOString().slice(11, 23);
				console.log(`[MD:${tag}] ${timestamp} ${msg}`, data ?? '');
			}
		: () => {};

	// User-provided table configs (sparse - only contains overrides, may be empty)
	// Access via userTableConfigs[tableName] returns undefined when user didn't provide config
	const userTableConfigs: TableConfigs<TSchema> = config.tableConfigs ?? {};
	// Require Node.js environment with filesystem access
	if (!storageDir || !epicenterDir) {
		throw new Error(
			'Markdown provider requires Node.js environment with filesystem access',
		);
	}

	// Workspace-specific directory for all provider artifacts
	// Structure: .epicenter/{workspaceId}/{providerId}.{suffix}
	const workspaceConfigDir = path.join(epicenterDir, id);

	// Create diagnostics manager for tracking validation errors (current state)
	const diagnostics = createDiagnosticsManager({
		diagnosticsPath: path.join(
			workspaceConfigDir,
			`${providerId}.diagnostics.json`,
		),
	});

	// Create logger for historical error record (append-only audit trail)
	const logger = createProviderLogger({
		logPath: path.join(workspaceConfigDir, `${providerId}.log`),
	});

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
	 * - Before YJS observers write files: increment yjsWriteCount
	 *   - File watcher checks this and skips processing when > 0
	 * - Before file watcher updates YJS: set isProcessingFileChange = true
	 *   - YJS observers check this and skip processing
	 */
	const syncCoordination: SyncCoordination = {
		isProcessingFileChange: false,
		yjsWriteCount: 0,
	};

	/**
	 * Filename tracking: Maps row IDs → filenames for each table
	 *
	 * Structure: `Record<tableName, Record<rowId, filename>>`
	 *
	 * This is needed to detect filename changes when a row is updated:
	 * - Row "abc123" previously serialized to "draft.md"
	 * - Row is updated and now serializes to "published.md"
	 * - We need to know the OLD filename ("draft.md") so we can delete it
	 * - Without this: orphaned "draft.md" remains on disk
	 *
	 * The reverse direction (filename → rowId) is handled by parseFilename,
	 * which extracts structured data (including the row ID) from the filename string. This works for:
	 * - File deletions: Parse filename to get ID, delete from Y.js
	 * - Orphan detection: Parse filename to get ID, check if row exists in Y.js
	 */
	const tracking: Record<string, RowToFilenameMap> = {};

	/**
	 * Build table configs by merging user configs with defaults.
	 *
	 * User configs are created via factory functions (defaultTableConfig, withBodyField, etc.)
	 * which always provide serialize/parseFilename/deserialize. If no config is provided for
	 * a table, DEFAULT_TABLE_CONFIG is used.
	 */
	const tableWithConfigs = tables.$tables().map((table) => {
		const userConfig = userTableConfigs[table.name];

		// Use user config or fall back to defaults
		const baseConfig = userConfig ?? DEFAULT_TABLE_CONFIG;

		// Resolve directory: user config > table name
		const directory = path.resolve(
			absoluteWorkspaceDir,
			baseConfig.directory ?? table.name,
		) as AbsolutePath;

		const tableConfig = {
			serialize: baseConfig.serialize,
			parseFilename: baseConfig.parseFilename,
			deserialize: baseConfig.deserialize,
			directory,
		};

		return { table, tableConfig };
	});

	/**
	 * Register YJS observers to sync changes from YJS to markdown files
	 *
	 * When rows are added/updated/deleted in YJS, this writes the changes to corresponding
	 * markdown files on disk. Coordinates with the file watcher through shared state to
	 * prevent infinite sync loops.
	 */
	const registerYJSObservers = () => {
		const unsubscribers: Array<() => void> = [];

		for (const { table, tableConfig } of tableWithConfigs) {
			// Initialize tracking map for this table
			if (!tracking[table.name]) {
				tracking[table.name] = {};
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
					// @ts-expect-error SerializedRow<TSchema[string]> is not assignable to SerializedRow<TTableSchema> due to union type from $tables() iteration
					row: serialized,
					// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableHelper<TSchema[string]> due to union type from $tables() iteration
					table,
				});

				// Construct file path
				const filePath = path.join(
					tableConfig.directory,
					filename,
				) as AbsolutePath;

				// Check if we need to clean up an old file before updating tracking
				const oldFilename = tracking[table.name]?.[row.id];

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
				}

				// Update tracking (rowId → filename)
				// biome-ignore lint/style/noNonNullAssertion: tracking is initialized at loop start for each table
				tracking[table.name]![row.id] = filename;

				return writeMarkdownFile({
					filePath,
					frontmatter,
					body,
				});
			}

			const unsub = table.observe({
				onAdd: async (result) => {
					// Skip if this YJS change was triggered by a file change we're processing
					// (prevents markdown -> YJS -> markdown infinite loop)
					if (syncCoordination.isProcessingFileChange) return;

					if (result.error) {
						// Handle validation errors with diagnostics + logger
						logger.log(
							ProviderError({
								message: `YJS observer onAdd: validation failed for ${table.name}`,
								context: result.error.context,
							}),
						);
						return;
					}

					const row = result.data;
					syncCoordination.yjsWriteCount++;
					const { error } = await writeRowToMarkdown(row);
					syncCoordination.yjsWriteCount--;

					if (error) {
						// Log I/O errors (operational errors, not validation errors)
						logger.log(
							ProviderError({
								message: `YJS observer onAdd: failed to write ${table.name}/${row.id}`,
								context: { tableName: table.name, rowId: row.id },
							}),
						);
					}
				},
				onUpdate: async (result) => {
					// Skip if this YJS change was triggered by a file change we're processing
					// (prevents markdown -> YJS -> markdown infinite loop)
					if (syncCoordination.isProcessingFileChange) return;

					if (result.error) {
						// Handle validation errors with diagnostics + logger
						logger.log(
							ProviderError({
								message: `YJS observer onUpdate: validation failed for ${table.name}`,
								context: result.error.context,
							}),
						);
						return;
					}

					const row = result.data;
					syncCoordination.yjsWriteCount++;
					const { error } = await writeRowToMarkdown(row);
					syncCoordination.yjsWriteCount--;

					if (error) {
						// Log I/O errors (operational errors, not validation errors)
						logger.log(
							ProviderError({
								message: `YJS observer onUpdate: failed to write ${table.name}/${row.id}`,
								context: { tableName: table.name, rowId: row.id },
							}),
						);
					}
				},
				onDelete: async (id) => {
					// Skip if this YJS change was triggered by a file change we're processing
					// (prevents markdown -> YJS -> markdown infinite loop)
					if (syncCoordination.isProcessingFileChange) return;

					syncCoordination.yjsWriteCount++;

					// Get filename and delete file if it exists
					const filename = tracking[table.name]?.[id];
					if (filename) {
						const filePath = path.join(
							tableConfig.directory,
							filename,
						) as AbsolutePath;
						const { error } = await deleteMarkdownFile({ filePath });

						// Clean up tracking
						// biome-ignore lint/style/noNonNullAssertion: tracking is initialized at loop start for each table
						delete tracking[table.name]![id];

						if (error) {
							// Log I/O errors (operational errors, not validation errors)
							logger.log(
								ProviderError({
									message: `YJS observer onDelete: failed to delete ${table.name}/${id}`,
									context: { tableName: table.name, rowId: id, filePath },
								}),
							);
						}
					}

					syncCoordination.yjsWriteCount--;
				},
			});
			unsubscribers.push(unsub);
		}

		return unsubscribers;
	};

	/**
	 * Register file watchers to sync changes from markdown files to YJS
	 *
	 * Uses chokidar for robust cross-platform file watching with:
	 * - awaitWriteFinish: Waits for files to be fully written before processing
	 * - atomic: Handles editor atomic writes (temp file → rename pattern)
	 *
	 * This solves race conditions with bulk operations (20+ files pasted at once)
	 * by ensuring files are stable before triggering sync events.
	 */
	const registerFileWatchers = () => {
		const watchers: FSWatcher[] = [];

		for (const { table, tableConfig } of tableWithConfigs) {
			// Ensure table directory exists
			const { error: mkdirError } = trySync({
				try: () => {
					mkdirSync(tableConfig.directory, { recursive: true });
				},
				catch: (error) =>
					ProviderErr({
						message: `Failed to create table directory: ${extractErrorMessage(error)}`,
						context: {
							tableName: table.name,
							directory: tableConfig.directory,
						},
					}),
			});

			if (mkdirError) {
				logger.log(mkdirError);
			}

			// Create chokidar watcher with robust configuration
			const watcher = chokidar.watch(tableConfig.directory, {
				// Core settings
				persistent: true,
				ignoreInitial: true, // Don't fire events for existing files (we already did initial scan)
				followSymlinks: true,
				cwd: tableConfig.directory,

				// Performance settings
				usePolling: false, // Event-based is more efficient on macOS/Linux
				depth: 0, // Only watch direct children (markdown files in table directory)

				// Critical for reliability with bulk operations
				// Waits for files to be fully written before emitting events
				awaitWriteFinish: {
					stabilityThreshold: 500, // File must be stable for 500ms
					pollInterval: 100, // Check every 100ms
				},

				// Handle atomic writes (temp file → rename pattern used by many editors)
				atomic: true,

				// Ignore non-markdown files and OS artifacts
				ignored: [
					/(^|[/\\])\../, // Dotfiles (.DS_Store, .git, etc.)
					/\.swp$/, // Vim swap files
					/~$/, // Editor backup files
					/\.tmp$/, // Temp files
					// Only watch .md files
					(filePath: string) => !filePath.endsWith('.md') && !filePath.endsWith(tableConfig.directory),
				],
			});

			// Helper: Process file add/change
			const handleFileAddOrChange = async (filePath: string) => {
				const filename = path.basename(filePath);
				dbg('HANDLER', `START ${table.name}/${filename}`, {
					yjsWriteCount: syncCoordination.yjsWriteCount,
					isProcessingFileChange: syncCoordination.isProcessingFileChange,
				});

				// Skip if this file change was triggered by a YJS change
				if (syncCoordination.yjsWriteCount > 0) {
					dbg('HANDLER', `SKIP ${table.name}/${filename} (yjsWriteCount > 0)`);
					return;
				}

				syncCoordination.isProcessingFileChange = true;

				try {
					const absolutePath = path.join(tableConfig.directory, filename) as AbsolutePath;

					// Read markdown file
					const parseResult = await readMarkdownFile(absolutePath);

					if (parseResult.error) {
						dbg('HANDLER', `FAIL ${table.name}/${filename} (read error)`, {
							error: parseResult.error.message,
						});
						const error = MarkdownProviderError({
							message: `Failed to read markdown file at ${absolutePath}: ${parseResult.error.message}`,
						});
						diagnostics.add({
							filePath: absolutePath,
							tableName: table.name,
							filename,
							error,
						});
						logger.log(
							ProviderError({
								message: `File watcher: failed to read ${table.name}/${filename}`,
								context: { filePath: absolutePath, tableName: table.name, filename },
							}),
						);
						return;
					}

					const { data: frontmatter, body } = parseResult.data;

					// Parse filename to extract structured data
					const parsed = tableConfig.parseFilename(filename);
					if (!parsed) {
						dbg('HANDLER', `FAIL ${table.name}/${filename} (parse error)`);
						const error = MarkdownProviderError({
							message: `Failed to parse filename: ${filename}`,
						});
						diagnostics.add({
							filePath: absolutePath,
							tableName: table.name,
							filename,
							error,
						});
						logger.log(
							ProviderError({
								message: `File watcher: failed to parse filename ${table.name}/${filename}`,
								context: { filePath: absolutePath, tableName: table.name, filename },
							}),
						);
						return;
					}

					// Deserialize using the table config
					const { data: row, error: deserializeError } =
						tableConfig.deserialize({
							frontmatter,
							body,
							filename,
							parsed,
							// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableHelper<TSchema[string]> due to union type from $tables() iteration
							table,
						});

					if (deserializeError) {
						dbg('HANDLER', `FAIL ${table.name}/${filename} (validation error)`, {
							error: deserializeError.message,
						});
						diagnostics.add({
							filePath: absolutePath,
							tableName: table.name,
							filename,
							error: deserializeError,
						});
						logger.log(
							ProviderError({
								message: `File watcher: validation failed for ${table.name}/${filename}`,
								context: { filePath: absolutePath, tableName: table.name, filename },
							}),
						);
						return;
					}

					const validatedRow = row as SerializedRow<TSchema[keyof TSchema & string]>;

					// Success: remove from diagnostics if it was previously invalid
					diagnostics.remove({ filePath: absolutePath });

					// Check for duplicate files: same row ID but different filename
					// This happens when users copy-paste markdown files in Finder
					const existingFilename = tracking[table.name]?.[validatedRow.id];

					if (existingFilename && existingFilename !== filename) {
						// This is a duplicate file with the same ID - delete it
						dbg('HANDLER', `SKIP ${table.name}/${filename} (duplicate of ${existingFilename})`, {
							rowId: validatedRow.id,
						});
						logger.log(
							ProviderError({
								message: `Duplicate file detected: ${filename} has same ID as ${existingFilename}, deleting duplicate`,
								context: { tableName: table.name, filename, rowId: validatedRow.id },
							}),
						);
						await deleteMarkdownFile({ filePath: absolutePath });
						return;
					}

					// Update tracking (rowId → filename) and upsert to Y.js
					// biome-ignore lint/style/noNonNullAssertion: tracking is initialized at loop start for each table
					tracking[table.name]![validatedRow.id] = filename;
					table.upsert(validatedRow);
					dbg('HANDLER', `SUCCESS ${table.name}/${filename}`, { rowId: validatedRow.id });
				} finally {
					syncCoordination.isProcessingFileChange = false;
				}
			};

			// Helper: Process file deletion
			const handleFileUnlink = (filePath: string) => {
				// Skip if this file change was triggered by a YJS change
				if (syncCoordination.yjsWriteCount > 0) return;

				syncCoordination.isProcessingFileChange = true;

				try {
					const filename = path.basename(filePath);

					// Parse filename to extract row ID (single source of truth)
					const parsed = tableConfig.parseFilename(filename);
					const rowIdToDelete = parsed?.id;
					dbg('HANDLER', `UNLINK ${table.name}/${filename}`, {
						extractedRowId: rowIdToDelete ?? 'undefined',
					});

					if (rowIdToDelete) {
						if (table.has({ id: rowIdToDelete })) {
							table.delete({ id: rowIdToDelete });
							dbg('HANDLER', `UNLINK deleted row ${table.name}/${rowIdToDelete}`);
						} else {
							dbg('HANDLER', `UNLINK row not in Y.js ${table.name}/${rowIdToDelete}`);
						}

						// Clean up tracking (if it existed)
						// biome-ignore lint/style/noNonNullAssertion: tracking is initialized at loop start for each table
						delete tracking[table.name]![rowIdToDelete];
					} else {
						logger.log(
							ProviderError({
								message: `File deleted but could not parse row ID from ${table.name}/${filename}`,
								context: { tableName: table.name, filename },
							}),
						);
					}
				} finally {
					syncCoordination.isProcessingFileChange = false;
				}
			};

			// Register event handlers with debug logging for raw events
			watcher
				.on('add', (filePath) => {
					dbg('CHOKIDAR', `add: ${table.name}/${path.basename(filePath)}`);
					handleFileAddOrChange(filePath);
				})
				.on('change', (filePath) => {
					dbg('CHOKIDAR', `change: ${table.name}/${path.basename(filePath)}`);
					handleFileAddOrChange(filePath);
				})
				.on('unlink', (filePath) => {
					dbg('CHOKIDAR', `unlink: ${table.name}/${path.basename(filePath)}`);
					handleFileUnlink(filePath);
				})
				.on('error', (error) => {
					dbg('CHOKIDAR', `error: ${table.name}`, { error: extractErrorMessage(error) });
					logger.log(
						ProviderError({
							message: `File watcher error for ${table.name}: ${extractErrorMessage(error)}`,
							context: { tableName: table.name, directory: tableConfig.directory },
						}),
					);
				})
				.on('ready', () => {
					dbg('CHOKIDAR', `ready: ${table.name} watching ${tableConfig.directory}`);
				});

			watchers.push(watcher);
		}

		return watchers;
	};

	/**
	 * Validate all markdown files and rebuild diagnostics
	 *
	 * Scans every markdown file, validates it against the schema, and updates diagnostics
	 * to reflect current state. Used in three places:
	 * 1. Initial scan on startup (before watchers start)
	 * 2. Manual scan via scanForErrors query
	 * 3. Push operation after clearing YJS tables
	 *
	 * @param params.operation - Optional operation name for logging context
	 */
	async function validateAllMarkdownFiles(params?: {
		operation?: string;
	}): Promise<void> {
		const operationPrefix = params?.operation ? `${params.operation}: ` : '';

		diagnostics.clear();

		for (const { table, tableConfig } of tableWithConfigs) {
			const filePaths = await listMarkdownFiles(tableConfig.directory);

			await Promise.all(
				filePaths.map(async (filePath) => {
					const filename = path.basename(filePath);

					// Read markdown file
					const parseResult = await readMarkdownFile(filePath);

					if (parseResult.error) {
						// Track read error in diagnostics (current state)
						const error = MarkdownProviderError({
							message: `Failed to read markdown file at ${filePath}: ${parseResult.error.message}`,
						});
						diagnostics.add({
							filePath,
							tableName: table.name,
							filename,
							error,
						});
						// Log to historical record
						logger.log(
							ProviderError({
								message: `${operationPrefix}failed to read ${table.name}/${filename}`,
								context: { filePath, tableName: table.name, filename },
							}),
						);
						return;
					}

					const { data: frontmatter, body } = parseResult.data;

					// Parse filename to extract structured data
					const parsed = tableConfig.parseFilename(filename);
					if (!parsed) {
						const error = MarkdownProviderError({
							message: `Failed to parse filename: ${filename}`,
						});
						diagnostics.add({
							filePath,
							tableName: table.name,
							filename,
							error,
						});
						logger.log(
							ProviderError({
								message: `${operationPrefix}failed to parse filename ${table.name}/${filename}`,
								context: { filePath, tableName: table.name, filename },
							}),
						);
						return;
					}

					// Deserialize using the table config
					const { error: deserializeError } = tableConfig.deserialize({
						frontmatter,
						body,
						filename,
						parsed,
						// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableHelper<TSchema[string]> due to union type from $tables() iteration
						table,
					});

					if (deserializeError) {
						// Track validation error in diagnostics (current state)
						diagnostics.add({
							filePath,
							tableName: table.name,
							filename,
							error: deserializeError,
						});
						// Log to historical record
						logger.log(
							ProviderError({
								message: `${operationPrefix}validation failed for ${table.name}/${filename}`,
								context: { filePath, tableName: table.name, filename },
							}),
						);
					}
				}),
			);
		}
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// STARTUP SEQUENCE
	// ─────────────────────────────────────────────────────────────────────────────
	//
	// The startup sequence has 4 phases that MUST run in this exact order:
	//
	// ┌─────────────────────────────────────────────────────────────────────────┐
	// │ PHASE 1: Build Tracking Map (Y.js → Memory)                             │
	// │                                                                         │
	// │   For each Y.js row, compute the expected filename via serialize().     │
	// │   This builds the "source of truth" for what files SHOULD exist.        │
	// │                                                                         │
	// │   tracking[tableName] = { rowId ↔ filename } (bidirectional)            │
	// └─────────────────────────────────────────────────────────────────────────┘
	//                                    ↓
	// ┌─────────────────────────────────────────────────────────────────────────┐
	// │ PHASE 2: Delete Orphan Files (Disk vs Tracking)                         │
	// │                                                                         │
	// │   Scan disk files and delete any not in tracking map.                   │
	// │   These are orphans from crashes, copy-paste, or failed syncs.          │
	// │                                                                         │
	// │   if file on disk && file NOT in tracking → DELETE                      │
	// └─────────────────────────────────────────────────────────────────────────┘
	//                                    ↓
	// ┌─────────────────────────────────────────────────────────────────────────┐
	// │ PHASE 3: Validate Remaining Files (Disk → Diagnostics)                  │
	// │                                                                         │
	// │   For each remaining file, deserialize and validate against schema.     │
	// │   Build diagnostics for any files with validation errors.               │
	// │                                                                         │
	// │   This catches files edited externally while server was down.           │
	// └─────────────────────────────────────────────────────────────────────────┘
	//                                    ↓
	// ┌─────────────────────────────────────────────────────────────────────────┐
	// │ PHASE 4: Start Watchers (Runtime Sync)                                  │
	// │                                                                         │
	// │   - Y.js observers: Y.js changes → write/delete markdown files          │
	// │   - File watchers: Markdown changes → upsert/delete Y.js rows           │
	// │                                                                         │
	// │   These maintain sync during runtime. Startup phases ensure clean state.│
	// └─────────────────────────────────────────────────────────────────────────┘
	//
	// WHY THIS ORDER MATTERS:
	//
	// - Phase 1 before Phase 2: We need tracking map to know which files are orphans
	// - Phase 2 before Phase 3: No point validating files we're about to delete
	// - Phase 3 before Phase 4: Watchers would fire for orphan deletions otherwise
	// - Phase 4 last: Clean state established, now maintain it
	//
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * PHASE 1: Build tracking map from Y.js
	 *
	 * Problem: The tracking map only exists in memory. On restart, Y.js data is
	 * restored from persistence, but the map is empty. Without this:
	 *
	 * 1. User edits a row → triggers onUpdate
	 * 2. We compute newFilename = "published.md"
	 * 3. We look up: oldFilename = tracking[tableName][rowId] → undefined (empty map!)
	 * 4. We think filename didn't change, skip old file cleanup
	 * 5. Result: Orphaned files accumulate
	 *
	 * Solution: Serialize all Y.js rows to rebuild the map.
	 *
	 * Cost: O(n × serialize) where n = row count. ~1ms per 100 rows.
	 */
	for (const { table, tableConfig } of tableWithConfigs) {
		// Initialize tracking map for this table
		if (!tracking[table.name]) {
			tracking[table.name] = {};
		}

		// Get all valid rows from YJS
		const rows = table.getAllValid();

		// Serialize each row to extract filename and populate tracking (rowId → filename)
		for (const row of rows) {
			const serializedRow = row.toJSON();
			const { filename } = tableConfig.serialize({
				// @ts-expect-error SerializedRow<TSchema[string]> is not assignable to SerializedRow<TTableSchema> due to union type from $tables() iteration
				row: serializedRow,
				// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableContext<TSchema[string]> due to union type from $tables() iteration
				table,
			});

			// Store rowId → filename mapping
			// biome-ignore lint/style/noNonNullAssertion: tracking is initialized at loop start for each table
			tracking[table.name]![row.id] = filename;
		}
	}

	/**
	 * PHASE 2: Delete orphan files
	 *
	 * Problem: Files can exist on disk with no corresponding Y.js row:
	 * 1. Server crashes between file creation and Y.js persistence
	 * 2. User copy-pastes files in Finder (creates files with new IDs)
	 * 3. Browser extension's refetch deletes Y.js rows but file deletion fails
	 *
	 * Solution: Extract row ID from filename, check if row exists in Y.js.
	 *
	 * Cost: O(n) where n = file count. ~10ms per 100 files (mostly I/O).
	 */
	for (const { table, tableConfig } of tableWithConfigs) {
		const filePaths = await listMarkdownFiles(tableConfig.directory);

		for (const filePath of filePaths) {
			const filename = path.basename(filePath);

			// Parse filename to extract row ID and check if row exists in Y.js
			const parsed = tableConfig.parseFilename(filename);
			const rowId = parsed?.id;

			if (!rowId || !table.has({ id: rowId })) {
				// Orphan file: no valid row ID or row doesn't exist in Y.js
				logger.log(
					ProviderError({
						message: `Startup cleanup: deleting orphan file ${table.name}/${filename}`,
						context: { tableName: table.name, filename, filePath },
					}),
				);
				await deleteMarkdownFile({ filePath: filePath as AbsolutePath });
			}
		}
	}

	/**
	 * PHASE 3: Validate remaining files
	 *
	 * Problem: Files can be edited externally while server is down.
	 * The diagnostics from last session are stale.
	 *
	 * Solution: Re-validate every file and rebuild diagnostics from scratch.
	 *
	 * Cost: O(n × (read + deserialize)) where n = file count. ~1s per 1000 files.
	 */
	await validateAllMarkdownFiles({ operation: 'Initial scan' });

	/**
	 * PHASE 4: Start runtime watchers
	 *
	 * Now that we have a clean state (tracking built, orphans deleted, files validated),
	 * start the bidirectional sync watchers:
	 *
	 * - Y.js observers: When app changes data → write/update/delete markdown files
	 * - File watchers: When user edits files → upsert/delete Y.js rows
	 *
	 * These maintain sync during runtime. The startup phases ensure we start clean.
	 */
	const unsubscribers = registerYJSObservers();
	const watchers = registerFileWatchers();

	return defineProviderExports({
		async destroy() {
			for (const unsub of unsubscribers) {
				unsub();
			}
			// chokidar's close() is async - wait for all watchers to fully close
			await Promise.all(watchers.map((watcher) => watcher.close()));
			// Flush and close logger to ensure all pending logs are written
			await logger.close();
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
						syncCoordination.yjsWriteCount++;

						// Process each table independently
						for (const { table, tableConfig } of tableWithConfigs) {
							// Delete all existing markdown files in this table's directory
							const filePaths = await listMarkdownFiles(tableConfig.directory);

							await Promise.all(
								filePaths.map(async (filePath) => {
									const { error } = await deleteMarkdownFile({ filePath });
									if (error) {
										// Log I/O errors (operational errors, not validation errors)
										logger.log(
											ProviderError({
												message: `pullToMarkdown: failed to delete ${filePath}`,
												context: { filePath, tableName: table.name },
											}),
										);
									}
								}),
							);

							// Write all current valid YJS rows for this table to markdown files
							const rows = table.getAllValid();

							for (const row of rows) {
								const serializedRow = row.toJSON();
								const { frontmatter, body, filename } = tableConfig.serialize({
									// @ts-expect-error SerializedRow<TSchema[string]> is not assignable to SerializedRow<TTableSchema> due to union type from $tables() iteration
									row: serializedRow,
									// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableHelper<TSchema[string]> due to union type from $tables() iteration
									table,
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
									// Log I/O errors (operational errors, not validation errors)
									logger.log(
										ProviderError({
											message: `pullToMarkdown: failed to write ${filePath}`,
											context: {
												filePath,
												tableName: table.name,
												rowId: row.id,
											},
										}),
									);
								}
							}
						}

						syncCoordination.yjsWriteCount--;
					},
					catch: (error) => {
						syncCoordination.yjsWriteCount--;
						return ProviderErr({
							message: `Markdown provider pull failed: ${extractErrorMessage(error)}`,
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
						tables.$clearAll();

						// Clear diagnostics at the start of push
						// Fresh import means fresh validation state
						diagnostics.clear();

						// Process each table independently
						for (const { table, tableConfig } of tableWithConfigs) {
							const filePaths = await listMarkdownFiles(tableConfig.directory);

							await Promise.all(
								filePaths.map(async (filePath) => {
									const filename = path.basename(filePath);

									// Read markdown file
									const parseResult = await readMarkdownFile(filePath);

									if (parseResult.error) {
										// Track read error in diagnostics (current state)
										const error = MarkdownProviderError({
											message: `Failed to read markdown file at ${filePath}: ${parseResult.error.message}`,
										});
										diagnostics.add({
											filePath,
											tableName: table.name,
											filename,
											error,
										});
										// Log to historical record
										logger.log(
											ProviderError({
												message: `pushFromMarkdown: failed to read ${table.name}/${filename}`,
												context: { filePath, tableName: table.name, filename },
											}),
										);
										return;
									}

									const { data: frontmatter, body } = parseResult.data;

									// Parse filename to extract structured data
									const parsed = tableConfig.parseFilename(filename);
									if (!parsed) {
										const error = MarkdownProviderError({
											message: `Failed to parse filename: ${filename}`,
										});
										diagnostics.add({
											filePath,
											tableName: table.name,
											filename,
											error,
										});
										logger.log(
											ProviderError({
												message: `pushFromMarkdown: failed to parse filename ${table.name}/${filename}`,
												context: { filePath, tableName: table.name, filename },
											}),
										);
										return;
									}

									// Deserialize using the table config
									const { data: row, error: deserializeError } =
										tableConfig.deserialize({
											frontmatter,
											body,
											filename,
											parsed,
											// @ts-expect-error TableHelper<TSchema[keyof TSchema]> is not assignable to TableHelper<TSchema[string]> due to union type from $tables() iteration
											table,
										});

									if (deserializeError) {
										// Track validation error in diagnostics (current state)
										diagnostics.add({
											filePath,
											tableName: table.name,
											filename,
											error: deserializeError,
										});
										// Log to historical record
										logger.log(
											ProviderError({
												message: `pushFromMarkdown: validation failed for ${table.name}/${filename}`,
												context: { filePath, tableName: table.name, filename },
											}),
										);
										return;
									}

									// Insert into YJS
									// @ts-expect-error SerializedRow<TSchema[string]> is not assignable to parameter of type SerializedRow<TTableSchema> due to union type from $tables() iteration
									table.upsert(row);
								}),
							);
						}

						syncCoordination.isProcessingFileChange = false;
					},
					catch: (error) => {
						syncCoordination.isProcessingFileChange = false;
						return ProviderErr({
							message: `Markdown provider push failed: ${extractErrorMessage(error)}`,
							context: { operation: 'push' },
						});
					},
				});
			},
		}),

		/**
		 * Scan all markdown files and rebuild diagnostics
		 *
		 * Validates every markdown file against its schema and updates the diagnostics
		 * to reflect the current state. This is useful for:
		 * - On-demand validation after bulk file edits
		 * - Scheduled validation jobs (e.g., nightly scans)
		 * - Manual verification that diagnostics are accurate
		 *
		 * Note: The initial scan on startup serves the same purpose, but this method
		 * allows re-scanning at any time without restarting the server.
		 */
		scanForErrors: defineQuery({
			description:
				'Scan all markdown files and rebuild diagnostics (validates every file)',
			handler: async () => {
				return tryAsync({
					try: async () => {
						await validateAllMarkdownFiles({ operation: 'scanForErrors' });

						// Return count of errors found
						const errorCount = diagnostics.count();
						console.log(
							`Scan complete: ${errorCount} markdown file${errorCount === 1 ? '' : 's'} with validation errors`,
						);
					},
					catch: (error) => {
						return ProviderErr({
							message: `Markdown provider scan failed: ${extractErrorMessage(error)}`,
							context: { operation: 'scan' },
						});
					},
				});
			},
		}),
	});
}) satisfies Provider;
