import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import * as Y from 'yjs';
import { Ok } from 'wellcrafted/result';
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

/**
 * Helper to parse WebSocket messages.
 * Handles Bun's behavior of sending binary data as JSON-encoded objects.
 */
function parseWsMessage(data: unknown): Uint8Array | null {
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	} else if (data instanceof Uint8Array) {
		return data;
	} else if (Buffer.isBuffer(data)) {
		return new Uint8Array(data);
	} else if (typeof data === 'string') {
		try {
			const parsed = JSON.parse(data);
			if (typeof parsed === 'object' && parsed !== null) {
				const keys = Object.keys(parsed).map(Number).sort((a, b) => a - b);
				const arr = new Uint8Array(keys.length);
				for (let i = 0; i < keys.length; i++) {
					arr[i] = parsed[keys[i]];
				}
				return arr;
			}
		} catch {
			// Not JSON
		}
	}
	return null;
}

/**
 * WebSocket sync integration tests
 *
 * These tests verify that the y-websocket compatible sync endpoint works correctly
 * by connecting clients and verifying document synchronization.
 */
describe('WebSocket Sync Integration Tests', () => {
	// Simple workspace for sync testing
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
				input: type({
					content: 'string',
				}),
				description: 'Create a new note',
				handler: async (input) => {
					const note = {
						id: generateId(),
						content: input.content,
					};
					tables.notes.upsert(note);
					return Ok(note);
				},
			}),

			getNotes: defineQuery({
				description: 'Get all notes',
				handler: async () => {
					return Ok(tables.notes.findAll());
				},
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'sync-test-app',
		workspaces: [notesWorkspace],
	});

	let server: { stop: () => void; port: number };
	let serverUrl: string;
	let wsUrl: string;

	beforeAll(async () => {
		const { app } = await createServer(epicenter);

		// Use Elysia's built-in listen which handles WebSocket setup
		const elysiaServer = app.listen(0); // 0 = random available port
		const port = elysiaServer.server.port;

		server = {
			stop: () => elysiaServer.stop(),
			port,
		};

		serverUrl = `http://localhost:${port}`;
		wsUrl = `ws://localhost:${port}`;
	});

	afterAll(() => {
		server?.stop();
	});

	test('server health check responds', async () => {
		const response = await fetch(`${serverUrl}/`);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.name).toBe('sync-test-app API');
	});

	test('WebSocket sync endpoint connects for valid workspace', async () => {
		const messages: Uint8Array[] = [];

		const ws = new WebSocket(`${wsUrl}/sync/notes`);
		ws.binaryType = 'arraybuffer';

		// Set up message handler - handle Bun's JSON-encoded binary data
		ws.onmessage = (event) => {
			const msg = parseWsMessage(event.data);
			if (msg) messages.push(msg);
		};

		const connected = await new Promise<boolean>((resolve) => {
			ws.onopen = () => resolve(true);
			ws.onerror = () => resolve(false);
			setTimeout(() => resolve(false), 2000);
		});

		expect(connected).toBe(true);

		// Wait for the initial sync message to arrive
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(messages.length).toBeGreaterThan(0);
		// First byte should be 0 (messageSync)
		expect(messages[0]![0]).toBe(0);

		ws.close();
	});

	test('WebSocket sync endpoint rejects invalid workspace', async () => {
		const ws = new WebSocket(`${wsUrl}/sync/invalid-workspace`);

		const closeCode = await new Promise<number>((resolve) => {
			ws.onclose = (event) => resolve(event.code);
			ws.onerror = () => resolve(0);
			setTimeout(() => resolve(-1), 2000);
		});

		// 4004 is the code for "Room not found"
		expect(closeCode).toBe(4004);
	});

	test('two clients can connect to same workspace', async () => {
		// Test that multiple clients can connect to the same workspace room
		// and both receive the initial sync message

		// Connect client 1
		const ws1 = new WebSocket(`${wsUrl}/sync/notes`);
		ws1.binaryType = 'arraybuffer';
		const messages1: Uint8Array[] = [];
		ws1.onmessage = (event) => {
			const msg = parseWsMessage(event.data);
			if (msg) messages1.push(msg);
		};

		const connected1 = await new Promise<boolean>((resolve) => {
			ws1.onopen = () => resolve(true);
			ws1.onerror = () => resolve(false);
			setTimeout(() => resolve(false), 2000);
		});
		expect(connected1).toBe(true);

		// Wait for initial sync on client 1
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(messages1.length).toBeGreaterThan(0);
		expect(messages1[0]![0]).toBe(0); // messageSync

		// Connect client 2
		const ws2 = new WebSocket(`${wsUrl}/sync/notes`);
		ws2.binaryType = 'arraybuffer';
		const messages2: Uint8Array[] = [];
		ws2.onmessage = (event) => {
			const msg = parseWsMessage(event.data);
			if (msg) messages2.push(msg);
		};

		const connected2 = await new Promise<boolean>((resolve) => {
			ws2.onopen = () => resolve(true);
			ws2.onerror = () => resolve(false);
			setTimeout(() => resolve(false), 2000);
		});
		expect(connected2).toBe(true);

		// Wait for initial sync on client 2
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(messages2.length).toBeGreaterThan(0);
		expect(messages2[0]![0]).toBe(0); // messageSync

		ws1.close();
		ws2.close();
	});
});
