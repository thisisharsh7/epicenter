import * as Y from 'yjs';
import type { Provider } from '../../config';

/**
 * Directory name for Epicenter persistent data
 */
export const EPICENTER_STORAGE_DIR = '.epicenter';

/**
 * YJS document persistence provider using the filesystem.
 * Stores the YDoc as a binary file in the `.epicenter` directory.
 *
 * **Platform**: Node.js/Desktop (Tauri, Electron, Bun)
 *
 * **How it works**:
 * 1. Creates `.epicenter` directory if it doesn't exist
 * 2. Loads existing state from `.epicenter/${workspaceId}.yjs` on startup
 * 3. Auto-saves to disk on every YJS update
 *
 * **Storage location**: `.epicenter/${workspaceId}.yjs` (in current working directory)
 * - Each workspace gets its own file named after its ID
 * - Binary format (not human-readable)
 * - Should be gitignored (add `.epicenter/` to `.gitignore`)
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq';
 * import { setupPersistence } from '@epicenter/hq/providers/desktop';
 *
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   providers: [setupPersistence],  // Auto-saves to .epicenter/blog.yjs
 *   // ... schema, indexes, actions
 * });
 * ```
 *
 * @example Multi-workspace setup
 * ```typescript
 * // All workspaces persist to .epicenter/ directory
 * const pages = defineWorkspace({
 *   id: 'pages',
 *   providers: [setupPersistence],  // → .epicenter/pages.yjs
 * });
 *
 * const blog = defineWorkspace({
 *   id: 'blog',
 *   providers: [setupPersistence],  // → .epicenter/blog.yjs
 * });
 * ```
 */
export const setupPersistence = (async ({ id, ydoc }) => {
	// Dynamic imports to avoid bundling Node.js modules in browser builds
	const fs = await import('node:fs');
	const path = await import('node:path');

	// Auto-resolve to .epicenter/{id}.yjs
	const storagePath = '.epicenter';
	const filePath = path.join(storagePath, `${id}.yjs`);

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
}) satisfies Provider;
