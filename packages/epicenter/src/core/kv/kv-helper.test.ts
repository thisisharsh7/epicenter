import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
	boolean,
	DateWithTimezone,
	date as dateField,
	integer,
	real,
	select,
	tags,
	text,
	richtext,
} from '../schema';
import { createKv } from './core';

describe('KV Helpers', () => {
	describe('Basic Operations', () => {
		test('text field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			expect(kv.username.get()).toBe('alice');
		});

		test('text field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ default: 'user' }),
			});

			expect(kv.role.get()).toBe('user');
		});

		test('text field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			expect(kv.bio.get()).toBe(null);
		});

		test('text field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			expect(kv.username.get()).toBe('alice');

			kv.username.set('bob');
			expect(kv.username.get()).toBe('bob');
		});

		test('text field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ default: 'user' }),
			});

			kv.role.set('admin');
			expect(kv.role.get()).toBe('admin');

			kv.role.reset();
			expect(kv.role.get()).toBe('user');
		});

		test('integer field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer(),
			});

			kv.count.set(42);
			expect(kv.count.get()).toBe(42);
		});

		test('integer field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			expect(kv.count.get()).toBe(0);
		});

		test('integer field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			kv.count.set(10);
			expect(kv.count.get()).toBe(10);

			kv.count.set(20);
			expect(kv.count.get()).toBe(20);
		});

		test('integer field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			kv.count.set(100);
			kv.count.reset();
			expect(kv.count.get()).toBe(0);
		});

		test('real field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: real(),
			});

			kv.price.set(19.99);
			expect(kv.price.get()).toBe(19.99);
		});

		test('real field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: real({ default: 0.0 }),
			});

			expect(kv.price.get()).toBe(0.0);
		});

		test('boolean field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean(),
			});

			kv.enabled.set(true);
			expect(kv.enabled.get()).toBe(true);

			kv.enabled.set(false);
			expect(kv.enabled.get()).toBe(false);
		});

		test('boolean field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean({ default: false }),
			});

			expect(kv.enabled.get()).toBe(false);
		});

		test('boolean field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean({ default: false }),
			});

			kv.enabled.set(true);
			kv.enabled.reset();
			expect(kv.enabled.get()).toBe(false);
		});

		test('select field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'] }),
			});

			kv.theme.set('dark');
			expect(kv.theme.get()).toBe('dark');
		});

		test('select field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			expect(kv.theme.get()).toBe('light');
		});

		test('select field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			kv.theme.set('dark');
			expect(kv.theme.get()).toBe('dark');

			kv.theme.set('light');
			expect(kv.theme.get()).toBe('light');
		});

		test('select field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			kv.theme.set('dark');
			kv.theme.reset();
			expect(kv.theme.get()).toBe('light');
		});

		test('date field: get() returns correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField(),
			});

			const now = DateWithTimezone({
				date: new Date('2024-01-01T00:00:00.000Z'),
				timezone: 'America/New_York',
			});
			kv.last_sync.set(now.toJSON());
			expect(kv.last_sync.get()).toBe(now.toJSON());
		});

		test('date field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const defaultDate = DateWithTimezone({
				date: new Date('2024-01-01T00:00:00.000Z'),
				timezone: 'UTC',
			});
			const kv = createKv(ydoc, {
				last_sync: dateField({ default: defaultDate }),
			});

			expect(kv.last_sync.get()).toBe(defaultDate.toJSON());
		});

		test('date field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField({ nullable: true }),
			});

			expect(kv.last_sync.get()).toBe(null);
		});

		test('date field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField(),
			});

			const date1 = DateWithTimezone({
				date: new Date('2024-01-01T00:00:00.000Z'),
				timezone: 'America/New_York',
			});
			const date2 = DateWithTimezone({
				date: new Date('2024-01-02T00:00:00.000Z'),
				timezone: 'America/New_York',
			});

			kv.last_sync.set(date1.toJSON());
			expect(kv.last_sync.get()).toBe(date1.toJSON());

			kv.last_sync.set(date2.toJSON());
			expect(kv.last_sync.get()).toBe(date2.toJSON());
		});

		test('date field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const defaultDate = DateWithTimezone({
				date: new Date('2024-01-01T00:00:00.000Z'),
				timezone: 'UTC',
			});
			const kv = createKv(ydoc, {
				last_sync: dateField({ default: defaultDate }),
			});

			const newDate = DateWithTimezone({
				date: new Date('2024-02-01T00:00:00.000Z'),
				timezone: 'UTC',
			});
			kv.last_sync.set(newDate.toJSON());
			kv.last_sync.reset();
			expect(kv.last_sync.get()).toBe(defaultDate.toJSON());
		});
	});

	describe('Richtext and Tags Fields', () => {
		test('richtext field: get() returns string (ID reference)', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext(),
			});

			kv.notes.set('rtxt_abc123');
			expect(kv.notes.get()).toBe('rtxt_abc123');
		});

		test('richtext field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext(),
			});

			kv.notes.set('rtxt_first');
			expect(kv.notes.get()).toBe('rtxt_first');

			kv.notes.set('rtxt_second');
			expect(kv.notes.get()).toBe('rtxt_second');
		});

		test('richtext field: nullable returns null when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext({ nullable: true }),
			});

			expect(kv.notes.get()).toBe(null);
		});

		test('tags field: get() returns plain array', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			kv.tags.set(['typescript', 'javascript']);
			expect(kv.tags.get()).toEqual(['typescript', 'javascript']);
		});

		test('tags field: set() replaces existing content', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			kv.tags.set(['typescript']);
			kv.tags.set(['python', 'javascript']);
			expect(kv.tags.get()).toEqual(['python', 'javascript']);
		});

		test('tags field without options: allows any strings', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				categories: tags(),
			});

			kv.categories.set(['anything', 'goes', 'here']);
			expect(kv.categories.get()).toEqual(['anything', 'goes', 'here']);
		});
	});

	describe('Observe', () => {
		test('observe() fires callback when value changes', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			const values: string[] = [];
			kv.theme.observe((value) => {
				values.push(value);
			});

			kv.theme.set('dark');
			kv.theme.set('light');

			expect(values).toEqual(['dark', 'light']);
		});

		test('observe() only fires for the specific key, not other keys', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
				count: integer({ default: 0 }),
			});

			const themeValues: string[] = [];
			kv.theme.observe((value) => {
				themeValues.push(value);
			});

			const countValues: number[] = [];
			kv.count.observe((value) => {
				countValues.push(value);
			});

			kv.theme.set('dark');
			kv.count.set(42);
			kv.theme.set('light');

			expect(themeValues).toEqual(['dark', 'light']);
			expect(countValues).toEqual([42]);
		});

		test('observe() unsubscribe function stops callbacks', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			const values: number[] = [];
			const unsubscribe = kv.count.observe((value) => {
				values.push(value);
			});

			kv.count.set(1);
			kv.count.set(2);
			unsubscribe();
			kv.count.set(3);

			expect(values).toEqual([1, 2]);
		});

		test('observe() fires when richtext is set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext(),
			});

			let callCount = 0;
			kv.notes.observe(() => {
				callCount++;
			});

			kv.notes.set('rtxt_abc123');
			expect(callCount).toBe(1);
		});

		test('observe() fires when tags array is set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: tags({ options: ['a', 'b', 'c'] }),
			});

			let callCount = 0;
			kv.tags.observe(() => {
				callCount++;
			});

			kv.tags.set(['a']);
			expect(callCount).toBe(1);
		});
	});

	describe('Edge Cases', () => {
		test('multiple sets in sequence', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			kv.count.set(1);
			kv.count.set(2);
			kv.count.set(3);
			kv.count.set(4);
			expect(kv.count.get()).toBe(4);
		});

		test('setting same value twice', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			const values: string[] = [];
			kv.theme.observe((value) => {
				values.push(value);
			});

			kv.theme.set('dark');
			kv.theme.set('dark');
			kv.theme.set('dark');

			expect(values).toEqual(['dark', 'dark', 'dark']);
		});

		test('interaction between multiple KV fields', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
				font_size: integer({ default: 14 }),
				show_line_numbers: boolean({ default: true }),
			});

			kv.theme.set('dark');
			kv.font_size.set(16);
			kv.show_line_numbers.set(false);

			expect(kv.theme.get()).toBe('dark');
			expect(kv.font_size.get()).toBe(16);
			expect(kv.show_line_numbers.get()).toBe(false);

			kv.theme.reset();
			expect(kv.theme.get()).toBe('light');

			expect(kv.font_size.get()).toBe(16);
			expect(kv.show_line_numbers.get()).toBe(false);
		});

		test('nullable field: set to null explicitly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			kv.bio.set('Hello');
			expect(kv.bio.get()).toBe('Hello');

			kv.bio.set(null);
			expect(kv.bio.get()).toBe(null);
		});

		test('nullable field with default: set to null clears default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ nullable: true, default: 'user' }),
			});

			expect(kv.role.get()).toBe('user');

			kv.role.set(null);
			expect(kv.role.get()).toBe(null);
		});

		test('reset on nullable field with no default sets to null', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			kv.bio.set('Hello');
			expect(kv.bio.get()).toBe('Hello');

			kv.bio.reset();
			expect(kv.bio.get()).toBe(null);
		});

		test('reset on non-nullable field with no default deletes the key', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			expect(kv.username.get()).toBe('alice');

			kv.username.reset();
			expect(kv.username.get() as string | undefined).toBe(undefined);
		});

		test('$all() returns all helpers', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
				count: integer({ default: 0 }),
				enabled: boolean({ default: true }),
			});

			const all = kv.$all();
			expect(all).toHaveLength(3);
			expect(all.map((h) => h.name).sort()).toEqual([
				'count',
				'enabled',
				'theme',
			]);
		});

		test('$toJSON() serializes all values', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
				count: integer({ default: 0 }),
				enabled: boolean({ default: true }),
			});

			kv.theme.set('dark');
			kv.count.set(42);

			const json = kv.$toJSON();
			expect(json).toEqual({
				theme: 'dark',
				count: 42,
				enabled: true,
			});
		});

		test('clearAll() removes all values', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
				count: integer({ default: 0 }),
			});

			kv.theme.set('dark');
			kv.count.set(42);

			kv.clearAll();

			expect(kv.theme.get()).toBe('light');
			expect(kv.count.get()).toBe(0);
		});
	});
});
