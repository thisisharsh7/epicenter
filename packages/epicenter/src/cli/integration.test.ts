import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { defineEpicenter } from '../core/epicenter';
import { defineMutation, defineWorkspace, id, text } from '../index.node';
import { sqliteProvider } from '../providers/sqlite';
import { createCLI } from './cli';

describe('CLI Integration', () => {
	const testWorkspace = defineWorkspace({
		id: 'test',

		tables: {
			items: {
				id: id(),
				name: text(),
				count: text(),
			},
		},

		providers: {
			sqlite: (c) => sqliteProvider(c),
		},

		exports: ({ tables }) => ({
			createItem: defineMutation({
				input: type({
					name: 'string',
					count: 'number',
				}),
				description: 'Create a new item',
				handler: async ({ name, count }) => {
					const item = {
						id: `item-${Date.now()}`,
						name,
						count: String(count),
					};
					tables.items.upsert(item);
					return Ok(item);
				},
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'test-cli-epicenter',
		workspaces: [testWorkspace],
	});

	test('CLI can be created from epicenter config', async () => {
		const cli = await createCLI({ config: epicenter, argv: [] });
		expect(cli).toBeDefined();
	});

	test('creates CLI with proper command structure', async () => {
		const cli = await createCLI({ config: epicenter, argv: [] });

		// Verify CLI has basic yargs structure
		expect(cli.parse).toBeDefined();
	});
});
