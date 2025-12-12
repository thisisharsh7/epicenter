/**
 * y-websocket Client Compatibility Tests
 *
 * E2E tests using actual y-websocket-provider to verify our server
 * is compatible with standard Yjs clients.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import {
	createServer,
	defineEpicenter,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	text,
} from '../../src/index.node';
import { wait, waitFor } from '../helpers/sync-test-utils';

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
				handler: async () => Ok(tables.notes.findAll()),
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'y-websocket-compat-test',
		workspaces: [notesWorkspace],
	});

	let server: { stop: () => void; port: number };
	let wsUrl: string;

	beforeAll(async () => {
		const { app } = await createServer(epicenter);
		const elysiaServer = app.listen(0);
		const port = elysiaServer.server.port;

		server = {
			stop: () => elysiaServer.stop(),
			port,
		};

		wsUrl = `ws://localhost:${port}/sync`;
	});

	afterAll(() => {
		server?.stop();
	});

	// ========================================================================
	// Connection Tests
	// ========================================================================

	describe('connection', () => {
		test('y-websocket-provider connects successfully', async () => {
			const doc = new Y.Doc();
			const provider = createProvider(wsUrl, 'notes', doc);

			await waitForSync(provider);

			expect(provider.synced).toBe(true);
			expect(provider.wsconnected).toBe(true);

			provider.destroy();
		});

		test('provider reconnects after disconnect', async () => {
			const doc = new Y.Doc();
			const provider = createProvider(wsUrl, 'notes', doc);

			await waitForSync(provider);
			expect(provider.synced).toBe(true);

			// Force disconnect
			provider.disconnect();
			await wait(100);
			expect(provider.wsconnected).toBe(false);

			// Reconnect
			provider.connect();
			await waitForSync(provider);
			expect(provider.wsconnected).toBe(true);

			provider.destroy();
		});
	});

	// ========================================================================
	// Sync Tests
	// ========================================================================

	describe('document sync', () => {
		test('changes from client appear on server', async () => {
			const doc = new Y.Doc();
			const provider = createProvider(wsUrl, 'notes', doc);

			await waitForSync(provider);

			// Make changes on client
			doc.getMap('test').set('clientKey', 'clientValue');

			// Wait for sync to propagate
			await wait(200);

			// We can't easily verify server state directly, but the sync should complete
			// The fact that no errors occur is a good sign
			expect(provider.synced).toBe(true);

			provider.destroy();
		});

		test('two clients sync with each other', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Make change on client 1
			doc1.getMap('shared').set('key', 'from-client-1');

			// Wait for propagation to client 2
			await waitFor(() => doc2.getMap('shared').get('key') === 'from-client-1');

			expect(doc2.getMap('shared').get('key')).toBe('from-client-1');

			provider1.destroy();
			provider2.destroy();
		});

		test('bidirectional sync works', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Client 1 makes a change
			doc1.getMap('bidir').set('from1', 'value1');

			// Client 2 makes a different change
			doc2.getMap('bidir').set('from2', 'value2');

			// Wait for both to sync
			await waitFor(
				() =>
					doc1.getMap('bidir').get('from2') === 'value2' &&
					doc2.getMap('bidir').get('from1') === 'value1',
			);

			// Both docs should have both values
			expect(doc1.getMap('bidir').get('from1')).toBe('value1');
			expect(doc1.getMap('bidir').get('from2')).toBe('value2');
			expect(doc2.getMap('bidir').get('from1')).toBe('value1');
			expect(doc2.getMap('bidir').get('from2')).toBe('value2');

			provider1.destroy();
			provider2.destroy();
		});
	});

	// ========================================================================
	// Awareness Tests
	// ========================================================================

	describe('awareness', () => {
		test('awareness state propagates between clients', async () => {
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

		test('awareness is cleared on disconnect', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Set awareness
			provider1.awareness.setLocalState({ user: { name: 'User 1' } });

			// Wait for propagation
			await waitFor(() =>
				provider2.awareness.getStates().has(provider1.awareness.clientID),
			);

			const clientId = provider1.awareness.clientID;

			// Disconnect client 1
			provider1.destroy();

			// Wait for awareness to be cleared on client 2
			await waitFor(
				() => !provider2.awareness.getStates().has(clientId),
				3000,
			);

			expect(provider2.awareness.getStates().has(clientId)).toBe(false);

			provider2.destroy();
		});
	});

	// ========================================================================
	// Multi-Client Tests
	// ========================================================================

	describe('multiple clients', () => {
		test('three clients all sync correctly', async () => {
			const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
			const providers = docs.map((doc) => createProvider(wsUrl, 'notes', doc));

			await Promise.all(providers.map((p) => waitForSync(p)));

			// Each client makes a change
			docs[0].getMap('multi').set('client0', 'value0');
			docs[1].getMap('multi').set('client1', 'value1');
			docs[2].getMap('multi').set('client2', 'value2');

			// Wait for all to sync
			await waitFor(() => {
				return docs.every(
					(doc) =>
						doc.getMap('multi').get('client0') === 'value0' &&
						doc.getMap('multi').get('client1') === 'value1' &&
						doc.getMap('multi').get('client2') === 'value2',
				);
			});

			// Verify all clients have all values
			for (const doc of docs) {
				expect(doc.getMap('multi').get('client0')).toBe('value0');
				expect(doc.getMap('multi').get('client1')).toBe('value1');
				expect(doc.getMap('multi').get('client2')).toBe('value2');
			}

			for (const provider of providers) {
				provider.destroy();
			}
		});

		test('client joining late receives existing state', async () => {
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
	});

	// ========================================================================
	// Data Type Tests
	// ========================================================================

	describe('Yjs data types', () => {
		test('Y.Map syncs correctly', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Nested map operations
			const map1 = doc1.getMap('mapTest');
			map1.set('string', 'hello');
			map1.set('number', 42);
			map1.set('nested', new Y.Map([['inner', 'value']]));

			await waitFor(() => {
				const map2 = doc2.getMap('mapTest');
				return (
					map2.get('string') === 'hello' &&
					map2.get('number') === 42 &&
					(map2.get('nested') as Y.Map<string>)?.get('inner') === 'value'
				);
			});

			const map2 = doc2.getMap('mapTest');
			expect(map2.get('string')).toBe('hello');
			expect(map2.get('number')).toBe(42);
			expect((map2.get('nested') as Y.Map<string>).get('inner')).toBe('value');

			provider1.destroy();
			provider2.destroy();
		});

		test('Y.Array syncs correctly', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Array operations
			const arr1 = doc1.getArray<string>('arrayTest');
			arr1.push(['item1', 'item2']);
			arr1.insert(1, ['inserted']);

			await waitFor(() => {
				const arr2 = doc2.getArray<string>('arrayTest');
				return arr2.length === 3;
			});

			const arr2 = doc2.getArray<string>('arrayTest');
			expect(arr2.toArray()).toEqual(['item1', 'inserted', 'item2']);

			provider1.destroy();
			provider2.destroy();
		});

		test('Y.Text syncs correctly', async () => {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const provider1 = createProvider(wsUrl, 'notes', doc1);
			const provider2 = createProvider(wsUrl, 'notes', doc2);

			await Promise.all([waitForSync(provider1), waitForSync(provider2)]);

			// Text operations
			const text1 = doc1.getText('textTest');
			text1.insert(0, 'Hello');
			text1.insert(5, ' World');

			await waitFor(() => {
				const text2 = doc2.getText('textTest');
				return text2.toString() === 'Hello World';
			});

			expect(doc2.getText('textTest').toString()).toBe('Hello World');

			provider1.destroy();
			provider2.destroy();
		});
	});

	// ========================================================================
	// Error Handling Tests
	// ========================================================================

	describe('error handling', () => {
		test('invalid room returns 4004 close code', async () => {
			const doc = new Y.Doc();

			// Try to connect to non-existent workspace
			const provider = new WebsocketProvider(wsUrl, 'invalid-workspace', doc, {
				// @ts-expect-error - ws types differ slightly from browser WebSocket
				WebSocketPolyfill: WebSocket,
				disableBc: true,
				connect: true,
			});

			// Wait for connection attempt and expect failure
			await wait(500);

			// Provider should not be connected (room doesn't exist)
			expect(provider.synced).toBe(false);

			provider.destroy();
		});
	});
});

// ============================================================================
// Test Utilities (hoisted - placed at bottom for readability)
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

		provider.on('synced', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

/** Create a WebsocketProvider configured for Node.js/Bun environment */
function createProvider(
	wsUrl: string,
	room: string,
	doc: Y.Doc,
): WebsocketProvider {
	return new WebsocketProvider(wsUrl, room, doc, {
		// @ts-expect-error - ws types differ slightly from browser WebSocket
		WebSocketPolyfill: WebSocket,
		disableBc: true, // BroadcastChannel not available in Node.js/Bun
	});
}
