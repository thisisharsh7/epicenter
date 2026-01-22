import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, date, id, integer, select, text } from '../schema';
import { createSchema } from './schema-helper';

describe('createSchema', () => {
	describe('schema.get()', () => {
		test('returns empty schema when nothing is set', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			const result = schema.get();
			expect(result).toEqual({});
		});

		test('returns full schema snapshot', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				icon: { type: 'emoji', value: '📝' },
				description: 'Blog posts',
				fields: { id: id(), title: text() },
			});

			schema.kv.set('theme', {
				name: 'Theme',
				icon: null,
				description: '',
				field: select({ options: ['light', 'dark'] }),
			});

			const result = schema.get();
			expect(result.tables).toBeDefined();
			expect(result.tables.posts).toBeDefined();
			expect(result.tables.posts.name).toBe('Posts');
			expect(result.kv).toBeDefined();
			expect(result.kv.theme).toBeDefined();
		});
	});

	describe('schema.tables', () => {
		test('set() creates a new table schema', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				icon: { type: 'emoji', value: '📝' },
				description: 'Blog posts',
				fields: { id: id(), title: text() },
			});

			expect(schema.tables.has('posts')).toBe(true);
			const posts = schema.tables.get('posts');
			expect(posts?.name).toBe('Posts');
			expect(posts?.fields.id.type).toBe('id');
			expect(posts?.fields.title.type).toBe('text');
		});

		test('get() returns undefined for non-existent table', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			expect(schema.tables.get('nonexistent')).toBeUndefined();
		});

		test('getAll() returns all table schemas', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text() },
			});
			schema.tables.set('users', {
				name: 'Users',
				fields: { id: id(), name: text() },
			});

			const all = schema.tables.getAll();
			expect(Object.keys(all)).toHaveLength(2);
			expect(all.posts.name).toBe('Posts');
			expect(all.users.name).toBe('Users');
		});

		test('delete() removes a table schema', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text() },
			});

			expect(schema.tables.has('posts')).toBe(true);
			const deleted = schema.tables.delete('posts');
			expect(deleted).toBe(true);
			expect(schema.tables.has('posts')).toBe(false);
		});

		test('delete() returns false for non-existent table', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			expect(schema.tables.delete('nonexistent')).toBe(false);
		});

		test('keys() returns all table names', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', { name: 'Posts', fields: { id: id() } });
			schema.tables.set('users', { name: 'Users', fields: { id: id() } });

			const keys = schema.tables.keys();
			expect(keys).toContain('posts');
			expect(keys).toContain('users');
		});
	});

	describe('schema.tables().fields', () => {
		test('set() adds a field to the table', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text() },
			});

			const postsHelper = schema.tables('posts');
			expect(postsHelper).toBeDefined();

			postsHelper!.fields.set('dueDate', date({ nullable: true }));

			expect(postsHelper!.fields.has('dueDate')).toBe(true);
			const field = postsHelper!.fields.get('dueDate');
			expect(field?.type).toBe('date');
		});

		test('delete() removes a field from the table', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text(), extra: boolean() },
			});

			const postsHelper = schema.tables('posts');
			expect(postsHelper!.fields.has('extra')).toBe(true);

			const deleted = postsHelper!.fields.delete('extra');
			expect(deleted).toBe(true);
			expect(postsHelper!.fields.has('extra')).toBe(false);
		});

		test('getAll() returns all fields', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text(), count: integer() },
			});

			const fields = schema.tables('posts')!.fields.getAll();
			expect(Object.keys(fields)).toHaveLength(3);
			expect(fields.id.type).toBe('id');
			expect(fields.title.type).toBe('text');
			expect(fields.count.type).toBe('integer');
		});

		test('keys() returns all field names', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				fields: { id: id(), title: text() },
			});

			const keys = schema.tables('posts')!.fields.keys();
			expect(keys).toContain('id');
			expect(keys).toContain('title');
		});
	});

	describe('schema.tables().metadata', () => {
		test('get() returns table metadata', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				icon: { type: 'emoji', value: '📝' },
				description: 'Blog posts',
				fields: { id: id() },
			});

			const meta = schema.tables('posts')!.metadata.get();
			expect(meta.name).toBe('Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' });
			expect(meta.description).toBe('Blog posts');
		});

		test('set() updates table metadata partially', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', {
				name: 'Posts',
				icon: { type: 'emoji', value: '📝' },
				description: 'Blog posts',
				fields: { id: id() },
			});

			const postsHelper = schema.tables('posts')!;
			postsHelper.metadata.set({ name: 'Blog Posts' });

			const meta = postsHelper.metadata.get();
			expect(meta.name).toBe('Blog Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' }); // unchanged
		});
	});

	describe('schema.kv', () => {
		test('set() creates a new KV schema', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.kv.set('theme', {
				name: 'Theme',
				icon: { type: 'emoji', value: '🎨' },
				description: 'Color theme',
				field: select({ options: ['light', 'dark'], default: 'light' }),
			});

			expect(schema.kv.has('theme')).toBe(true);
			const theme = schema.kv.get('theme');
			expect(theme?.name).toBe('Theme');
			expect(theme?.field.type).toBe('select');
		});

		test('get() returns undefined for non-existent key', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			expect(schema.kv.get('nonexistent')).toBeUndefined();
		});

		test('getAll() returns all KV schemas', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.kv.set('theme', {
				name: 'Theme',
				field: select({ options: ['light', 'dark'] }),
			});
			schema.kv.set('count', {
				name: 'Count',
				field: integer({ default: 0 }),
			});

			const all = schema.kv.getAll();
			expect(Object.keys(all)).toHaveLength(2);
			expect(all.theme.field.type).toBe('select');
			expect(all.count.field.type).toBe('integer');
		});

		test('delete() removes a KV schema', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.kv.set('theme', {
				name: 'Theme',
				field: select({ options: ['light', 'dark'] }),
			});

			expect(schema.kv.has('theme')).toBe(true);
			const deleted = schema.kv.delete('theme');
			expect(deleted).toBe(true);
			expect(schema.kv.has('theme')).toBe(false);
		});
	});

	describe('schema.merge()', () => {
		test('merges tables and kv schemas', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.merge({
				tables: {
					posts: { name: 'Posts', fields: { id: id(), title: text() } },
					users: { name: 'Users', fields: { id: id(), name: text() } },
				},
				kv: {
					theme: {
						name: 'Theme',
						field: select({ options: ['light', 'dark'] }),
					},
				},
			});

			expect(schema.tables.has('posts')).toBe(true);
			expect(schema.tables.has('users')).toBe(true);
			expect(schema.kv.has('theme')).toBe(true);
		});
	});

	describe('observation', () => {
		test('schema.observe() fires on any change', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			let callCount = 0;
			const unsub = schema.observe(() => {
				callCount++;
			});

			schema.tables.set('posts', { name: 'Posts', fields: { id: id() } });
			expect(callCount).toBeGreaterThan(0);

			unsub();
		});

		test('schema.tables.observe() fires on table add/delete', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			const changes: unknown[] = [];
			const unsub = schema.tables.observe((c) => {
				changes.push(...c);
			});

			schema.tables.set('posts', { name: 'Posts', fields: { id: id() } });
			expect(
				changes.some((c: any) => c.action === 'add' && c.key === 'posts'),
			).toBe(true);

			unsub();
		});

		test('fields.observe() fires on field add/delete', () => {
			const ydoc = new Y.Doc();
			const schemaMap = ydoc.getMap('schema');
			const schema = createSchema(schemaMap);

			schema.tables.set('posts', { name: 'Posts', fields: { id: id() } });

			const changes: unknown[] = [];
			const unsub = schema.tables('posts')!.fields.observe((c) => {
				changes.push(...c);
			});

			schema.tables('posts')!.fields.set('title', text());
			expect(
				changes.some((c: any) => c.action === 'add' && c.key === 'title'),
			).toBe(true);

			unsub();
		});
	});
});
