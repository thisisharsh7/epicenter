import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { defineTable } from './define-table.js';

describe('defineTable', () => {
	describe('shorthand syntax', () => {
		test('creates valid table definition with direct schema', () => {
			const posts = defineTable(type({ id: 'string', title: 'string' }));

			expect(posts.versions).toHaveLength(1);
		});

		test('migrate is identity function for shorthand', () => {
			const users = defineTable(type({ id: 'string', email: 'string' }));

			const row = { id: '1', email: 'test@example.com' };
			expect(users.migrate(row)).toBe(row);
		});

		test('shorthand produces equivalent output to builder pattern', () => {
			const schema = type({ id: 'string', title: 'string' });

			const shorthand = defineTable(schema);
			const builder = defineTable().version(schema).migrate((row) => row);

			expect(shorthand.versions).toEqual(builder.versions);
			expect(shorthand.unionSchema).toBe(builder.unionSchema);
		});
	});

	describe('builder syntax', () => {
		test('creates valid table definition with single version', () => {
			const posts = defineTable()
				.version(type({ id: 'string', title: 'string' }))
				.migrate((row) => row);

			expect(posts.versions).toHaveLength(1);
		});

		test('creates table definition with multiple versions', () => {
			const posts = defineTable()
				.version(type({ id: 'string', title: 'string' }))
				.version(type({ id: 'string', title: 'string', views: 'number' }))
				.migrate((row) => {
					if (!('views' in row)) return { ...row, views: 0 };
					return row;
				});

			expect(posts.versions).toHaveLength(2);
		});

		test('migrate function transforms old version to latest', () => {
			const posts = defineTable()
				.version(type({ id: 'string', title: 'string' }))
				.version(type({ id: 'string', title: 'string', views: 'number' }))
				.migrate((row) => {
					if (!('views' in row)) return { ...row, views: 0 };
					return row;
				});

			// Migrate v1 to v2
			const migrated = posts.migrate({ id: '1', title: 'Test' });
			expect(migrated).toEqual({ id: '1', title: 'Test', views: 0 });
		});

		test('throws when no versions are defined', () => {
			expect(() => {
				defineTable().migrate((row) => row);
			}).toThrow('defineTable() requires at least one .version() call');
		});
	});
});
