/**
 * y-websocket Client Compatibility Tests
 *
 * E2E tests using actual y-websocket-provider to verify our server
 * is compatible with standard Yjs clients.
 *
 * Uses Bun's native WebSocket - no polyfill needed.
 *
 * These tests focus on proving protocol compatibility, not testing Yjs itself.
 * For protocol-level tests, see protocol.test.ts.
 */

import { type } from 'arktype';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Ok } from 'wellcrafted/result';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { createClient } from '../../src/core/workspace/client.node';
import {
	createServer,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	text,
} from '../../src/index.node';

describe('y-websocket Client Compatibility', () => {
	const notesWorkspace = defineWorkspace({
		id: 'notes',
		tables: {
			notes: {
				id: id(),
				content: text(),
			},
		},
		providers: {},
		exports: ({ tables }) => ({
			createNote: defineMutation({
				input: type({ content: 'string' }),
				description: 'Create a new note',
				handler: async (input) => {
					const note = { id: generateId(), content: input.content };
					tables.notes.upsert(note);
					return Ok(note);
				},
			}),
			getNotes: defineQuery({
				description: 'Get all notes',
				handler: async () => Ok(tables.notes.getAllValid()),
			}),
		}),
	});

	let server: { stop: () => void; port: number };
	let wsUrl: string;

	beforeAll(async () => {
		const client = await createClient([notesWorkspace] as const);
		const { app } = createServer(client);
		const elysiaServer = app.listen(0);
		const port = elysiaServer.server!.port;

		server = { stop: () => elysiaServer.stop(), port };
		wsUrl = `ws://localhost:${port}/sync`;
	});

	afterAll(() => {
		server?.stop();
	});

	// ========================================================================
	// Essential Tests - These prove y-websocket compatibility
	// ========================================================================

	test('y-websocket-provider connects and syncs', async () => {
		const doc = new Y.Doc();
		const provider = createProvider(wsUrl, 'notes', doc);

		await waitForSync(provider);

		expect(provider.synced).toBe(true);
		expect(provider.wsconnected).toBe(true);

		provider.destroy();
	});

	test('two clients sync changes through server', async () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();

		const provider1 = createProvider(wsUrl, 'notes', doc1);
		const provider2 = createProvider(wsUrl, 'notes', doc2);

		await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

		// Client 1 makes a change
		doc1.getMap('shared').set('key', 'from-client-1');

		// Wait for propagation to client 2
		await waitFor(() => doc2.getMap('shared').get('key') === 'from-client-1');

		expect(doc2.getMap('shared').get('key')).toBe('from-client-1');

		provider1.destroy();
		provider2.destroy();
	});

	test('late-joining client receives existing state', async () => {
		const doc1 = new Y.Doc();
		const provider1 = createProvider(wsUrl, 'notes', doc1);

		await waitForSync(provider1);

		// First client makes changes
		doc1.getMap('late').set('existing', 'data');
		await wait(200);

		// Late client joins
		const doc2 = new Y.Doc();
		const provider2 = createProvider(wsUrl, 'notes', doc2);

		await waitForSync(provider2);

		// Late client should have existing data
		await waitFor(() => doc2.getMap('late').get('existing') === 'data');

		expect(doc2.getMap('late').get('existing')).toBe('data');

		provider1.destroy();
		provider2.destroy();
	});

	test('awareness propagates between clients', async () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();

		const provider1 = createProvider(wsUrl, 'notes', doc1);
		const provider2 = createProvider(wsUrl, 'notes', doc2);

		await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

		// Set awareness on client 1
		provider1.awareness.setLocalState({
			user: { name: 'User 1', color: '#ff0000' },
			cursor: { x: 100, y: 200 },
		});

		// Wait for awareness to propagate
		await waitFor(() => {
			const states = provider2.awareness.getStates();
			return states.has(provider1.awareness.clientID);
		});

		const states = provider2.awareness.getStates();
		const user1State = states.get(provider1.awareness.clientID);

		expect(user1State).toBeDefined();
		expect(user1State?.user?.name).toBe('User 1');
		expect(user1State?.cursor).toEqual({ x: 100, y: 200 });

		provider1.destroy();
		provider2.destroy();
	});

	test('invalid room returns error (does not sync)', async () => {
		const doc = new Y.Doc();

		// Try to connect to non-existent workspace
		const provider = new WebsocketProvider(wsUrl, 'invalid-workspace', doc, {
			disableBc: true,
			connect: true,
		});

		// Wait for connection attempt
		await wait(500);

		// Provider should not be synced (room doesn't exist, server closes connection)
		expect(provider.synced).toBe(false);

		provider.destroy();
	});
});

// ============================================================================
// Test Utilities
// ============================================================================

/** Wait for provider to sync */
function waitForSync(
	provider: WebsocketProvider,
	timeout = 5000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (provider.synced) {
			resolve();
			return;
		}

		const timer = setTimeout(() => {
			reject(new Error(`Sync timeout after ${timeout}ms`));
		}, timeout);

		// y-websocket emits 'sync' event, not 'synced'
		provider.on('sync', (synced: boolean) => {
			if (synced) {
				clearTimeout(timer);
				resolve();
			}
		});
	});
}

/** Create a WebsocketProvider using Bun's native WebSocket */
function createProvider(
	wsUrl: string,
	room: string,
	doc: Y.Doc,
): WebsocketProvider {
	return new WebsocketProvider(wsUrl, room, doc, {
		// Bun has native WebSocket that's browser-compatible
		disableBc: true, // BroadcastChannel not available in Bun
	});
}

/** Wait for a condition to become true */
async function waitFor(
	condition: () => boolean,
	timeout = 5000,
	interval = 50,
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error(`Condition not met within ${timeout}ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

/** Wait for a specific number of milliseconds */
function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
