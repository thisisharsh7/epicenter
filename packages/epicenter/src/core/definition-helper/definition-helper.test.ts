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

		test('tables.get() returns snapshot without helper', () => {
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

			const snapshot = definition.tables.get('posts');
			expect(snapshot).toBeDefined();
			expect(snapshot!.name).toBe('Posts');
			expect(snapshot!.fields.id.type).toBe('id');
		});

		test('tables.has() checks existence', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.tables.has('posts')).toBe(false);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			expect(definition.tables.has('posts')).toBe(true);
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

		test('tables.entries() returns [name, definition] pairs', () => {
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

			const entries = definition.tables.entries();
			expect(entries).toHaveLength(2);
			expect(entries.map(([name]) => name).sort()).toEqual(['posts', 'users']);
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
		test('fields.get() returns undefined for non-existent field', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			expect(
				definition.tables('posts')!.fields.get('nonexistent'),
			).toBeUndefined();
		});

		test('fields.get() returns schema for existing field', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			const titleSchema = definition.tables('posts')!.fields.get('title');
			expect(titleSchema).toBeDefined();
			expect(titleSchema!.type).toBe('text');
		});

		test('fields.has() checks field existence', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			expect(definition.tables('posts')!.fields.has('title')).toBe(true);
			expect(definition.tables('posts')!.fields.has('nonexistent')).toBe(false);
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

			const field = definition.tables('posts')!.fields.get('dueDate');
			expect(field).toBeDefined();
			expect(field!.type).toBe('date');
		});

		test('fields.delete() removes a field from the table', () => {
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

			expect(definition.tables('posts')!.fields.has('extra')).toBe(true);

			const deleted = definition.tables('posts')!.fields.delete('extra');
			expect(deleted).toBe(true);
			expect(definition.tables('posts')!.fields.has('extra')).toBe(false);
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

		test('fields.entries() returns [name, schema] pairs', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id(), title: text() } }),
			);

			const entries = definition.tables('posts')!.fields.entries();
			expect(entries).toHaveLength(2);
			expect(entries.map(([name]) => name).sort()).toEqual(['id', 'title']);
		});
	});

	describe('definition.tables() property getters and setters', () => {
		test('property getters return table metadata', () => {
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

			const posts = definition.tables('posts')!;
			expect(posts.name).toBe('Posts');
			expect(posts.icon).toBe('emoji:📝');
			expect(posts.description).toBe('Blog posts');
		});

		test('setName() updates table name', () => {
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

			const posts = definition.tables('posts')!;
			posts.setName('Blog Posts');

			expect(posts.name).toBe('Blog Posts');
			expect(posts.icon).toBe('emoji:📝'); // unchanged
		});

		test('setIcon() updates table icon', () => {
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

			const posts = definition.tables('posts')!;
			posts.setIcon('emoji:✍️');

			expect(posts.icon).toBe('emoji:✍️');
			expect(posts.name).toBe('Posts'); // unchanged
		});

		test('setDescription() updates table description', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({
					name: 'Posts',
					description: 'Blog posts',
					fields: { id: id() },
				}),
			);

			const posts = definition.tables('posts')!;
			posts.setDescription('All my blog posts');

			expect(posts.description).toBe('All my blog posts');
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

		test('kv.get() returns snapshot without helper', () => {
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

			const snapshot = definition.kv.get('theme');
			expect(snapshot).toBeDefined();
			expect(snapshot!.name).toBe('Theme');
			expect(snapshot!.field.type).toBe('select');
		});

		test('kv.has() checks existence', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			expect(definition.kv.has('theme')).toBe(false);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					field: select({ options: ['light', 'dark'] }),
				}),
			);

			expect(definition.kv.has('theme')).toBe(true);
		});

		test('kv.set() creates a new KV definition', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					icon: 'emoji:🎨',
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

		test('kv.entries() returns [name, definition] pairs', () => {
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

			const entries = definition.kv.entries();
			expect(entries).toHaveLength(2);
			expect(entries.map(([name]) => name).sort()).toEqual(['count', 'theme']);
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

	describe('definition.kv() property getters and setters', () => {
		test('property getters return KV metadata', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.kv.set(
				'theme',
				setting({
					name: 'Theme',
					icon: 'emoji:🎨',
					description: 'Color theme',
					field: select({ options: ['light', 'dark'] }),
				}),
			);

			const theme = definition.kv('theme')!;
			expect(theme.name).toBe('Theme');
			expect(theme.icon).toBe('emoji:🎨');
			expect(theme.description).toBe('Color theme');
			expect(theme.field.type).toBe('select');
		});

		test('setName() updates KV name', () => {
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

			const theme = definition.kv('theme')!;
			theme.setName('Color Theme');

			expect(theme.name).toBe('Color Theme');
		});

		test('setField() updates KV field schema', () => {
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

			const theme = definition.kv('theme')!;
			theme.setField(select({ options: ['light', 'dark', 'auto'] }));

			expect(theme.field.type).toBe('select');
			expect((theme.field as { options: string[] }).options).toContain('auto');
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

	describe('existence checks', () => {
		test('check table exists by calling tables() or tables.has()', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			// Doesn't exist
			expect(definition.tables('posts')).toBeUndefined();
			expect(definition.tables.has('posts')).toBe(false);

			// Create it
			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			// Now exists
			expect(definition.tables('posts')).toBeDefined();
			expect(definition.tables.has('posts')).toBe(true);
		});

		test('check field exists by calling fields.has()', () => {
			const ydoc = new Y.Doc();
			const definitionMap = ydoc.getMap('definition');
			const definition = createDefinition(definitionMap);

			definition.tables.set(
				'posts',
				table({ name: 'Posts', fields: { id: id() } }),
			);

			// Doesn't exist
			expect(definition.tables('posts')!.fields.has('title')).toBe(false);

			// Create it
			definition.tables('posts')!.fields.set('title', text());

			// Now exists
			expect(definition.tables('posts')!.fields.has('title')).toBe(true);
		});
	});
});
