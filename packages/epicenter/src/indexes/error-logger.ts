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
	 * Log an error to the index-specific log file.
	 *
	 * This method is synchronous from the caller's perspective. Errors are
	 * queued and written to disk asynchronously in FIFO order. This prevents
	 * logging from blocking the main operation.
	 *
	 * @param error - The tagged error to log
	 */
	log(error: TaggedError): void;

	/**
	 * Flush all pending log entries and wait for completion.
	 * Use this before shutdown to ensure all logs are written.
	 */
	flush(): Promise<void>;

	/**
	 * Close the log file writer.
	 * Flushes pending entries before closing.
	 */
	close(): Promise<void>;
};

/**
 * Create a logger for index errors
 *
 * Each log entry is a single JSON line with ISO timestamp + the full tagged error.
 * This provides a historical record of all errors for debugging and analysis.
 *
 * **Queue-based architecture**:
 * - `log()` is synchronous; it pushes to an internal queue and returns immediately
 * - A background processor drains the queue in FIFO order
 * - Order is preserved; entries are written one at a time
 * - Callers never wait for disk I/O
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
 * // Synchronous: doesn't block, queues internally
 * logger.log(IndexError({
 *   message: 'File watcher: validation failed for posts/draft.md',
 *   context: { filePath: '...', tableName: 'posts', filename: 'draft.md' }
 * }));
 *
 * // Before shutdown, ensure all logs are written
 * await logger.close();
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

	// Queue state
	const queue: LogEntry[] = [];
	let isDraining = false;
	let flushResolvers: Array<() => void> = [];

	/**
	 * Process the queue one entry at a time, in order.
	 * Only one drain loop runs at a time (guarded by isDraining flag).
	 */
	async function drain() {
		if (isDraining) return;
		isDraining = true;

		while (queue.length > 0) {
			const entry = queue.shift()!;

			await tryAsync({
				try: async () => {
					writer.write(`${JSON.stringify(entry)}\n`);
					await writer.flush();
				},
				catch: (writeError) => {
					console.error('Failed to write to error log:', writeError);
					return Ok(undefined);
				},
			});
		}

		isDraining = false;

		// Resolve any pending flush promises
		const resolvers = flushResolvers;
		flushResolvers = [];
		for (const resolve of resolvers) {
			resolve();
		}
	}

	return {
		log(error) {
			// Always output to console for immediate visibility
			console.error(`[${error.name}] ${error.message}`, error.context);

			// Queue the entry with timestamp
			queue.push({
				timestamp: new Date().toISOString(),
				...error,
			});

			// Start draining if not already running
			// queueMicrotask ensures the drain starts after current sync code completes
			// but before the next event loop tick, maintaining responsiveness
			queueMicrotask(() => drain());
		},

		async flush() {
			if (queue.length === 0 && !isDraining) {
				return;
			}

			return new Promise<void>((resolve) => {
				flushResolvers.push(resolve);
				// Ensure drain is running
				queueMicrotask(() => drain());
			});
		},

		async close() {
			await this.flush();
			writer.end();
		},
	};
}
