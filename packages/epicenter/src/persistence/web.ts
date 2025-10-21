import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

/**
 * Set up YJS document persistence using IndexedDB.
 * Stores the YDoc in the browser's IndexedDB storage.
 *
 * **Platform**: Web/Browser
 *
 * **How it works**:
 * 1. Creates an IndexedDB database named after the workspace ID
 * 2. Loads existing state from IndexedDB on startup (automatic via y-indexeddb)
 * 3. Auto-saves to IndexedDB on every YJS update (automatic via y-indexeddb)
 * 4. Uses the YDoc's guid as the database name (workspace ID)
 *
 * **Storage location**: Browser's IndexedDB (inspect via DevTools)
 * - Chrome: DevTools → Application → IndexedDB
 * - Firefox: DevTools → Storage → IndexedDB
 * - Each workspace gets its own database
 *
 * **Multi-workspace support**: Multiple workspaces create separate IndexedDB databases,
 * each named after its workspace ID.
 *
 * **Dependencies**: Requires `y-indexeddb` package
 * ```bash
 * bun add y-indexeddb yjs
 * ```
 *
 * @param ydoc - The YJS document to persist (must have a guid set to workspace ID)
 *
 * @example Basic usage in a browser app
 * ```typescript
 * import { defineEpicenter, setupPersistenceWeb } from '@repo/epicenter';
 *
 * const workspace = defineEpicenter({
 *   id: 'blog',  // This becomes the IndexedDB database name
 *   setupYDoc: (ydoc) => setupPersistenceWeb(ydoc),
 *   // ... schema, indexes, actions
 * });
 * ```
 *
 * @example In a Svelte/React component
 * ```typescript
 * import { createEpicenterClient } from '@repo/epicenter';
 * import { epicenter } from './epicenter-config';
 *
 * // Inside component setup/onMount:
 * const client = await createEpicenterClient(epicenter);
 *
 * // Data persists across page refreshes!
 * // Check DevTools → Application → IndexedDB to see the database
 * ```
 *
 * @example Multi-epicenter setup
 * ```typescript
 * // Each epicenter gets its own IndexedDB database
 * const blog = defineEpicenter({
 *   id: 'blog',  // → IndexedDB database named 'blog'
 *   setupYDoc: (ydoc) => setupPersistenceWeb(ydoc),
 * });
 *
 * const notes = defineEpicenter({
 *   id: 'notes',  // → IndexedDB database named 'notes'
 *   setupYDoc: (ydoc) => setupPersistenceWeb(ydoc),
 * });
 *
 * // Workspaces are isolated, each with separate IndexedDB storage
 * ```
 *
 * @example Inspecting IndexedDB in browser
 * ```
 * 1. Open DevTools (F12)
 * 2. Go to Application tab (Chrome) or Storage tab (Firefox)
 * 3. Expand IndexedDB in the sidebar
 * 4. You'll see databases named after your workspace IDs
 * 5. Click to inspect the stored YJS document
 * ```
 *
 * @see {@link setupPersistence} from `@repo/epicenter/persistence/desktop` for Node.js/filesystem version
 */
export function setupPersistence(ydoc: Y.Doc): void {
	// y-indexeddb handles both loading and saving automatically
	// Uses the YDoc's guid as the IndexedDB database name
	new IndexeddbPersistence(ydoc.guid, ydoc);

	console.log(`[Persistence] IndexedDB persistence enabled for ${ydoc.guid}`);
}
