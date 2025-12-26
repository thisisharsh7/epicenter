import type { Brand } from 'wellcrafted/brand';

/**
 * Branded type for absolute filesystem paths
 *
 * This ensures paths have been resolved to absolute paths at the type level,
 * preventing accidental use of relative paths in filesystem operations.
 *
 * @example
 * ```typescript
 * import { resolveAbsolutePath } from './helpers';
 *
 * // Create an absolute path
 * const absolutePath = resolveAbsolutePath('/Users/me/project');
 *
 * // TypeScript enforces that only AbsolutePath can be used
 * function saveFile(path: AbsolutePath) { ... }
 * saveFile(absolutePath); // ✓ OK
 * saveFile('./relative'); // ✗ Type error
 * ```
 */
export type AbsolutePath = string & Brand<'AbsolutePath'>;

/**
 * Branded type for the storage directory path
 *
 * This is the root directory where Epicenter stores all workspace data.
 * Configured via `storageDir` option in `createClient()`. In Node.js,
 * defaults to `process.cwd()` if not specified.
 *
 * The storage directory contains the `.epicenter` folder where all YJS
 * documents, SQLite databases, markdown files, logs, and tokens are stored.
 *
 * @example
 * ```typescript
 * // In epicenter.config.ts
 * export default [workspace1, workspace2] as const;
 *
 * // When creating the client with custom storageDir:
 * const client = await createClient(workspaces, {
 *   storageDir: '/Users/me/my-project'
 * });
 *
 * // In a provider or index
 * const myProvider: Provider = ({ storageDir }) => {
 *   if (!storageDir) {
 *     throw new Error('Requires Node.js environment');
 *   }
 *   // storageDir is typed as StorageDir, not just string
 * };
 * ```
 */
export type StorageDir = AbsolutePath & Brand<'StorageDir'>;

/**
 * Branded type for the `.epicenter` directory path
 *
 * This is the absolute path to the `.epicenter` directory where all Epicenter
 * data is stored. Providers store their data inside `.epicenter/providers/{providerId}/`.
 *
 * Most providers should use `providerDir` instead of `epicenterDir` directly.
 * This type exists for computing `providerDir` and for rare cases where
 * direct access to the `.epicenter` root is needed.
 *
 * @see ProviderDir - The preferred path for provider artifacts
 */
export type EpicenterDir = AbsolutePath & Brand<'EpicenterDir'>;

/**
 * Branded type for a provider's dedicated directory path
 *
 * Each provider gets its own isolated directory at `.epicenter/providers/{providerId}/`.
 * This is where providers should store all their internal artifacts:
 * - Databases (e.g., `{workspaceId}.db`)
 * - Logs (e.g., `logs/{workspaceId}.log`)
 * - Caches, tokens, and other provider-specific data
 *
 * The `providers/` subdirectory is gitignored, keeping provider data separate
 * from workspace definitions that may be committed.
 *
 * @example
 * ```typescript
 * // In a provider
 * const sqliteProvider: Provider = ({ providerDir, id }) => {
 *   if (!providerDir) {
 *     throw new Error('Requires Node.js environment');
 *   }
 *   const dbPath = path.join(providerDir, `${id}.db`);
 *   const logPath = path.join(providerDir, 'logs', `${id}.log`);
 *   // ...
 * };
 * ```
 */
export type ProviderDir = AbsolutePath & Brand<'ProviderDir'>;
