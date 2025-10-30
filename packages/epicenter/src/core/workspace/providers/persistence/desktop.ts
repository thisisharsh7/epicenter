import * as Y from 'yjs';
import type { ProviderContext } from '../../config';

/**
 * Directory name for Epicenter persistent data
 */
export const EPICENTER_STORAGE_DIR = '.epicenter';

type SetupPersistenceOptions = {
	/**
	 * Absolute or relative path to the directory where YJS files should be stored.
	 *
	 * **Recommended**: Use `import.meta.dirname` with `path.join()` for absolute paths
	 * to ensure each workspace persists in its own directory regardless of where
	 * the command is run from.
	 *
	 * @example Absolute path (recommended)
	 * ```typescript
	 * import path from 'node:path';
	 *
	 * setupPersistence({
	 *   storagePath: path.join(import.meta.dirname, '.epicenter')
	 * })
	 * ```
	 *
	 * @example Relative path (resolves from process.cwd())
	 * ```typescript
	 * setupPersistence({
	 *   storagePath: './.epicenter'
	 * })
	 * ```
	 */
	storagePath: string;
};

/**
 * Factory function that creates a YJS document persistence provider using the filesystem.
 * Stores the YDoc as a binary file in the specified directory.
 *
 * **Platform**: Node.js/Desktop (Tauri, Electron, Bun)
 *
 * **How it works**:
 * 1. Creates the storage directory if it doesn't exist
 * 2. Loads existing state from `${storagePath}/${ydoc.guid}.yjs` on startup
 * 3. Auto-saves to disk on every YJS update
 * 4. Uses the YDoc's guid as the filename (workspace ID)
 *
 * **Storage location**: `${storagePath}/${workspaceId}.yjs`
 * - Each workspace gets its own file named after its ID
 * - Binary format (not human-readable)
 * - Should be gitignored (add storage directory to `.gitignore`)
 *
 * @param options - Configuration options
 * @param options.storagePath - Directory path where YJS files will be stored
 *
 * @returns Provider function that sets up persistence when called with ProviderContext
 *
 * @example Basic usage with absolute path (recommended)
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq';
 * import { setupPersistence } from '@epicenter/hq/providers/desktop';
 * import path from 'node:path';
 *
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   providers: [
 *     setupPersistence({
 *       storagePath: path.join(import.meta.dirname, '.epicenter')
 *     })
 *   ],
 *   // ... schema, indexes, actions
 * });
 * ```
 *
 * @example Multi-workspace setup (each in its own directory)
 * ```typescript
 * // workspaces/pages/workspace.config.ts
 * export const pages = defineWorkspace({
 *   id: 'pages',
 *   providers: [
 *     setupPersistence({
 *       storagePath: path.join(import.meta.dirname, '.epicenter')
 *     })
 *   ],
 * });
 * // → Persists to: workspaces/pages/.epicenter/pages.yjs
 *
 * // workspaces/blog/workspace.config.ts
 * export const blog = defineWorkspace({
 *   id: 'blog',
 *   providers: [
 *     setupPersistence({
 *       storagePath: path.join(import.meta.dirname, '.epicenter')
 *     })
 *   ],
 * });
 * // → Persists to: workspaces/blog/.epicenter/blog.yjs
 * ```
 *
 * @example Shared storage directory
 * ```typescript
 * // All workspaces persist to the same directory
 * const sharedPath = '/absolute/path/to/storage';
 *
 * const pages = defineWorkspace({
 *   id: 'pages',
 *   providers: [setupPersistence({ storagePath: sharedPath })],
 * });
 *
 * const blog = defineWorkspace({
 *   id: 'blog',
 *   providers: [setupPersistence({ storagePath: sharedPath })],
 * });
 *
 * // Both persist to:
 * // /absolute/path/to/storage/pages.yjs
 * // /absolute/path/to/storage/blog.yjs
 * ```
 */
export function setupPersistence(options: SetupPersistenceOptions) {
	return async ({ ydoc }: ProviderContext): Promise<void> => {
		// Dynamic imports to avoid bundling Node.js modules in browser builds
		const fs = await import('node:fs');
		const path = await import('node:path');

		const { storagePath } = options;
		const filePath = path.join(storagePath, `${ydoc.guid}.yjs`);

		// Ensure storage directory exists
		if (!fs.existsSync(storagePath)) {
			fs.mkdirSync(storagePath, { recursive: true });
		}

		// Try to load existing state from disk
		try {
			const savedState = fs.readFileSync(filePath);
			Y.applyUpdate(ydoc, savedState);
			console.log(`[Persistence] Loaded workspace from ${filePath}`);
		} catch {
			console.log(`[Persistence] Creating new workspace at ${filePath}`);
		}

		// Auto-save on every update
		ydoc.on('update', () => {
			const state = Y.encodeStateAsUpdate(ydoc);
			fs.writeFileSync(filePath, state);
		});
	};
}
