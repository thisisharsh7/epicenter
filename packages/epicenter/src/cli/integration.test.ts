import { describe, expect, test } from 'bun:test';
import Type from 'typebox';
import {
	defineEpicenter,
	id,
	text,
	sqliteIndex,
	defineMutation,
} from '../index';
import { Ok } from 'wellcrafted/result';
import { generateCLI } from './generate';

describe('CLI Integration', () => {
	const testWorkspace = defineEpicenter({
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

		indexes: async ({ db }) => ({
			sqlite: await sqliteIndex(db, { database: ':memory:' }),
		}),

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

	test('CLI can be generated from epicenter config', () => {
		const cli = generateCLI(epicenter, { argv: [] });
		expect(cli).toBeDefined();
	});

	test('generates CLI with proper command structure', () => {
		const cli = generateCLI(epicenter, {
			argv: [],
		});

		// Verify CLI has basic yargs structure
		expect(cli.parse).toBeDefined();
	});
});
