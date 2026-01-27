import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { defineKV } from './define-kv.js';

describe('defineKV', () => {
	describe('shorthand syntax', () => {
		test('creates valid KV definition with direct schema', () => {
			const theme = defineKV(type({ mode: "'light' | 'dark'" }));

			expect(theme.versions).toHaveLength(1);
		});

		test('migrate is identity function for shorthand', () => {
			const sidebar = defineKV(type({ collapsed: 'boolean', width: 'number' }));

			const value = { collapsed: true, width: 300 };
			expect(sidebar.migrate(value)).toBe(value);
		});

		test('shorthand produces equivalent output to builder pattern', () => {
			const schema = type({ collapsed: 'boolean', width: 'number' });

			const shorthand = defineKV(schema);
			const builder = defineKV().version(schema).migrate((v) => v);

			expect(shorthand.versions).toEqual(builder.versions);
			expect(shorthand.unionSchema).toBe(builder.unionSchema);
		});
	});

	describe('builder syntax', () => {
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
});
