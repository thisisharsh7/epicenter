import type { Brand } from 'wellcrafted/brand';

/**
 * Branded type for absolute filesystem paths.
 *
 * Ensures paths have been resolved to absolute paths at the type level,
 * preventing accidental use of relative paths in filesystem operations.
 */
export type AbsolutePath = string & Brand<'AbsolutePath'>;

/**
 * Project root directory path.
 *
 * This is where user-facing content lives: markdown vaults, config files,
 * and any content that should be version-controlled. Configured via
 * `projectDir` option in `createClient()`. Defaults to `process.cwd()`.
 *
 * @example
 * ```typescript
 * // Markdown provider stores user content relative to project root
 * const vaultDir = path.join(paths.project, 'vault');
 * const postsDir = path.join(paths.project, 'content/posts');
 * ```
 */
export type ProjectDir = AbsolutePath & Brand<'ProjectDir'>;

/**
 * The `.epicenter` directory path at `{projectDir}/.epicenter`.
 *
 * Contains the `providers/` subdirectory where each provider stores internal
 * artifacts. Rarely accessed directly; prefer `paths.provider` for provider
 * data or `paths.project` for user content.
 */
export type EpicenterDir = AbsolutePath & Brand<'EpicenterDir'>;

/**
 * Provider's dedicated directory at `.epicenter/providers/{providerId}/`.
 *
 * Each provider gets isolated storage for internal artifacts. This directory
 * is gitignored, keeping provider data separate from version-controlled content.
 *
 * ## Storage Conventions
 *
 * Providers should follow these naming conventions:
 *
 * - **Databases**: `{workspaceId}.db` (e.g., `blog.db`, `auth.db`)
 * - **YJS persistence**: `{workspaceId}.yjs` (e.g., `blog.yjs`)
 * - **Logs**: `logs/{workspaceId}.log` (e.g., `logs/blog.log`)
 * - **Diagnostics**: `diagnostics/{workspaceId}.json`
 * - **Tokens/credentials**: `token.json`, `credentials.json`
 * - **Caches**: `cache/{workspaceId}/` subdirectory
 *
 * ## Folder Structure Example
 *
 * ```
 * .epicenter/
 * └── providers/                        # GITIGNORED
 *     ├── persistence/
 *     │   ├── blog.yjs
 *     │   └── auth.yjs
 *     ├── sqlite/
 *     │   ├── blog.db
 *     │   ├── auth.db
 *     │   └── logs/
 *     │       └── blog.log
 *     ├── markdown/
 *     │   ├── logs/
 *     │   │   └── blog.log
 *     │   └── diagnostics/
 *     │       └── blog.json
 *     └── gmailAuth/
 *         └── token.json
 * ```
 *
 * @example
 * ```typescript
 * const sqliteProvider: Provider = ({ id, paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *
 *   const dbPath = path.join(paths.provider, `${id}.db`);
 *   const logDir = path.join(paths.provider, 'logs');
 *   const logPath = path.join(logDir, `${id}.log`);
 * };
 * ```
 */
export type ProviderDir = AbsolutePath & Brand<'ProviderDir'>;

/**
 * Filesystem paths available to providers.
 *
 * All paths are `undefined` in browser environments where filesystem access
 * isn't available (providers use IndexedDB instead).
 *
 * @example Persistence provider
 * ```typescript
 * const persistenceProvider: Provider = ({ id, paths, ydoc }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const filePath = path.join(paths.provider, `${id}.yjs`);
 *   // Load existing state, set up auto-save...
 * };
 * ```
 *
 * @example SQLite materializer
 * ```typescript
 * const sqliteProvider: Provider = ({ id, paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const dbPath = path.join(paths.provider, `${id}.db`);
 *   const logPath = path.join(paths.provider, 'logs', `${id}.log`);
 *   // Initialize database, set up observers...
 * };
 * ```
 *
 * @example Markdown provider (user content + internal logs)
 * ```typescript
 * const markdownProvider: Provider = ({ id, paths }, config) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   // User content: resolve relative to project root
 *   const contentDir = path.resolve(paths.project, config.directory);
 *   // Internal logs: use provider directory
 *   const logPath = path.join(paths.provider, 'logs', `${id}.log`);
 * };
 * ```
 *
 * @example Auth provider (tokens)
 * ```typescript
 * const gmailAuthProvider: Provider = ({ paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const tokenPath = path.join(paths.provider, 'token.json');
 *   // Load/save OAuth tokens...
 * };
 * ```
 */
export type ProviderPaths = {
	/** Project root. Use for user-facing content (markdown vaults, configs). */
	project: ProjectDir;
	/** The `.epicenter` directory. Rarely needed; prefer `provider`. */
	epicenter: EpicenterDir;
	/** Provider's isolated directory at `.epicenter/providers/{providerId}/`. */
	provider: ProviderDir;
};

/**
 * Filesystem paths available to workspace exports factory.
 *
 * This is a subset of `ProviderPaths` without the `provider` field,
 * since workspace exports don't have a specific provider context.
 *
 * `undefined` in browser environments where filesystem access isn't available.
 *
 * @example
 * ```typescript
 * defineWorkspace({
 *   actions: ({ paths }) => {
 *     if (!paths) throw new Error('Requires Node.js');
 *     const configPath = path.join(paths.project, 'config.json');
 *     const dbPath = path.join(paths.epicenter, 'custom.db');
 *     // ...
 *   }
 * });
 * ```
 */
export type WorkspacePaths = {
	/** Project root. Use for user-facing content (markdown vaults, configs). */
	project: ProjectDir;
	/** The `.epicenter` directory at `{projectDir}/.epicenter`. */
	epicenter: EpicenterDir;
};
