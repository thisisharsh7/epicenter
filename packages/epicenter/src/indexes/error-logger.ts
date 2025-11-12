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
 * Each log entry is a single JSON line with ISO timestamp + the full tagged error
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
 *   message: 'Failed to write file',
 *   context: { tableName: 'posts', rowId: '123' }
 * }));
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

			// If logging fails, fall back to console.error
			if (writeError) {
				console.error('Failed to write to error log:', writeError);
				console.error('Original error:', error);
			}
		},

		close: writer.end,
	};
}
