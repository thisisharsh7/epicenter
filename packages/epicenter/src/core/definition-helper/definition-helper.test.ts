import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
	boolean,
	date,
	id,
	integer,
	select,
	setting,
	table,
	text,
} from '../schema';
import { createDefinition } from './definition-helper';

describe('createDefinition', () => {
	describe('definition.toJSON()', () => {
		test('returns empty definition when nothing is set', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			const result = definition.toJSON();
			expect(result).toEqual({});
		});

		test('returns full definition snapshot', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					icon: '📝',
					description: 'Blog posts',
					fields: { id: id(), title: text() },
				}),
			);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					field: select({ options: ['light', 'dark'] }),
				}),
			);

			const result = definition.toJSON();
			expect(result.tables).toBeDefined();
			expect(result.tables.posts).toBeDefined();
			expect(result.tables.posts.name).toBe('Posts');
			expect(result.kv).toBeDefined();
			expect(result.kv.theme).toBeDefined();
		});
	});

	describe('definition.tables', () => {
		test('set() creates a new table definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					icon: '📝',
					description: 'Blog posts',
					fields: { id: id(), title: text() },
				}),
			);

			expect(definition.tables.has('posts')).toBe(true);
			const posts = definition.tables.get('posts');
			expect(posts?.name).toBe('Posts');
			expect(posts?.fields.id.type).toBe('id');
			expect(posts?.fields.title.type).toBe('text');
		});

		test('get() returns undefined for non-existent table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.tables.get('nonexistent')).toBeUndefined();
		});

		test('toJSON() returns all table definitions', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);
			definition.tables.set(
				'users',
				table({ name: 'Users', fields: { id: id(), name: text() } }),
			);

			const all = definition.tables.toJSON();
			expect(Object.keys(all)).toHaveLength(2);
			expect(all.posts.name).toBe('Posts');
			expect(all.users.name).toBe('Users');
		});

		test('delete() removes a table definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			expect(definition.tables.has('posts')).toBe(true);
			const deleted = definition.tables.delete('posts');
			expect(deleted).toBe(true);
			expect(definition.tables.has('posts')).toBe(false);
		});

		test('delete() returns false for non-existent table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.tables.delete('nonexistent')).toBe(false);
		});

		test('keys() returns all table names', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);
			definition.tables.set(
				'users',
				table({ name: 'Users', fields: { id: id() } }),
			);

			const keys = definition.tables.keys();
			expect(keys).toContain('posts');
			expect(keys).toContain('users');
		});
	});

	describe('definition.tables().fields', () => {
		test('set() adds a field to the table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			const postsHelper = definition.tables('posts');
			expect(postsHelper).toBeDefined();

			postsHelper!.fields.set('dueDate', date({ nullable: true }));

			expect(postsHelper!.fields.has('dueDate')).toBe(true);
			const field = postsHelper!.fields.get('dueDate');
			expect(field?.type).toBe('date');
		});

		test('delete() removes a field from the table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					fields: { id: id(), title: text(), extra: boolean() },
				}),
			);

			const postsHelper = definition.tables('posts');
			expect(postsHelper!.fields.has('extra')).toBe(true);

			const deleted = postsHelper!.fields.delete('extra');
			expect(deleted).toBe(true);
			expect(postsHelper!.fields.has('extra')).toBe(false);
		});

		test('toJSON() returns all fields', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					fields: { id: id(), title: text(), count: integer() },
				}),
			);

			const fields = definition.tables('posts')!.fields.toJSON();
			expect(Object.keys(fields)).toHaveLength(3);
			expect(fields.id.type).toBe('id');
			expect(fields.title.type).toBe('text');
			expect(fields.count.type).toBe('integer');
		});

		test('keys() returns all field names', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			const keys = definition.tables('posts')!.fields.keys();
			expect(keys).toContain('id');
			expect(keys).toContain('title');
		});
	});

	describe('definition.tables().metadata', () => {
		test('get() returns table metadata', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					icon: '📝',
					description: 'Blog posts',
					fields: { id: id() },
				}),
			);

			const meta = definition.tables('posts')!.metadata.get();
			expect(meta.name).toBe('Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' });
			expect(meta.description).toBe('Blog posts');
		});

		test('set() updates table metadata partially', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					icon: '📝',
					description: 'Blog posts',
					fields: { id: id() },
				}),
			);

			const postsHelper = definition.tables('posts')!;
			postsHelper.metadata.set({ name: 'Blog Posts' });

			const meta = postsHelper.metadata.get();
			expect(meta.name).toBe('Blog Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' }); // unchanged
		});
	});

	describe('definition.kv', () => {
		test('set() creates a new KV definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					icon: { type: 'emoji', value: '🎨' },
					description: 'Color theme',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			);

			expect(definition.kv.has('theme')).toBe(true);
			const theme = definition.kv.get('theme');
			expect(theme?.name).toBe('Theme');
			expect(theme?.field.type).toBe('select');
		});

		test('get() returns undefined for non-existent key', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.kv.get('nonexistent')).toBeUndefined();
		});

		test('toJSON() returns all KV definitions', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					field: select({ options: ['light', 'dark'] }),
				}),
			);
			definition.kv.set(
				'count',
				setting({ name: 'Count', field: integer({ default: 0 }) }),
			);

			const all = definition.kv.toJSON();
			expect(Object.keys(all)).toHaveLength(2);
			expect(all.theme.field.type).toBe('select');
			expect(all.count.field.type).toBe('integer');
		});

		test('delete() removes a KV definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					field: select({ options: ['light', 'dark'] }),
				}),
			);

			expect(definition.kv.has('theme')).toBe(true);
			const deleted = definition.kv.delete('theme');
			expect(deleted).toBe(true);
			expect(definition.kv.has('theme')).toBe(false);
		});
	});

	describe('definition.merge()', () => {
		test('merges tables and kv definitions', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.merge({
				tables: {
					posts: table({ name: 'Posts', fields: { id: id(), title: text() } }),
					users: table({ name: 'Users', fields: { id: id(), name: text() } }),
				},
				kv: {
					theme: setting({
						name: 'Theme',
						field: select({ options: ['light', 'dark'] }),
					}),
				},
			});

			expect(definition.tables.has('posts')).toBe(true);
			expect(definition.tables.has('users')).toBe(true);
			expect(definition.kv.has('theme')).toBe(true);
		});
	});

	describe('observation', () => {
		test('definition.observe() fires on any change', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			let callCount = 0;
			const unsub = definition.observe(() => {
				callCount++;
			});

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);
			expect(callCount).toBeGreaterThan(0);

			unsub();
		});

		test('definition.tables.observe() fires on table add/delete', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			const allChanges: Map<string, 'add' | 'delete'>[] = [];
			const unsub = definition.tables.observe((changes) => {
				allChanges.push(changes);
			});

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);
			expect(allChanges.length).toBeGreaterThan(0);
			expect(allChanges.some((m) => m.get('posts') === 'add')).toBe(true);

			unsub();
		});

		test('fields.observe() fires on field add/update/delete', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			const allChanges: Map<string, 'add' | 'update' | 'delete'>[] = [];
			const unsub = definition.tables('posts')!.fields.observe((changes) => {
				allChanges.push(changes);
			});

			definition.tables('posts')!.fields.set('title', text());
			expect(allChanges.length).toBeGreaterThan(0);
			expect(allChanges.some((m) => m.get('title') === 'add')).toBe(true);

			unsub();
		});
	});
});
