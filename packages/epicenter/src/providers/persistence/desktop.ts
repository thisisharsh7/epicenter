import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { defineProviderExports } from '../../core/provider.shared';
import type { Provider } from '../../core/provider.node';

/** Debounce delay for filesystem writes (ms) */
const DEBOUNCE_MS = 100;

/**
 * YJS document persistence provider using the filesystem.
 * Stores the YDoc as a binary file in the `.epicenter` directory.
 *
 * **Platform**: Bun/Desktop (Tauri with Bun runtime)
 *
 * **How it works**:
 * 1. Creates `.epicenter` directory if it doesn't exist
 * 2. Loads existing state from `.epicenter/${workspaceId}.yjs` on startup
 * 3. Auto-saves to disk on YJS updates (debounced to avoid blocking on frequent updates)
 * 4. Performs a final async write on cleanup to ensure no data loss
 *
 * **Storage location**: `.epicenter/${workspaceId}.yjs` relative to storageDir from epicenter config
 * - Each workspace gets its own file named after its ID
 * - Binary format (not human-readable)
 * - Should be gitignored (add `.epicenter/` to `.gitignore`)
 *
 * **Performance**: Uses debounced async writes (100ms) via `Bun.write()` to avoid
 * blocking the event loop on every keystroke.
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
 *     persistence: setupPersistence,  // Auto-saves to {storageDir}/.epicenter/blog.yjs
 *   },
 *   exports: ({ tables }) => ({ ... }),
 * });
 * ```
 *
 * @example Multi-workspace setup
 * ```typescript
 * // All workspaces persist to .epicenter/ directory
 * const pages = defineWorkspace({
 *   id: 'pages',
 *   tables: { ... },
 *   providers: {
 *     persistence: setupPersistence,  // → {storageDir}/.epicenter/pages.yjs
 *   },
 *   exports: ({ tables }) => ({ ... }),
 * });
 *
 * const blog = defineWorkspace({
 *   id: 'blog',
 *   tables: { ... },
 *   providers: {
 *     persistence: setupPersistence,  // → {storageDir}/.epicenter/blog.yjs
 *   },
 *   exports: ({ tables }) => ({ ... }),
 * });
 * ```
 */
export const setupPersistence = (async ({ id, ydoc, epicenterDir }) => {
	if (!epicenterDir) {
		throw new Error(
			'Persistence provider requires Bun environment with filesystem access',
		);
	}

	const filePath = join(epicenterDir, `${id}.yjs`);

	// Ensure .epicenter directory exists
	mkdirSync(epicenterDir, { recursive: true });

	// Load existing state from disk
	try {
		const savedState = await Bun.file(filePath).arrayBuffer();
		Y.applyUpdate(ydoc, new Uint8Array(savedState));
	} catch {
		// File doesn't exist yet - that's fine, we'll create it on first update
	}

	/**
	 * Writes the current YDoc state to disk.
	 * Uses Bun.write() for async, non-blocking I/O.
	 */
	const save = () => Bun.write(filePath, Y.encodeStateAsUpdate(ydoc));

	// Debounce state - the timeout delays writes, but ydoc is the source of truth.
	// Canceling a timeout doesn't lose data because save() always writes the current ydoc state.
	let saveTimeout: Timer | null = null;
	let writeInProgress: Promise<number> | null = null;

	/** Schedules a save after DEBOUNCE_MS of inactivity. Batches rapid updates into single writes. */
	const debouncedSave = () => {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			saveTimeout = null;
			writeInProgress = save();
		}, DEBOUNCE_MS);
	};

	ydoc.on('update', debouncedSave);

	return defineProviderExports({
		/**
		 * Cleanup and final persistence.
		 *
		 * Data safety: Canceling the timeout doesn't lose data because the timeout only
		 * controls *when* we write, not *what* we write. The ydoc already has all changes
		 * applied, and the final save() writes the complete current state.
		 */
		destroy: async () => {
			// Cancel any pending debounced save (data is safe - see JSDoc above)
			if (saveTimeout) {
				clearTimeout(saveTimeout);
			}

			// Wait for any in-progress write to complete
			await writeInProgress;

			// Final save to ensure all data is persisted
			await save();

			// Unregister listener to prevent memory leaks
			ydoc.off('update', debouncedSave);
		},
	});
}) satisfies Provider;
