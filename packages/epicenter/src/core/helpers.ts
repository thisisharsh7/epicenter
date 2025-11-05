/**
 * Get the config directory (directory containing epicenter.config.ts)
 *
 * This returns the current working directory where the Node.js process was started.
 * This is the directory where you run your epicenter commands and where epicenter.config.ts lives.
 *
 * Used internally by storage-dependent indexes (SQLite, Markdown) to locate their
 * data files relative to the config directory.
 *
 * Node.js only - not available in browser environments.
 *
 * @returns The directory path where epicenter.config.ts is located
 *
 * @example
 * ```typescript
 * // In a Node.js environment
 * const configDir = getConfigDir();  // returns process.cwd()
 *
 * // Use in indexes to resolve relative storage paths
 * const dbPath = path.resolve(getConfigDir(), '.epicenter', `${id}.db`);
 * const markdownDir = path.resolve(getConfigDir(), './vault');  // relative to epicenter.config.ts
 * ```
 */
export function getConfigDir(): string {
	return process.cwd();
}
