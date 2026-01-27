import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import * as Y from 'yjs';
import { defineKv } from './define-kv.js';
import { defineTable } from './define-table.js';
import { defineWorkspace } from './define-workspace.js';

describe('defineWorkspace', () => {
	test('creates workspace with tables and kv', () => {
		const workspace = defineWorkspace({
			id: 'test-app',
			tables: {
				posts: defineTable()
					.version(type({ id: 'string', title: 'string' }))
					.migrate((row) => row),
			},
			kv: {
				theme: defineKv()
					.version(type({ mode: "'light' | 'dark'" }))
					.migrate((v) => v),
			},
		});

		expect(workspace.id).toBe('test-app');
		expect(workspace.tableDefinitions).toHaveProperty('posts');
		expect(workspace.kvDefinitions).toHaveProperty('theme');
	});

	test('workspace.create() returns client with tables and kv', () => {
		const workspace = defineWorkspace({
			id: 'test-app',
			tables: {
				posts: defineTable()
					.version(type({ id: 'string', title: 'string' }))
					.migrate((row) => row),
			},
			kv: {
				theme: defineKv()
					.version(type({ mode: "'light' | 'dark'" }))
					.migrate((v) => v),
			},
		});

		const client = workspace.create();

		expect(client.id).toBe('test-app');
		expect(client.ydoc).toBeInstanceOf(Y.Doc);
		expect(client.tables.posts).toBeDefined();
		expect(client.kv.get).toBeDefined();
	});

	test('client.tables and client.kv work correctly', () => {
		const workspace = defineWorkspace({
			id: 'test-app',
			tables: {
				posts: defineTable()
					.version(type({ id: 'string', title: 'string' }))
					.migrate((row) => row),
			},
			kv: {
				theme: defineKv()
					.version(type({ mode: "'light' | 'dark'" }))
					.migrate((v) => v),
			},
		});

		const client = workspace.create();

		// Use tables
		client.tables.posts.set({ id: '1', title: 'Hello' });
		const postResult = client.tables.posts.get('1');
		expect(postResult.status).toBe('valid');

		// Use KV
		client.kv.set('theme', { mode: 'dark' });
		const themeResult = client.kv.get('theme');
		expect(themeResult.status).toBe('valid');
	});

	test('workspace.create() with capabilities', () => {
		const workspace = defineWorkspace({
			id: 'test-app',
			tables: {
				posts: defineTable()
					.version(type({ id: 'string', title: 'string' }))
					.migrate((row) => row),
			},
		});

		// Mock capability
		const mockCapability = (_context: {
			ydoc: Y.Doc;
			tables: unknown;
			kv: unknown;
		}) => ({
			whenSynced: Promise.resolve(),
			customMethod: () => 'hello',
		});

		const client = workspace.create({
			mock: mockCapability,
		});

		expect(client.capabilities.mock).toBeDefined();
		expect(client.capabilities.mock.customMethod()).toBe('hello');
	});

	test('client.destroy() cleans up', async () => {
		const workspace = defineWorkspace({
			id: 'test-app',
			tables: {
				posts: defineTable()
					.version(type({ id: 'string', title: 'string' }))
					.migrate((row) => row),
			},
		});

		let destroyed = false;
		const mockCapability = () => ({
			destroy: async () => {
				destroyed = true;
			},
		});

		const client = workspace.create({
			mock: mockCapability,
		});

		await client.destroy();
		expect(destroyed).toBe(true);
	});

	test('workspace with empty tables and kv', () => {
		const workspace = defineWorkspace({
			id: 'empty-app',
		});

		const client = workspace.create();

		expect(client.id).toBe('empty-app');
		expect(Object.keys(client.tables)).toHaveLength(0);
		// KV always has methods (get, set, delete, observe), but no keys are defined
		expect(client.kv.get).toBeDefined();
	});
});
