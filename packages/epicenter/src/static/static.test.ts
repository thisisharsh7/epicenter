/**
 * Comprehensive tests for the Static Workspace API.
 */

import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import * as Y from 'yjs';
import { createKV } from './create-kv.js';
import { createTables } from './create-tables.js';
import { defineKV } from './define-kv.js';
import { defineTable } from './define-table.js';
import { defineWorkspace } from './define-workspace.js';
import { createUnionSchema, validateWithSchema } from './schema-union.js';

// ════════════════════════════════════════════════════════════════════════════
// Schema Union Tests
// ════════════════════════════════════════════════════════════════════════════

describe('createUnionSchema', () => {
	test('validates against first matching schema', () => {
		const v1 = type({ id: 'string', title: 'string' });
		const v2 = type({ id: 'string', title: 'string', views: 'number' });

		const union = createUnionSchema([v1, v2]);
		const result = validateWithSchema(union, { id: '1', title: 'Hello' });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.value).toEqual({ id: '1', title: 'Hello' });
		}
	});

	test('validates against second schema when first fails', () => {
		const v1 = type({ id: 'string', title: 'string' });
		const v2 = type({ id: 'string', title: 'string', views: 'number' });

		const union = createUnionSchema([v1, v2]);
		const result = validateWithSchema(union, {
			id: '1',
			title: 'Hello',
			views: 42,
		});

		expect(result.success).toBe(true);
	});

	test('returns error when no schema matches', () => {
		const v1 = type({ id: 'string', title: 'string' });

		const union = createUnionSchema([v1]);
		const result = validateWithSchema(union, { id: 123 }); // id should be string

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues.length).toBeGreaterThan(0);
		}
	});
});

// ════════════════════════════════════════════════════════════════════════════
// defineTable Tests
// ════════════════════════════════════════════════════════════════════════════

describe('defineTable', () => {
	test('creates valid table definition with single version', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		expect(posts.versions).toHaveLength(1);
	});

	test('creates table definition with multiple versions', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.version(type({ id: 'string', title: 'string', views: 'number' }))
			.migrate((row) => {
				if (!('views' in row)) return { ...row, views: 0 };
				return row;
			});

		expect(posts.versions).toHaveLength(2);
	});

	test('migrate function transforms old version to latest', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.version(type({ id: 'string', title: 'string', views: 'number' }))
			.migrate((row) => {
				if (!('views' in row)) return { ...row, views: 0 };
				return row;
			});

		// Migrate v1 to v2
		const migrated = posts.migrate({ id: '1', title: 'Test' });
		expect(migrated).toEqual({ id: '1', title: 'Test', views: 0 });
	});

	test('throws when no versions are defined', () => {
		expect(() => {
			defineTable().migrate((row) => row);
		}).toThrow('defineTable() requires at least one .version() call');
	});
});

// ════════════════════════════════════════════════════════════════════════════
// defineKV Tests
// ════════════════════════════════════════════════════════════════════════════

describe('defineKV', () => {
	test('creates valid KV definition with single version', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		expect(theme.versions).toHaveLength(1);
	});

	test('creates KV definition with multiple versions', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.version(type({ mode: "'light' | 'dark' | 'system'", fontSize: 'number' }))
			.migrate((v) => {
				if (!('fontSize' in v)) return { ...v, fontSize: 14 };
				return v;
			});

		expect(theme.versions).toHaveLength(2);
	});

	test('migrate function transforms old version to latest', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.version(type({ mode: "'light' | 'dark'", fontSize: 'number' }))
			.migrate((v) => {
				if (!('fontSize' in v)) return { ...v, fontSize: 14 };
				return v;
			});

		const migrated = theme.migrate({ mode: 'dark' });
		expect(migrated).toEqual({ mode: 'dark', fontSize: 14 });
	});
});

// ════════════════════════════════════════════════════════════════════════════
// createTables Tests
// ════════════════════════════════════════════════════════════════════════════

describe('createTables', () => {
	test('set and get a row', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'Hello' });

		const result = tables.posts.get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row).toEqual({ id: '1', title: 'Hello' });
		}
	});

	test('get returns not_found for missing row', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		const result = tables.posts.get('nonexistent');
		expect(result.status).toBe('not_found');
	});

	test('getAll returns all rows', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'First' });
		tables.posts.set({ id: '2', title: 'Second' });

		const results = tables.posts.getAll();
		expect(results).toHaveLength(2);
	});

	test('getAllValid returns only valid rows', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'Valid' });

		const rows = tables.posts.getAllValid();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({ id: '1', title: 'Valid' });
	});

	test('filter returns matching rows', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string', published: 'boolean' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'Draft', published: false });
		tables.posts.set({ id: '2', title: 'Published', published: true });
		tables.posts.set({ id: '3', title: 'Another Published', published: true });

		const published = tables.posts.filter((row) => row.published);
		expect(published).toHaveLength(2);
	});

	test('find returns first matching row', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'First' });
		tables.posts.set({ id: '2', title: 'Second' });

		const found = tables.posts.find((row) => row.title === 'Second');
		expect(found).toEqual({ id: '2', title: 'Second' });
	});

	test('delete removes a row', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'Hello' });
		expect(tables.posts.has('1')).toBe(true);

		const result = tables.posts.delete('1');
		expect(result.status).toBe('deleted');
		expect(tables.posts.has('1')).toBe(false);
	});

	test('delete returns not_found_locally for missing row', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		const result = tables.posts.delete('nonexistent');
		expect(result.status).toBe('not_found_locally');
	});

	test('count returns number of rows', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		expect(tables.posts.count()).toBe(0);

		tables.posts.set({ id: '1', title: 'First' });
		tables.posts.set({ id: '2', title: 'Second' });

		expect(tables.posts.count()).toBe(2);
	});

	test('clear removes all rows', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		tables.posts.set({ id: '1', title: 'First' });
		tables.posts.set({ id: '2', title: 'Second' });
		expect(tables.posts.count()).toBe(2);

		tables.posts.clear();
		expect(tables.posts.count()).toBe(0);
	});

	test('migrates old data on read', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.version(type({ id: 'string', title: 'string', views: 'number' }))
			.migrate((row) => {
				if (!('views' in row)) return { ...row, views: 0 };
				return row;
			});

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		// Simulate writing old data by accessing the raw array
		const yarray = ydoc.getArray<{ key: string; val: unknown }>(
			'static:tables:posts',
		);
		yarray.push([{ key: '1', val: { id: '1', title: 'Old Post' } }]);

		// Read should migrate
		const result = tables.posts.get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.views).toBe(0);
		}
	});
});

// ════════════════════════════════════════════════════════════════════════════
// createKV Tests
// ════════════════════════════════════════════════════════════════════════════

describe('createKV', () => {
	test('set and get a value', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		kv.theme.set({ mode: 'dark' });

		const result = kv.theme.get();
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.value).toEqual({ mode: 'dark' });
		}
	});

	test('get returns not_found for unset key', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		const result = kv.theme.get();
		expect(result.status).toBe('not_found');
	});

	test('reset removes the value', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		kv.theme.set({ mode: 'dark' });
		expect(kv.theme.get().status).toBe('valid');

		kv.theme.reset();
		expect(kv.theme.get().status).toBe('not_found');
	});

	test('migrates old data on read', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.version(type({ mode: "'light' | 'dark'", fontSize: 'number' }))
			.migrate((v) => {
				if (!('fontSize' in v)) return { ...v, fontSize: 14 };
				return v;
			});

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		// Simulate old data
		const yarray = ydoc.getArray<{ key: string; val: unknown }>('static:kv');
		yarray.push([{ key: 'theme', val: { mode: 'dark' } }]);

		// Read should migrate
		const result = kv.theme.get();
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.value.fontSize).toBe(14);
		}
	});
});

// ════════════════════════════════════════════════════════════════════════════
// defineWorkspace Tests
// ════════════════════════════════════════════════════════════════════════════

describe('defineWorkspace', () => {
	test('creates workspace with tables and kv', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const workspace = defineWorkspace({
			id: 'test-app',
			tables: { posts },
			kv: { theme },
		});

		expect(workspace.id).toBe('test-app');
		expect(workspace.tableDefinitions).toHaveProperty('posts');
		expect(workspace.kvDefinitions).toHaveProperty('theme');
	});

	test('workspace.create() returns client with tables and kv', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const workspace = defineWorkspace({
			id: 'test-app',
			tables: { posts },
			kv: { theme },
		});

		const client = workspace.create();

		expect(client.id).toBe('test-app');
		expect(client.ydoc).toBeInstanceOf(Y.Doc);
		expect(client.tables.posts).toBeDefined();
		expect(client.kv.theme).toBeDefined();
	});

	test('client.tables and client.kv work correctly', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const workspace = defineWorkspace({
			id: 'test-app',
			tables: { posts },
			kv: { theme },
		});

		const client = workspace.create();

		// Use tables
		client.tables.posts.set({ id: '1', title: 'Hello' });
		const postResult = client.tables.posts.get('1');
		expect(postResult.status).toBe('valid');

		// Use KV
		client.kv.theme.set({ mode: 'dark' });
		const themeResult = client.kv.theme.get();
		expect(themeResult.status).toBe('valid');
	});

	test('workspace.create() with capabilities', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const workspace = defineWorkspace({
			id: 'test-app',
			tables: { posts },
		});

		// Mock capability
		const mockCapability = (_context: {
			ydoc: unknown;
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
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.migrate((row) => row);

		const workspace = defineWorkspace({
			id: 'test-app',
			tables: { posts },
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
		expect(Object.keys(client.kv)).toHaveLength(0);
	});
});

// ════════════════════════════════════════════════════════════════════════════
// Migration Scenarios
// ════════════════════════════════════════════════════════════════════════════

describe('Migration Scenarios', () => {
	test('three version migration with explicit _v field', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string', _v: '"1"' }))
			.version(
				type({ id: 'string', title: 'string', views: 'number', _v: '"2"' }),
			)
			.version(
				type({
					id: 'string',
					title: 'string',
					views: 'number',
					author: 'string | null',
					_v: '"3"',
				}),
			)
			.migrate((row) => {
				if (row._v === '1') {
					return { ...row, views: 0, author: null, _v: '3' as const };
				}
				if (row._v === '2') {
					return { ...row, author: null, _v: '3' as const };
				}
				return row;
			});

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		// Insert v1 data directly
		const yarray = ydoc.getArray<{ key: string; val: unknown }>(
			'static:tables:posts',
		);
		yarray.push([{ key: '1', val: { id: '1', title: 'Old', _v: '1' } }]);
		yarray.push([
			{ key: '2', val: { id: '2', title: 'Medium', views: 10, _v: '2' } },
		]);

		// Read should migrate both
		const v1Result = tables.posts.get('1');
		expect(v1Result.status).toBe('valid');
		if (v1Result.status === 'valid') {
			expect(v1Result.row._v).toBe('3');
			expect(v1Result.row.views).toBe(0);
			expect(v1Result.row.author).toBeNull();
		}

		const v2Result = tables.posts.get('2');
		expect(v2Result.status).toBe('valid');
		if (v2Result.status === 'valid') {
			expect(v2Result.row._v).toBe('3');
			expect(v2Result.row.views).toBe(10);
			expect(v2Result.row.author).toBeNull();
		}
	});

	test('migration without explicit version field', () => {
		const posts = defineTable()
			.version(type({ id: 'string', title: 'string' }))
			.version(type({ id: 'string', title: 'string', views: 'number' }))
			.version(
				type({
					id: 'string',
					title: 'string',
					views: 'number',
					tags: 'string[]',
				}),
			)
			.migrate((row) => {
				let current = row as {
					id: string;
					title: string;
					views?: number;
					tags?: string[];
				};
				if (!('views' in current)) {
					current = { ...current, views: 0 };
				}
				if (!('tags' in current)) {
					current = { ...current, tags: [] };
				}
				return current as {
					id: string;
					title: string;
					views: number;
					tags: string[];
				};
			});

		const ydoc = new Y.Doc();
		const tables = createTables(ydoc, { posts });

		// Insert v1 data
		const yarray = ydoc.getArray<{ key: string; val: unknown }>(
			'static:tables:posts',
		);
		yarray.push([{ key: '1', val: { id: '1', title: 'Old' } }]);

		const result = tables.posts.get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.views).toBe(0);
			expect(result.row.tags).toEqual([]);
		}
	});
});
