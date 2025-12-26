import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import type { Provider } from '../../core/provider';

/**
 * YJS document persistence provider using the filesystem.
 * Stores the YDoc as a binary file in the provider's directory.
 *
 * **Platform**: Node.js/Desktop (Tauri, Electron, Bun)
 *
 * **How it works**:
 * 1. Creates provider directory if it doesn't exist
 * 2. Loads existing state from `.epicenter/providers/persistence/${workspaceId}.yjs` on startup
 * 3. Auto-saves to disk on every YJS update (synchronous to ensure data is persisted before process exits)
 *
 * **Storage location**: `.epicenter/providers/persistence/${workspaceId}.yjs`
 * - Each workspace gets its own file named after its ID
 * - Binary format (not human-readable)
 * - Should be gitignored (add `.epicenter/providers/` to `.gitignore`)
 *
 * @example Basic usage
 * ```typescript
 * import { defineWorkspace } from '@epicenter/hq';
 * import { setupPersistence } from '@epicenter/hq/providers/persistence';
 *
 * const workspace = defineWorkspace({
 *   id: 'blog',
 *   tables: { ... },
 *   providers: {
 *     persistence: setupPersistence,  // → .epicenter/providers/persistence/blog.yjs
 *   },
 *   exports: ({ tables }) => ({ ... }),
 * });
 * ```
 */
export const setupPersistence = (async ({ id, ydoc, providerDir }) => {
	if (!providerDir) {
		throw new Error(
			'Persistence provider requires Node.js environment with filesystem access',
		);
	}

	const filePath = path.join(providerDir, `${id}.yjs`);

	mkdirSync(providerDir, { recursive: true });

	// Try to load existing state from disk using Bun.file
	// No need to check existence first - just try to read and handle failure
	const file = Bun.file(filePath);
	try {
		// Use arrayBuffer() to get a fresh, non-shared buffer for Yjs
		const savedState = await file.arrayBuffer();
		// Convert to Uint8Array for Yjs
		Y.applyUpdate(ydoc, new Uint8Array(savedState));
		// console.log(`[Persistence] Loaded workspace from ${filePath}`);
	} catch {
		// File doesn't exist or couldn't be read - that's fine, we'll create it on first update
		// console.log(`[Persistence] Creating new workspace at ${filePath}`);
	}

	// Auto-save on every update using synchronous write
	// This ensures data is persisted before the process can exit
	// The performance impact is minimal for typical YJS update sizes
	ydoc.on('update', () => {
		const state = Y.encodeStateAsUpdate(ydoc);
		writeFileSync(filePath, state);
	});
}) satisfies Provider;
