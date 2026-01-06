import { describe, expect, test } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import * as Y from 'yjs';
import {
	boolean,
	date as dateField,
	integer,
	real,
	select,
	tags,
	text,
	richtext,
	toDateTimeString,
} from '../schema';
import { createKv } from './core';

describe('KV Helpers', () => {
	describe('Basic Operations', () => {
		test('text field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			const result = kv.username.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}
		});

		test('text field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ default: 'user' }),
			});

			const result = kv.role.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}
		});

		test('text field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			const result = kv.bio.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('text field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			let result = kv.username.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}

			kv.username.set('bob');
			result = kv.username.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('bob');
			}
		});

		test('text field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ default: 'user' }),
			});

			kv.role.set('admin');
			let result = kv.role.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('admin');
			}

			kv.role.reset();
			result = kv.role.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}
		});

		test('integer field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer(),
			});

			kv.count.set(42);
			const result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(42);
			}
		});

		test('integer field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			const result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0);
			}
		});

		test('integer field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			kv.count.set(10);
			let result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(10);
			}

			kv.count.set(20);
			result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(20);
			}
		});

		test('integer field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			kv.count.set(100);
			kv.count.reset();
			const result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0);
			}
		});

		test('real field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: real(),
			});

			kv.price.set(19.99);
			const result = kv.price.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(19.99);
			}
		});

		test('real field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: real({ default: 0.0 }),
			});

			const result = kv.price.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0.0);
			}
		});

		test('boolean field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean(),
			});

			kv.enabled.set(true);
			let result = kv.enabled.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(true);
			}

			kv.enabled.set(false);
			result = kv.enabled.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('boolean field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean({ default: false }),
			});

			const result = kv.enabled.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('boolean field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: boolean({ default: false }),
			});

			kv.enabled.set(true);
			kv.enabled.reset();
			const result = kv.enabled.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('select field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'] }),
			});

			kv.theme.set('dark');
			const result = kv.theme.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('dark');
			}
		});

		test('select field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			const result = kv.theme.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('select field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			kv.theme.set('dark');
			let result = kv.theme.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('dark');
			}

			kv.theme.set('light');
			result = kv.theme.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('select field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			kv.theme.set('dark');
			kv.theme.reset();
			const result = kv.theme.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('date field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField(),
			});

			const now = Temporal.ZonedDateTime.from('2024-01-01T05:00:00.000Z[UTC]');
			const nowString = toDateTimeString(now);
			kv.last_sync.set(nowString);
			const result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(nowString);
			}
		});

		test('date field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const defaultDate = Temporal.ZonedDateTime.from(
				'2024-01-01T00:00:00.000+00:00[UTC]',
			);
			const kv = createKv(ydoc, {
				last_sync: dateField({ default: defaultDate }),
			});

			const result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(toDateTimeString(defaultDate));
			}
		});

		test('date field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField({ nullable: true }),
			});

			const result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('date field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: dateField(),
			});

			const date1 = Temporal.ZonedDateTime.from(
				'2024-01-01T05:00:00.000Z[UTC]',
			);
			const date2 = Temporal.ZonedDateTime.from(
				'2024-01-02T05:00:00.000Z[UTC]',
			);
			const date1String = toDateTimeString(date1);
			const date2String = toDateTimeString(date2);

			kv.last_sync.set(date1String);
			let result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(date1String);
			}

			kv.last_sync.set(date2String);
			result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(date2String);
			}
		});

		test('date field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const defaultDate = Temporal.ZonedDateTime.from(
				'2024-01-01T00:00:00.000+00:00[UTC]',
			);
			const kv = createKv(ydoc, {
				last_sync: dateField({ default: defaultDate }),
			});

			const newDate = Temporal.ZonedDateTime.from(
				'2024-02-01T00:00:00.000+00:00[UTC]',
			);
			kv.last_sync.set(toDateTimeString(newDate));
			kv.last_sync.reset();
			const result = kv.last_sync.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(toDateTimeString(defaultDate));
			}
		});
	});

	describe('Richtext and Tags Fields', () => {
		test('richtext field: get() returns string (ID reference)', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext(),
			});

			kv.notes.set('rtxt_abc123');
			const result = kv.notes.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_abc123');
			}
		});

		test('richtext field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext(),
			});

			kv.notes.set('rtxt_first');
			let result = kv.notes.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_first');
			}

			kv.notes.set('rtxt_second');
			result = kv.notes.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_second');
			}
		});

		test('richtext field: nullable returns null when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: richtext({ nullable: true }),
			});

			const result = kv.notes.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('tags field: get() returns plain array', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			kv.tags.set(['typescript', 'javascript']);
			const result = kv.tags.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['typescript', 'javascript']);
			}
		});

		test('tags field: set() replaces existing content', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			kv.tags.set(['typescript']);
			kv.tags.set(['python', 'javascript']);
			const result = kv.tags.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['python', 'javascript']);
			}
		});

		test('tags field without options: allows any strings', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				categories: tags(),
			});

			kv.categories.set(['anything', 'goes', 'here']);
			const result = kv.categories.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['anything', 'goes', 'here']);
			}
		});
	});

	describe('Observe', () => {
		test('observe() fires callback with Result when value changes', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			const values: string[] = [];
			kv.theme.observe((result) => {
				if (result.data) {
					values.push(result.data);
				}
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
			kv.theme.observe((result) => {
				if (result.data) {
					themeValues.push(result.data);
				}
			});

			const countValues: number[] = [];
			kv.count.observe((result) => {
				if (result.data) {
					countValues.push(result.data);
				}
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
			const unsubscribe = kv.count.observe((result) => {
				if (result.data) {
					values.push(result.data);
				}
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
			const result = kv.count.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(4);
			}
		});

		test('setting same value twice', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: select({ options: ['light', 'dark'], default: 'light' }),
			});

			const values: string[] = [];
			kv.theme.observe((result) => {
				if (result.data) {
					values.push(result.data);
				}
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

			const themeResult = kv.theme.get();
			const fontResult = kv.font_size.get();
			const lineResult = kv.show_line_numbers.get();

			expect(themeResult.status).toBe('valid');
			expect(fontResult.status).toBe('valid');
			expect(lineResult.status).toBe('valid');

			if (themeResult.status === 'valid') {
				expect(themeResult.value).toBe('dark');
			}
			if (fontResult.status === 'valid') {
				expect(fontResult.value).toBe(16);
			}
			if (lineResult.status === 'valid') {
				expect(lineResult.value).toBe(false);
			}

			kv.theme.reset();
			const resetTheme = kv.theme.get();
			expect(resetTheme.status).toBe('valid');
			if (resetTheme.status === 'valid') {
				expect(resetTheme.value).toBe('light');
			}

			const stillFont = kv.font_size.get();
			const stillLine = kv.show_line_numbers.get();
			if (stillFont.status === 'valid') {
				expect(stillFont.value).toBe(16);
			}
			if (stillLine.status === 'valid') {
				expect(stillLine.value).toBe(false);
			}
		});

		test('nullable field: set to null explicitly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			kv.bio.set('Hello');
			let result = kv.bio.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('Hello');
			}

			kv.bio.set(null);
			result = kv.bio.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('nullable field with default: set to null clears default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: text({ nullable: true, default: 'user' }),
			});

			let result = kv.role.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}

			kv.role.set(null);
			result = kv.role.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('reset on nullable field with no default sets to null', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: text({ nullable: true }),
			});

			kv.bio.set('Hello');
			let result = kv.bio.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('Hello');
			}

			kv.bio.reset();
			result = kv.bio.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('reset on non-nullable field with no default returns invalid status', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: text(),
			});

			kv.username.set('alice');
			let result = kv.username.get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}

			kv.username.reset();
			result = kv.username.get();
			expect(result.status).toBe('invalid');
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

			const themeResult = kv.theme.get();
			const countResult = kv.count.get();
			expect(themeResult.status).toBe('valid');
			expect(countResult.status).toBe('valid');
			if (themeResult.status === 'valid') {
				expect(themeResult.value).toBe('light');
			}
			if (countResult.status === 'valid') {
				expect(countResult.value).toBe(0);
			}
		});
	});

	describe('Validation', () => {
		test('get() returns invalid status when value type mismatches schema', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const ykvMap = ydoc.getMap('kv');

			ykvMap.set('count', 'not a number' as unknown);

			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			const result = kv.count.get();
			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.key).toBe('count');
				expect(result.error.context.key).toBe('count');
			}
		});

		test('observe() passes error to callback when validation fails', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const ykvMap = ydoc.getMap('kv');

			const kv = createKv(ydoc, {
				count: integer({ default: 0 }),
			});

			let receivedError = false;
			kv.count.observe((result) => {
				if (result.error) {
					receivedError = true;
					expect(result.error.context.key).toBe('count');
				}
			});

			ykvMap.set('count', 'invalid value' as unknown);

			expect(receivedError).toBe(true);
		});
	});
});
