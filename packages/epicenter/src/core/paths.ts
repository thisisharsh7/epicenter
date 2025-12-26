import path from 'node:path';
import type { EpicenterDir, ProviderDir, StorageDir } from './types';

/**
 * Compute the `.epicenter` directory path from the storage directory.
 *
 * @param storageDir - The project root directory
 * @returns Absolute path to the `.epicenter` directory
 *
 * @example
 * ```typescript
 * const epicenterDir = getEpicenterDir(storageDir);
 * // '/Users/me/project' → '/Users/me/project/.epicenter'
 * ```
 */
export function getEpicenterDir(storageDir: StorageDir): EpicenterDir {
	return path.join(storageDir, '.epicenter') as EpicenterDir;
}

/**
 * Compute the provider's dedicated directory within `.epicenter/providers/`.
 *
 * Each provider gets its own isolated directory for storing internal artifacts
 * like databases, logs, caches, and tokens. This keeps provider data organized
 * and enables selective gitignore (only `.epicenter/providers/` is ignored).
 *
 * @param epicenterDir - The `.epicenter` directory path
 * @param providerId - The provider's key in the workspace providers map (e.g., 'sqlite', 'markdown', 'gmail')
 * @returns Absolute path to the provider's directory
 *
 * @example
 * ```typescript
 * const providerDir = getProviderDir(epicenterDir, 'sqlite');
 * // '/Users/me/project/.epicenter' → '/Users/me/project/.epicenter/providers/sqlite'
 *
 * // Store provider artifacts:
 * const dbPath = path.join(providerDir, `${workspaceId}.db`);
 * const logPath = path.join(providerDir, 'logs', `${workspaceId}.log`);
 * ```
 */
export function getProviderDir(
	epicenterDir: EpicenterDir,
	providerId: string,
): ProviderDir {
	return path.join(epicenterDir, 'providers', providerId) as ProviderDir;
}
