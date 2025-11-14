import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { TaggedError } from 'wellcrafted/error';
import { Ok, tryAsync, trySync } from 'wellcrafted/result';

/**
 * Log entry format: timestamp + full tagged error
 */
type LogEntry = {
	timestamp: string;
} & TaggedError;

/**
 * Configuration for creating an index logger
 */
type IndexLoggerConfig = {
	/**
	 * Absolute path to the log file where errors will be written.
	 *
	 * Example: `/path/to/storage/.epicenter/markdown/workspace-id.log`
	 *
	 * The parent directory will be created automatically if it doesn't exist.
	 */
	logPath: string;
};

type IndexLogger = {
	/**
	 * Log an error to the index-specific log file
	 * @param error - The tagged error to log
	 */
	log(error: TaggedError): Promise<void>;

	/**
	 * Close the log file writer (optional cleanup)
	 */
	close(): void;
};

/**
 * Create a logger for index errors
 *
 * Each log entry is a single JSON line with ISO timestamp + the full tagged error.
 * This provides a historical record of all errors for debugging and analysis.
 *
 * **Purpose**: Historical audit trail of all errors
 * - Never clears (append-only)
 * - Tracks patterns, frequency, timing
 * - Useful for debugging intermittent issues
 * - Answers "what happened over time?"
 *
 * **Complements diagnostics manager**:
 * - Diagnostics: current state (what's broken now)
 * - Logger: historical record (what broke when)
 *
 * **Console output format**: `[ErrorName] message` + context object
 *
 * Example console outputs:
 * ```
 * [IndexError] File watcher: validation failed for posts/draft.md { filePath: '...', tableName: 'posts', filename: 'draft.md' }
 * [IndexError] YJS observer onAdd: failed to write posts/123 { tableName: 'posts', rowId: '123' }
 * [IndexError] Initial scan: failed to read posts/hello.md { filePath: '...', tableName: 'posts', filename: 'hello.md' }
 * [MarkdownIndexError] File deleted but row ID not found in tracking map { tableName: 'posts', filename: 'post.md' }
 * ```
 *
 * @param config.logPath - Absolute path to the log file (parent directory will be created if needed)
 *
 * @example
 * ```typescript
 * import path from 'node:path';
 *
 * const logPath = path.join(
 *   storageDir,
 *   '.epicenter',
 *   'markdown',
 *   `${workspaceId}.log`
 * );
 *
 * const logger = createIndexLogger({ logPath });
 *
 * await logger.log(IndexError({
 *   message: 'File watcher: validation failed for posts/draft.md',
 *   context: { filePath: '...', tableName: 'posts', filename: 'draft.md' }
 * }));
 * // Console output: [IndexError] File watcher: validation failed for posts/draft.md { filePath: '...', tableName: 'posts', filename: 'draft.md' }
 * ```
 */
export function createIndexLogger({
	logPath,
}: IndexLoggerConfig): IndexLogger {
	// Create parent directory if it doesn't exist
	const logDir = path.dirname(logPath);
	trySync({
		try: () => {
			mkdirSync(logDir, { recursive: true });
		},
		catch: () => Ok(undefined), // Directory might already exist
	});

	const file = Bun.file(logPath);
	const writer = file.writer();

	return {
		log: async (error) => {
			// Always output to console for immediate visibility
			console.error(`[${error.name}] ${error.message}`, error.context);

			const { error: writeError } = await tryAsync({
				try: async () => {
					writer.write(
						`${JSON.stringify({
							timestamp: new Date().toISOString(),
							...error,
						} satisfies LogEntry)}\n`,
					);
				},
				catch: () => Ok(undefined),
			});

			// If file write fails, log the write failure as well
			if (writeError) {
				console.error('Failed to write to error log:', writeError);
			}
		},

		close: writer.end,
	};
}
