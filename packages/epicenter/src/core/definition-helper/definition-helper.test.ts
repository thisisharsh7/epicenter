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
		test('tables() returns undefined for non-existent table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.tables('nonexistent')).toBeUndefined();
		});

		test('tables() returns helper for existing table', () => {
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

			const posts = definition.tables('posts');
			expect(posts).toBeDefined();
			expect(posts!.toJSON().name).toBe('Posts');
		});

		test('tables.set() creates a new table definition', () => {
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

			expect(definition.tables('posts')).toBeDefined();
			const posts = definition.tables('posts')!.toJSON();
			expect(posts.name).toBe('Posts');
			expect(posts.fields.id.type).toBe('id');
			expect(posts.fields.title.type).toBe('text');
		});

		test('tables.toJSON() returns all table definitions', () => {
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

		test('tables().delete() removes a table definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			expect(definition.tables('posts')).toBeDefined();
			const deleted = definition.tables('posts')!.delete();
			expect(deleted).toBe(true);
			expect(definition.tables('posts')).toBeUndefined();
		});

		test('tables.keys() returns all table names', () => {
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
		test('fields() returns undefined for non-existent field', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			expect(definition.tables('posts')!.fields('nonexistent')).toBeUndefined();
		});

		test('fields() returns helper for existing field', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			const title = definition.tables('posts')!.fields('title');
			expect(title).toBeDefined();
			expect(title!.toJSON().type).toBe('text');
		});

		test('fields.set() adds a field to the table', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			definition
				.tables('posts')!
				.fields.set('dueDate', date({ nullable: true }));

			const field = definition.tables('posts')!.fields('dueDate');
			expect(field).toBeDefined();
			expect(field!.toJSON().type).toBe('date');
		});

		test('fields().delete() removes a field from the table', () => {
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

			expect(definition.tables('posts')!.fields('extra')).toBeDefined();

			const deleted = definition.tables('posts')!.fields('extra')!.delete();
			expect(deleted).toBe(true);
			expect(definition.tables('posts')!.fields('extra')).toBeUndefined();
		});

		test('fields.toJSON() returns all fields', () => {
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

		test('fields.keys() returns all field names', () => {
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
		test('metadata.toJSON() returns table metadata', () => {
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

			const meta = definition.tables('posts')!.metadata.toJSON();
			expect(meta.name).toBe('Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' });
			expect(meta.description).toBe('Blog posts');
		});

		test('metadata.set() updates table metadata partially', () => {
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

			definition.tables('posts')!.metadata.set({ name: 'Blog Posts' });

			const meta = definition.tables('posts')!.metadata.toJSON();
			expect(meta.name).toBe('Blog Posts');
			expect(meta.icon).toEqual({ type: 'emoji', value: '📝' }); // unchanged
		});
	});

	describe('definition.kv', () => {
		test('kv() returns undefined for non-existent key', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.kv('nonexistent')).toBeUndefined();
		});

		test('kv() returns helper for existing key', () => {
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

			const theme = definition.kv('theme');
			expect(theme).toBeDefined();
			expect(theme!.toJSON().name).toBe('Theme');
		});

		test('kv.set() creates a new KV definition', () => {
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

			expect(definition.kv('theme')).toBeDefined();
			const theme = definition.kv('theme')!.toJSON();
			expect(theme.name).toBe('Theme');
			expect(theme.field.type).toBe('select');
		});

		test('kv.toJSON() returns all KV definitions', () => {
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

		test('kv().delete() removes a KV definition', () => {
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

			expect(definition.kv('theme')).toBeDefined();
			const deleted = definition.kv('theme')!.delete();
			expect(deleted).toBe(true);
			expect(definition.kv('theme')).toBeUndefined();
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

			expect(definition.tables('posts')).toBeDefined();
			expect(definition.tables('users')).toBeDefined();
			expect(definition.kv('theme')).toBeDefined();
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

	describe('existence checks (no .has() needed)', () => {
		test('check table exists by calling tables()', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			// Doesn't exist
			expect(definition.tables('posts')).toBeUndefined();
			expect(!!definition.tables('posts')).toBe(false);

			// Create it
			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			// Now exists
			expect(definition.tables('posts')).toBeDefined();
			expect(!!definition.tables('posts')).toBe(true);
		});

		test('check field exists by calling fields()', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			// Doesn't exist
			expect(definition.tables('posts')!.fields('title')).toBeUndefined();

			// Create it
			definition.tables('posts')!.fields.set('title', text());

			// Now exists
			expect(definition.tables('posts')!.fields('title')).toBeDefined();
		});
	});
});
