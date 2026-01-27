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
