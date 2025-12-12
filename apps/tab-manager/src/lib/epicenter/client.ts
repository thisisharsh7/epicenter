/**
 * Epicenter client for the browser extension popup.
 *
 * Created synchronously on module load - browser initialization doesn't need await.
 * Import this directly wherever you need access to workspace data.
 */

import { createWorkspaceClient } from '@epicenter/hq';
import { browserWorkspace } from './browser.workspace';

/**
 * The workspace client with typed access to browser state.
 *
 * Provides:
 * - `$ydoc`: Direct access to the underlying Y.Doc
 * - `tables`: Direct access to tables for observe/invalidation
 * - `getAllTabs()`: Get all tabs sorted by index
 * - `getAllWindows()`: Get all windows
 * - `getTabsByWindow(windowId)`: Get tabs for a specific window
 * - `destroy()`: Clean up resources
 */
export const epicenter = createWorkspaceClient(browserWorkspace);
