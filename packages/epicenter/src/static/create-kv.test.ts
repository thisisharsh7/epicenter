import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import * as Y from 'yjs';
import { createKV } from './create-kv.js';
import { defineKV } from './define-kv.js';

describe('createKV', () => {
	test('set and get a value', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		kv.set('theme', { mode: 'dark' });

		const result = kv.get('theme');
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

		const result = kv.get('theme');
		expect(result.status).toBe('not_found');
	});

	test('delete removes the value', () => {
		const theme = defineKV()
			.version(type({ mode: "'light' | 'dark'" }))
			.migrate((v) => v);

		const ydoc = new Y.Doc();
		const kv = createKV(ydoc, { theme });

		kv.set('theme', { mode: 'dark' });
		expect(kv.get('theme').status).toBe('valid');

		kv.delete('theme');
		expect(kv.get('theme').status).toBe('not_found');
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
		const result = kv.get('theme');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.value.fontSize).toBe(14);
		}
	});
});
