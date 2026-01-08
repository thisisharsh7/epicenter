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
 * Contains the `capabilities/` subdirectory where each capability stores internal
 * artifacts. Rarely accessed directly; prefer `paths.capability` for capability
 * data or `paths.project` for user content.
 */
export type EpicenterDir = AbsolutePath & Brand<'EpicenterDir'>;

/**
 * Capability's dedicated directory at `.epicenter/capabilities/{capabilityId}/`.
 *
 * Each capability gets isolated storage for internal artifacts. This directory
 * is gitignored, keeping capability data separate from version-controlled content.
 *
 * ## Storage Conventions
 *
 * Capabilities should follow these naming conventions:
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
 * └── capabilities/                        # GITIGNORED
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
 * const sqliteCapability: Capability = ({ id, paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *
 *   const dbPath = path.join(paths.capability, `${id}.db`);
 *   const logDir = path.join(paths.capability, 'logs');
 *   const logPath = path.join(logDir, `${id}.log`);
 * };
 * ```
 */
export type CapabilityDir = AbsolutePath & Brand<'CapabilityDir'>;

/**
 * Filesystem paths available to capabilities.
 *
 * All paths are `undefined` in browser environments where filesystem access
 * isn't available (capabilities use IndexedDB instead).
 *
 * @example Persistence capability
 * ```typescript
 * const persistenceCapability: Capability = ({ id, paths, ydoc }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const filePath = path.join(paths.capability, `${id}.yjs`);
 *   // Load existing state, set up auto-save...
 * };
 * ```
 *
 * @example SQLite materializer
 * ```typescript
 * const sqliteCapability: Capability = ({ id, paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const dbPath = path.join(paths.capability, `${id}.db`);
 *   const logPath = path.join(paths.capability, 'logs', `${id}.log`);
 *   // Initialize database, set up observers...
 * };
 * ```
 *
 * @example Markdown capability (user content + internal logs)
 * ```typescript
 * const markdownCapability: Capability = ({ id, paths }, config) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   // User content: resolve relative to project root
 *   const contentDir = path.resolve(paths.project, config.directory);
 *   // Internal logs: use capability directory
 *   const logPath = path.join(paths.capability, 'logs', `${id}.log`);
 * };
 * ```
 *
 * @example Auth capability (tokens)
 * ```typescript
 * const gmailAuthCapability: Capability = ({ paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const tokenPath = path.join(paths.capability, 'token.json');
 *   // Load/save OAuth tokens...
 * };
 * ```
 */
export type CapabilityPaths = {
	/** Project root. Use for user-facing content (markdown vaults, configs). */
	project: ProjectDir;
	/** The `.epicenter` directory. Rarely needed; prefer `capability`. */
	epicenter: EpicenterDir;
	/** Capability's isolated directory at `.epicenter/capabilities/{capabilityId}/`. */
	capability: CapabilityDir;
};

/**
 * Filesystem paths available to workspace exports factory.
 *
 * This is a subset of `CapabilityPaths` without the `capability` field,
 * since workspace exports don't have a specific capability context.
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
