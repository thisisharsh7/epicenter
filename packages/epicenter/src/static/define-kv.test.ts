import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { defineKV } from './define-kv.js';

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
