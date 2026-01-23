import { describe, expect, test } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import * as Y from 'yjs';
import {
	boolean,
	DateTimeString,
	date as dateField,
	integer,
	real,
	richtext,
	select,
	setting,
	tags,
	text,
} from '../schema';
import { createKv } from './core';

describe('KV Helpers', () => {
	describe('Basic Operations', () => {
		test('text field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: setting({ name: '', field: text() }),
			});

			kv('username').set('alice');
			const result = kv('username').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}
		});

		test('text field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: setting({ name: '', field: text({ default: 'user' }) }),
			});

			const result = kv('role').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}
		});

		test('text field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: setting({ name: '', field: text({ nullable: true }) }),
			});

			const result = kv('bio').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('text field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: setting({ name: '', field: text() }),
			});

			kv('username').set('alice');
			let result = kv('username').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}

			kv('username').set('bob');
			result = kv('username').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('bob');
			}
		});

		test('text field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: setting({ name: '', field: text({ default: 'user' }) }),
			});

			kv('role').set('admin');
			let result = kv('role').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('admin');
			}

			kv('role').reset();
			result = kv('role').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}
		});

		test('integer field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer() }),
			});

			kv('count').set(42);
			const result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(42);
			}
		});

		test('integer field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			const result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0);
			}
		});

		test('integer field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			kv('count').set(10);
			let result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(10);
			}

			kv('count').set(20);
			result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(20);
			}
		});

		test('integer field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			kv('count').set(100);
			kv('count').reset();
			const result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0);
			}
		});

		test('real field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: setting({ name: '', field: real() }),
			});

			kv('price').set(19.99);
			const result = kv('price').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(19.99);
			}
		});

		test('real field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				price: setting({ name: '', field: real({ default: 0.0 }) }),
			});

			const result = kv('price').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(0.0);
			}
		});

		test('boolean field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: setting({ name: '', field: boolean() }),
			});

			kv('enabled').set(true);
			let result = kv('enabled').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(true);
			}

			kv('enabled').set(false);
			result = kv('enabled').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('boolean field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: setting({ name: '', field: boolean({ default: false }) }),
			});

			const result = kv('enabled').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('boolean field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				enabled: setting({ name: '', field: boolean({ default: false }) }),
			});

			kv('enabled').set(true);
			kv('enabled').reset();
			const result = kv('enabled').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(false);
			}
		});

		test('select field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'] }),
				}),
			});

			kv('theme').set('dark');
			const result = kv('theme').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('dark');
			}
		});

		test('select field: get() returns default value when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			});

			const result = kv('theme').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('select field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			});

			kv('theme').set('dark');
			let result = kv('theme').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('dark');
			}

			kv('theme').set('light');
			result = kv('theme').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('select field: reset() restores default value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			});

			kv('theme').set('dark');
			kv('theme').reset();
			const result = kv('theme').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('light');
			}
		});

		test('date field: get() returns valid result with correct value', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: setting({ name: '', field: dateField() }),
			});

			const now = Temporal.ZonedDateTime.from('2024-01-01T05:00:00.000Z[UTC]');
			const nowString = DateTimeString.stringify(now);
			kv('last_sync').set(nowString);
			const result = kv('last_sync').get();
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
				last_sync: setting({
					name: '',
					field: dateField({ default: defaultDate }),
				}),
			});

			const result = kv('last_sync').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(DateTimeString.stringify(defaultDate));
			}
		});

		test('date field: get() returns null for nullable fields with no default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: setting({ name: '', field: dateField({ nullable: true }) }),
			});

			const result = kv('last_sync').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('date field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				last_sync: setting({ name: '', field: dateField() }),
			});

			const date1 = Temporal.ZonedDateTime.from(
				'2024-01-01T05:00:00.000Z[UTC]',
			);
			const date2 = Temporal.ZonedDateTime.from(
				'2024-01-02T05:00:00.000Z[UTC]',
			);
			const date1String = DateTimeString.stringify(date1);
			const date2String = DateTimeString.stringify(date2);

			kv('last_sync').set(date1String);
			let result = kv('last_sync').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(date1String);
			}

			kv('last_sync').set(date2String);
			result = kv('last_sync').get();
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
				last_sync: setting({
					name: '',
					field: dateField({ default: defaultDate }),
				}),
			});

			const newDate = Temporal.ZonedDateTime.from(
				'2024-02-01T00:00:00.000+00:00[UTC]',
			);
			kv('last_sync').set(DateTimeString.stringify(newDate));
			kv('last_sync').reset();
			const result = kv('last_sync').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(DateTimeString.stringify(defaultDate));
			}
		});
	});

	describe('Richtext and Tags Fields', () => {
		test('richtext field: get() returns string (ID reference)', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: setting({ name: '', field: richtext() }),
			});

			kv('notes').set('rtxt_abc123');
			const result = kv('notes').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_abc123');
			}
		});

		test('richtext field: set() updates value correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: setting({ name: '', field: richtext() }),
			});

			kv('notes').set('rtxt_first');
			let result = kv('notes').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_first');
			}

			kv('notes').set('rtxt_second');
			result = kv('notes').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('rtxt_second');
			}
		});

		test('richtext field: nullable returns null when not set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: setting({ name: '', field: richtext() }),
			});

			const result = kv('notes').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('tags field: get() returns plain array', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: setting({
					name: '',
					field: tags({ options: ['typescript', 'javascript', 'python'] }),
				}),
			});

			kv('tags').set(['typescript', 'javascript']);
			const result = kv('tags').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['typescript', 'javascript']);
			}
		});

		test('tags field: set() replaces existing content', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: setting({
					name: '',
					field: tags({ options: ['typescript', 'javascript', 'python'] }),
				}),
			});

			kv('tags').set(['typescript']);
			kv('tags').set(['python', 'javascript']);
			const result = kv('tags').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['python', 'javascript']);
			}
		});

		test('tags field without options: allows any strings', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				categories: setting({ name: '', field: tags() }),
			});

			kv('categories').set(['anything', 'goes', 'here']);
			const result = kv('categories').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toEqual(['anything', 'goes', 'here']);
			}
		});
	});

	describe('Observe', () => {
		test('observeChanges() fires callback with change event when value changes', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			});

			const values: string[] = [];
			kv('theme').observe((change) => {
				if (change.action !== 'delete') {
					values.push(change.newValue);
				}
			});

			kv('theme').set('dark');
			kv('theme').set('light');

			expect(values).toEqual(['dark', 'light']);
		});

		test('observeChanges() only fires for the specific key, not other keys', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			const themeValues: string[] = [];
			kv('theme').observe((change) => {
				if (change.action !== 'delete') {
					themeValues.push(change.newValue);
				}
			});

			const countValues: number[] = [];
			kv('count').observe((change) => {
				if (change.action !== 'delete') {
					countValues.push(change.newValue);
				}
			});

			kv('theme').set('dark');
			kv('count').set(42);
			kv('theme').set('light');

			expect(themeValues).toEqual(['dark', 'light']);
			expect(countValues).toEqual([42]);
		});

		test('observeChanges() unsubscribe function stops callbacks', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			const values: number[] = [];
			const unsubscribe = kv('count').observe((change) => {
				if (change.action !== 'delete') {
					values.push(change.newValue);
				}
			});

			kv('count').set(1);
			kv('count').set(2);
			unsubscribe();
			kv('count').set(3);

			expect(values).toEqual([1, 2]);
		});

		test('observeChanges() fires when richtext is set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				notes: setting({ name: '', field: richtext() }),
			});

			let callCount = 0;
			kv('notes').observe(() => {
				callCount++;
			});

			kv('notes').set('rtxt_abc123');
			expect(callCount).toBe(1);
		});

		test('observeChanges() fires when tags array is set', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				tags: setting({ name: '', field: tags({ options: ['a', 'b', 'c'] }) }),
			});

			let callCount = 0;
			kv('tags').observe(() => {
				callCount++;
			});

			kv('tags').set(['a']);
			expect(callCount).toBe(1);
		});
	});

	describe('Edge Cases', () => {
		test('multiple sets in sequence', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			kv('count').set(1);
			kv('count').set(2);
			kv('count').set(3);
			kv('count').set(4);
			const result = kv('count').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(4);
			}
		});

		test('setting same value twice', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
			});

			const values: string[] = [];
			kv('theme').observe((change) => {
				if (change.action !== 'delete') {
					values.push(change.newValue);
				}
			});

			kv('theme').set('dark');
			kv('theme').set('dark');
			kv('theme').set('dark');

			expect(values).toEqual(['dark', 'dark', 'dark']);
		});

		test('interaction between multiple KV fields', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
				font_size: setting({ name: '', field: integer({ default: 14 }) }),
				show_line_numbers: setting({
					name: '',
					field: boolean({ default: true }),
				}),
			});

			kv('theme').set('dark');
			kv('font_size').set(16);
			kv('show_line_numbers').set(false);

			const themeResult = kv('theme').get();
			const fontResult = kv('font_size').get();
			const lineResult = kv('show_line_numbers').get();

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

			kv('theme').reset();
			const resetTheme = kv('theme').get();
			expect(resetTheme.status).toBe('valid');
			if (resetTheme.status === 'valid') {
				expect(resetTheme.value).toBe('light');
			}

			const stillFont = kv('font_size').get();
			const stillLine = kv('show_line_numbers').get();
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
				bio: setting({ name: '', field: text({ nullable: true }) }),
			});

			kv('bio').set('Hello');
			let result = kv('bio').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('Hello');
			}

			kv('bio').set(null);
			result = kv('bio').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('nullable field with default: set to null clears default', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				role: setting({
					name: '',
					field: text({ nullable: true, default: 'user' }),
				}),
			});

			let result = kv('role').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('user');
			}

			kv('role').set(null);
			result = kv('role').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('reset on nullable field with no default sets to null', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				bio: setting({ name: '', field: text({ nullable: true }) }),
			});

			kv('bio').set('Hello');
			let result = kv('bio').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('Hello');
			}

			kv('bio').reset();
			result = kv('bio').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe(null);
			}
		});

		test('reset on non-nullable field with no default returns not_found status', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				username: setting({ name: '', field: text() }),
			});

			kv('username').set('alice');
			let result = kv('username').get();
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.value).toBe('alice');
			}

			kv('username').reset();
			result = kv('username').get();
			expect(result.status).toBe('not_found');
			if (result.status === 'not_found') {
				expect(result.key).toBe('username');
			}
		});

		test('toJSON() serializes all values', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
				count: setting({ name: '', field: integer({ default: 0 }) }),
				enabled: setting({ name: '', field: boolean({ default: true }) }),
			});

			kv('theme').set('dark');
			kv('count').set(42);
			kv('enabled').set(true); // Must set explicitly - toJSON only returns stored values, not defaults

			const json = kv.toJSON();
			expect(json).toEqual({
				theme: 'dark',
				count: 42,
				enabled: true,
			});
		});

		test('clearAll() removes all values', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const kv = createKv(ydoc, {
				theme: setting({
					name: '',
					field: select({ options: ['light', 'dark'], default: 'light' }),
				}),
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			kv('theme').set('dark');
			kv('count').set(42);

			kv.clear();

			const themeResult = kv('theme').get();
			const countResult = kv('count').get();
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
			const ykvMap = ydoc.getMap<unknown>('kv');

			// Directly set invalid data (simulating sync from corrupted peer)
			ykvMap.set('count', 'not a number');

			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			const result = kv('count').get();
			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.key).toBe('count');
				expect(result.error.context.key).toBe('count');
			}
		});

		test('observeChanges() receives raw values even for invalid data', () => {
			const ydoc = new Y.Doc({ guid: 'test-kv' });
			const ykvMap = ydoc.getMap<unknown>('kv');

			const kv = createKv(ydoc, {
				count: setting({ name: '', field: integer({ default: 0 }) }),
			});

			let receivedValue: unknown = null;
			kv('count').observe((change) => {
				if (change.action !== 'delete') {
					receivedValue = change.newValue;
				}
			});

			// Directly set invalid data to YJS (simulating sync from corrupted peer)
			ykvMap.set('count', 'invalid value');

			// observeChanges receives raw values without validation
			expect(receivedValue).toBe('invalid value');
		});
	});
});
