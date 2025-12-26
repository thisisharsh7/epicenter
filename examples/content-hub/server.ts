/**
 * Content Hub Server
 *
 * Runs the Epicenter server with all workspaces, including the browser workspace
 * that syncs with the tab-manager browser extension.
 *
 * Usage:
 *   bun run examples/content-hub/server.ts
 *
 * Endpoints:
 *   - GET  /                         - Health check
 *   - GET  /openapi                  - Scalar API documentation
 *   - WS   /sync/{workspaceId}       - Y.Doc WebSocket sync
 *   - GET  /workspaces/browser/...   - Browser workspace REST API
 *   - POST /workspaces/browser/...   - Browser workspace mutations
 */

import { createServer } from '@epicenter/hq/server';
import config from './epicenter.config';

const PORT = 3913;

console.log('Starting Content Hub server...');

const { app, client } = await createServer(config);

// Log available workspaces
const workspaceIds = Object.keys(client).filter((k) => !k.startsWith('$'));
console.log(`Loaded workspaces: ${workspaceIds.join(', ')}`);

// Log initial Y.Doc state (before WebSocket connections)
// Note: With no persistence provider, Y.Doc starts empty on server restart.
// The browser extension will sync its state via WebSocket when it connects.
const initialTabs = client.browser.tabs.getAllValid();
const initialWindows = client.browser.windows.getAllValid();
const initialTabGroups = client.browser.tab_groups.getAllValid();
console.log(
	`[Server Startup] Initial Y.Doc state (empty until browser connects):`,
);
console.log(`  - Tabs: ${initialTabs.length}`);
console.log(`  - Windows: ${initialWindows.length}`);
console.log(`  - Tab Groups: ${initialTabGroups.length}`);

// Start the server with WebSocket support
// Note: Must use app.listen() instead of Bun.serve() for Elysia's WebSocket handlers to work
app.listen(PORT);

console.log(`
Content Hub server running at http://localhost:${PORT}

Endpoints:
  - API docs:     http://localhost:${PORT}/openapi
  - Health:       http://localhost:${PORT}/
  - WebSocket:    ws://localhost:${PORT}/sync/{workspaceId}

Browser sync:
  - The tab-manager extension connects to: ws://localhost:${PORT}/sync/browser
  - REST API:     http://localhost:${PORT}/workspaces/browser/getAllTabs

Press Ctrl+C to stop.
`);
