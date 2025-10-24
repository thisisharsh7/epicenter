import * as Y from 'yjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProviderContext } from '../core/workspace/config';

/**
 * Directory where Epicenter stores persistent data (YJS files and SQLite databases)
 */
export const EPICENTER_STORAGE_DIR = '.epicenter';

/**
 * Set up YJS document persistence using the filesystem.
 * Stores the YDoc as a binary file in the .epicenter directory.
 *
 * **Platform**: Node.js/Desktop (Tauri, Electron, Bun)
 *
 * **How it works**:
 * 1. Creates `.epicenter/` directory if it doesn't exist
 * 2. Loads existing state from `.epicenter/${ydoc.guid}.yjs` on startup
 * 3. Auto-saves to disk on every YJS update
 * 4. Uses the YDoc's guid as the filename (workspace ID)
 *
 * **Storage location**: `./.epicenter/${workspaceId}.yjs`
 * - Each workspace gets its own file named after its ID
 * - Binary format (not human-readable)
 * - Should be gitignored (add `.epicenter/` to `.gitignore`)
 *
 * **Multi-workspace support**: Multiple workspaces share the `.epicenter/` directory
 * but each has its own isolated file.
 *
 * @param ydoc - The YJS document to persist (must have a guid set to workspace ID)
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace, setupPersistenceDesktop } from '@repo/epicenter';
 *
 * const workspace = defineWorkspace({
 *   id: 'blog',  // This becomes the filename: .epicenter/blog.yjs
 *   providers: [setupPersistenceDesktop],
 *   // ... schema, indexes, actions
 * });
 * ```
 *
 * @example Multi-workspace setup
 * ```typescript
 * // Pages workspace
 * const pages = defineWorkspace({
 *   id: 'pages',  // → .epicenter/pages.yjs
 *   providers: [setupPersistenceDesktop],
 * });
 *
 * // Content-hub workspace
 * const contentHub = defineWorkspace({
 *   id: 'content-hub',  // → .epicenter/content-hub.yjs
 *   providers: [setupPersistenceDesktop],
 * });
 *
 * // Both workspaces share .epicenter/ but have separate state
 * ```
 *
 * @example File structure after running
 * ```
 * project/
 * ├── .epicenter/
 * │   ├── blog.yjs          # Blog workspace state
 * │   ├── pages.yjs         # Pages workspace state
 * │   └── content-hub.yjs   # Content-hub workspace state
 * ├── .gitignore            # Add: .epicenter/
 * └── epicenter.config.ts
 * ```
 *
 * @see {@link setupPersistence} from `@repo/epicenter/persistence/web` for browser/IndexedDB version
 */
export function setupPersistence({ ydoc }: ProviderContext): void {
	const storagePath = `./${EPICENTER_STORAGE_DIR}` as const;
	const filePath = path.join(storagePath, `${ydoc.guid}.yjs`);

	// Ensure .epicenter directory exists
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
}
