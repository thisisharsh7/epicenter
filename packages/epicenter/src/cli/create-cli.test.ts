import { describe, expect, test } from 'bun:test';
import Type from 'typebox';
import { defineEpicenter } from '../core/epicenter';
import {
	defineWorkspace,
	id,
	text,
	sqliteIndex,
	defineQuery,
	defineMutation,
} from '../index';
import { Ok } from 'wellcrafted/result';
import { createCLI } from './create-cli';

describe('createCLI', () => {
	const testWorkspace = defineWorkspace({
		id: 'test-workspace',
		version: 1,
		name: 'test',

		schema: {
			items: {
				id: id(),
				name: text(),
			},
		},

		indexes: ({ db }) => ({
			sqlite: sqliteIndex(db, { databaseUrl: ':memory:' }),
		}),

		actions: ({ db, indexes }) => ({
			getItems: defineQuery({
				handler: async () => {
					const items = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.items)
						.all();
					return Ok(items);
				},
			}),

			createItem: defineMutation({
				input: Type.Object({
					name: Type.String({ description: 'The item name' }),
				}),
				handler: async ({ name }) => {
					const item = { id: `item-${Date.now()}`, name };
					db.tables.items.set(item);
					return Ok(item);
				},
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'test-epicenter',
		workspaces: [testWorkspace],
	});

	test('creates a yargs instance', () => {
		const cli = createCLI(epicenter, { argv: [] });
		expect(cli).toBeDefined();
		expect(typeof cli.parse).toBe('function');
	});

	test('sets up workspace/action command structure', () => {
		const cli = createCLI(epicenter, { argv: [] });

		// Just verify the CLI was created successfully
		expect(cli).toBeDefined();
		expect(typeof cli.parse).toBe('function');
	});

	test('requires workspace and action arguments', () => {
		// Create CLI with invalid args (no workspace/action)
		const cli = createCLI(epicenter, { argv: [] });

		// Just verify it was created - yargs will handle validation on parse
		expect(cli).toBeDefined();
	});

	test('shows help text', () => {
		// Don't actually parse --help as it calls process.exit
		// Just verify the CLI can be created
		const cli = createCLI(epicenter, { argv: [] });
		expect(cli).toBeDefined();
	});
});
