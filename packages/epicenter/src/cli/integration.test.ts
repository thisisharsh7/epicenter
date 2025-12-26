import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { createClient } from '../core/workspace/client.node';
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

	const workspaces = [testWorkspace] as const;

	test('CLI can be created from workspaces array', async () => {
		const client = await createClient(workspaces);
		await createCLI(client).run(['--help']);
	});

	test('CLI runs workspace command', async () => {
		const client = await createClient(workspaces);
		await createCLI(client).run(['test', '--help']);
	});
});
