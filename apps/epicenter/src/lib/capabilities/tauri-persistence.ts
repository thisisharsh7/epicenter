import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import * as Y from 'yjs';

/**
 * Persistence exports returned by all persistence providers.
 */
export type PersistenceExports = {
	/** Resolves when initial data has been loaded from disk. */
	whenSynced: Promise<void>;
	/** Clean up resources and stop auto-saving. */
	destroy(): void;
};

/**
 * Internal helper to persist a Y.Doc to a file path relative to appLocalDataDir.
 *
 * Uses Tauri's path APIs for cross-platform compatibility.
 */
async function persistYDoc(
	ydoc: Y.Doc,
	relativePath: string,
): Promise<PersistenceExports> {
	const baseDir = await appLocalDataDir();

	// Use Tauri's join() for cross-platform path handling
	// Split by '/' and spread into join() to handle nested paths correctly
	const pathParts = relativePath.split('/');
	const filePath = await join(baseDir, ...pathParts);

	// Ensure parent directory exists
	if (pathParts.length > 1) {
		const parentParts = pathParts.slice(0, -1);
		const parentDir = await join(baseDir, ...parentParts);
		await mkdir(parentDir, { recursive: true }).catch(() => {
			// Directory might already exist - that's fine
		});
	}

	// Load existing state from disk
	let loadError: unknown = null;
	try {
		const savedState = await readFile(filePath);
		Y.applyUpdate(ydoc, new Uint8Array(savedState));
		console.log(`[Persistence] Loaded from ${relativePath}`);
	} catch (error) {
		// File doesn't exist yet - that's fine, we'll create it on first update
		loadError = error;
		console.log(`[Persistence] Creating new file at ${relativePath}`);
	}

	// Auto-save on updates
	const saveHandler = async () => {
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save ${relativePath}:`, error);
		}
	};

	ydoc.on('update', saveHandler);

	// If this is a new file (load failed), save initial state
	if (loadError) {
		await saveHandler();
	}

	return {
		whenSynced: Promise.resolve(),
		destroy() {
			ydoc.off('update', saveHandler);
		},
	};
}

/**
 * Persist the registry doc to `registry.yjs`.
 *
 * The registry stores which workspace GUIDs exist for this user.
 * There is one registry per app installation.
 *
 * @example
 * ```typescript
 * const registry = createRegistryDoc({ registryId: 'local' });
 * await registryPersistence(registry.ydoc);
 * ```
 */
export function registryPersistence(ydoc: Y.Doc): Promise<PersistenceExports> {
	return persistYDoc(ydoc, 'registry.yjs');
}

/**
 * Persist a head doc to `workspaces/{workspaceId}/head.yjs`.
 *
 * The head doc stores the current epoch for a workspace using the
 * CRDT-safe per-client MAX pattern.
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId: 'abc123xyz789012' });
 * await headPersistence(head.ydoc, 'abc123xyz789012');
 * const epoch = head.getEpoch();
 * ```
 */
export function headPersistence(
	ydoc: Y.Doc,
	workspaceId: string,
): Promise<PersistenceExports> {
	return persistYDoc(ydoc, `workspaces/${workspaceId}/head.yjs`);
}

/**
 * Persist a workspace doc to `workspaces/{workspaceId}/{epoch}.yjs`.
 *
 * The workspace doc stores the actual schema and data at a specific epoch.
 * Each epoch gets its own file, enabling migrations and compaction.
 *
 * @example
 * ```typescript
 * const client = await workspace.create({
 *   epoch: 0,
 *   capabilities: {
 *     persistence: (ctx) => workspacePersistence(ctx.ydoc, workspaceId, 0),
 *   },
 * });
 * ```
 */
export function workspacePersistence(
	ydoc: Y.Doc,
	workspaceId: string,
	epoch: number,
): Promise<PersistenceExports> {
	return persistYDoc(ydoc, `workspaces/${workspaceId}/${epoch}.yjs`);
}
