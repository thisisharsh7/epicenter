import { describe, expect, test } from 'bun:test';
import Type from 'typebox';
import { defineEpicenter } from '../core/epicenter';
import {
	defineWorkspace,
	id,
	text,
	sqliteIndex,
	defineMutation,
} from '../index';
import { Ok } from 'wellcrafted/result';
import { createCLI } from './cli';

describe('CLI Integration', () => {
	const testWorkspace = defineWorkspace({
		id: 'test-cli-workspace',
		version: 1,
		name: 'test',

		schema: {
			items: {
				id: id(),
				name: text(),
				count: text(),
			},
		},

		indexes: {
			sqlite: (db) => sqliteIndex(db, { database: ':memory:' }),
		},

		actions: ({ db }) => ({
			createItem: defineMutation({
				input: Type.Object({
					name: Type.String({ description: 'Item name' }),
					count: Type.Number({ description: 'Item count', default: 1 }),
				}),
				handler: async ({ name, count }) => {
					const item = {
						id: `item-${Date.now()}`,
						name,
						count: String(count),
					};
					db.tables.items.insert(item);
					return Ok(item);
				},
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'test-cli-epicenter',
		workspaces: [testWorkspace],
	});

	test('CLI can be created from epicenter config', () => {
		const cli = createCLI({ config: epicenter, argv: [] });
		expect(cli).toBeDefined();
	});

	test('creates CLI with proper command structure', () => {
		const cli = createCLI({ config: epicenter, argv: [] });

		// Verify CLI has basic yargs structure
		expect(cli.parse).toBeDefined();
	});
});
