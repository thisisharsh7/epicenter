/**
 * Get the root directory for Epicenter storage (customizable via EPICENTER_ROOT_DIR environment variable,
 * defaults to the directory containing epicenter.config.ts)
 *
 * In Node.js environments:
 * - Returns EPICENTER_ROOT_DIR environment variable if set (allows custom storage location)
 * - Otherwise returns process.cwd() (directory containing epicenter.config.ts, where epicenter commands are run)
 *
 * In browser environments:
 * - Returns empty string (browser storage APIs don't use filesystem paths)
 *
 * Storage-dependent indexes (SQLite, Markdown) and providers (Yjs persistence) use this to resolve relative storage paths.
 *
 * @returns The root directory path for storage operations
 *
 * @example
 * ```typescript
 * // With EPICENTER_ROOT_DIR environment variable set
 * // EPICENTER_ROOT_DIR=/data/epicenter
 * getRootDir(); // "/data/epicenter"
 *
 * // Without EPICENTER_ROOT_DIR (default behavior)
 * // Files stored relative to directory containing epicenter.config.ts
 * getRootDir(); // process.cwd() (e.g., "/home/user/my-project")
 *
 * // In browser
 * getRootDir(); // ""
 *
 * // Use in indexes to resolve storage paths
 * const dbPath = path.resolve(getRootDir(), '.epicenter', `${id}.db`);
 * const markdownDir = path.resolve(getRootDir(), './vault');
 * ```
 */
export function getRootDir(): string {
	// Check for Node.js environment (process exists and has cwd)
	if (typeof process !== 'undefined' && process.cwd) {
		return process.env.EPICENTER_ROOT_DIR ?? process.cwd();
	}

	// Browser environment
	return '';
}
