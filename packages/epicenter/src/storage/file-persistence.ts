import * as Y from 'yjs';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Configuration for file-based YJS document persistence
 */
export type FilePersistenceConfig = {
	/**
	 * Directory where YJS documents are stored
	 * @default './data/workspaces'
	 */
	storagePath?: string;

	/**
	 * Enable auto-save on document updates
	 * @default true
	 */
	autoSave?: boolean;
};

/**
 * Default storage path for YJS documents
 */
const DEFAULT_STORAGE_PATH = './data/workspaces';

/**
 * Get the file path for a workspace document
 */
function getDocumentPath(workspaceId: string, storagePath: string): string {
	return path.join(storagePath, `${workspaceId}.yjs`);
}

/**
 * Ensure the storage directory exists
 */
function ensureStorageDir(storagePath: string): void {
	if (!fs.existsSync(storagePath)) {
		fs.mkdirSync(storagePath, { recursive: true });
	}
}

/**
 * Load a YJS document from disk, or create a new one if it doesn't exist.
 * This is a synchronous operation that blocks until the file is read.
 *
 * @param workspaceId - The workspace ID (used as Y.Doc GUID and filename)
 * @param config - Persistence configuration
 * @returns Y.Doc instance loaded with data from disk (if exists)
 *
 * @example
 * ```typescript
 * const ydoc = loadYDoc('workspace-123', { storagePath: './data' });
 * // ydoc is immediately ready to use
 * ```
 */
export function loadYDoc(
	workspaceId: string,
	config: FilePersistenceConfig = {},
): Y.Doc {
	const storagePath = config.storagePath ?? DEFAULT_STORAGE_PATH;
	const autoSave = config.autoSave ?? true;

	ensureStorageDir(storagePath);

	const filePath = getDocumentPath(workspaceId, storagePath);
	const ydoc = new Y.Doc({ guid: workspaceId });

	// Try to load existing state from disk
	try {
		const savedState = fs.readFileSync(filePath);
		Y.applyUpdate(ydoc, savedState);
		console.log(`[Persistence] Loaded workspace ${workspaceId} from ${filePath}`);
	} catch (error) {
		// File doesn't exist - fresh document
		console.log(`[Persistence] Creating new workspace ${workspaceId}`);
	}

	// Setup auto-save if enabled
	if (autoSave) {
		setupAutoSave(ydoc, storagePath);
	}

	return ydoc;
}

/**
 * Save a YJS document to disk.
 * Encodes the entire document state as a binary update and writes it to a file.
 *
 * @param ydoc - The Y.Doc to save
 * @param storagePath - Directory where the document should be saved
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * saveYDoc(ydoc, './data/workspaces');
 * ```
 */
export function saveYDoc(ydoc: Y.Doc, storagePath: string = DEFAULT_STORAGE_PATH): void {
	ensureStorageDir(storagePath);

	const workspaceId = ydoc.guid;
	const filePath = getDocumentPath(workspaceId, storagePath);

	const state = Y.encodeStateAsUpdate(ydoc);
	fs.writeFileSync(filePath, state);
}

/**
 * Setup auto-save observer on a YJS document.
 * Automatically saves the document to disk whenever it changes.
 *
 * @param ydoc - The Y.Doc to observe
 * @param storagePath - Directory where the document should be saved
 * @returns Unsubscribe function to stop auto-saving
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * const unsubscribe = setupAutoSave(ydoc, './data/workspaces');
 *
 * // Later: stop auto-saving
 * unsubscribe();
 * ```
 */
export function setupAutoSave(
	ydoc: Y.Doc,
	storagePath: string = DEFAULT_STORAGE_PATH,
): () => void {
	const updateHandler = () => {
		saveYDoc(ydoc, storagePath);
	};

	ydoc.on('update', updateHandler);

	return () => {
		ydoc.off('update', updateHandler);
	};
}

/**
 * Delete a workspace document from disk
 *
 * @param workspaceId - The workspace ID
 * @param storagePath - Directory where documents are stored
 * @returns true if deleted, false if file didn't exist
 */
export function deleteYDoc(
	workspaceId: string,
	storagePath: string = DEFAULT_STORAGE_PATH,
): boolean {
	const filePath = getDocumentPath(workspaceId, storagePath);

	try {
		fs.unlinkSync(filePath);
		console.log(`[Persistence] Deleted workspace ${workspaceId}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a workspace document exists on disk
 *
 * @param workspaceId - The workspace ID
 * @param storagePath - Directory where documents are stored
 * @returns true if the file exists
 */
export function docExists(
	workspaceId: string,
	storagePath: string = DEFAULT_STORAGE_PATH,
): boolean {
	const filePath = getDocumentPath(workspaceId, storagePath);
	return fs.existsSync(filePath);
}

/**
 * List all workspace IDs that have persisted documents
 *
 * @param storagePath - Directory where documents are stored
 * @returns Array of workspace IDs
 */
export function listWorkspaces(storagePath: string = DEFAULT_STORAGE_PATH): string[] {
	ensureStorageDir(storagePath);

	return fs
		.readdirSync(storagePath)
		.filter((file) => file.endsWith('.yjs'))
		.map((file) => file.replace('.yjs', ''));
}
