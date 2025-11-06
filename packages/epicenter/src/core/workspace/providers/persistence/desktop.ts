import * as Y from 'yjs';
import type { Provider } from '../../config';

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
 * **Storage location**: `.epicenter/${workspaceId}.yjs` relative to storageDir from epicenter config
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
 *   providers: [setupPersistence],  // Auto-saves to {storageDir}/.epicenter/blog.yjs
 *   // ... schema, indexes, actions
 * });
 * ```
 *
 * @example Multi-workspace setup
 * ```typescript
 * // All workspaces persist to .epicenter/ directory
 * const pages = defineWorkspace({
 *   id: 'pages',
 *   providers: [setupPersistence],  // → {storageDir}/.epicenter/pages.yjs
 * });
 *
 * const blog = defineWorkspace({
 *   id: 'blog',
 *   providers: [setupPersistence],  // → {storageDir}/.epicenter/blog.yjs
 * });
 * ```
 */
export const setupPersistence = (async ({ id, ydoc, storageDir }) => {
	// Require Node.js environment with filesystem access
	if (!storageDir) {
		throw new Error(
			'Persistence provider requires Node.js environment with filesystem access',
		);
	}

	// Dynamic imports to avoid bundling Node.js modules in browser builds
	const fs = await import('node:fs');
	const path = await import('node:path');

	const epicenterDir = path.join(storageDir, '.epicenter');
	const filePath = path.join(epicenterDir, `${id}.yjs`);

	// Ensure .epicenter directory exists
	if (!fs.existsSync(epicenterDir)) {
		fs.mkdirSync(epicenterDir, { recursive: true });
	}

	// Try to load existing state from disk
	try {
		const savedState = fs.readFileSync(filePath);
		Y.applyUpdate(ydoc, savedState);
		// console.log(`[Persistence] Loaded workspace from ${filePath}`);
	} catch {
		// console.log(`[Persistence] Creating new workspace at ${filePath}`);
	}

	// Auto-save on every update
	ydoc.on('update', () => {
		const state = Y.encodeStateAsUpdate(ydoc);
		Bun.write(filePath, state);
	});
}) satisfies Provider;
