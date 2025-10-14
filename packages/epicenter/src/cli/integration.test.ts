import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineEpicenter, createEpicenterClient } from '../core/epicenter';
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
import { createZodConverter } from './converters/zod';

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

		indexes: ({ db }) => ({
			sqlite: sqliteIndex({ db, databaseUrl: ':memory:' }),
		}),

		actions: ({ db }) => ({
			createItem: defineMutation({
				input: z.object({
					name: z.string().describe('Item name'),
					count: z.number().default(1).describe('Item count'),
				}),
				handler: async ({ name, count }) => {
					const item = {
						id: `item-${Date.now()}`,
						name,
						count: String(count),
					};
					db.tables.items.set(item);
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
		const cli = createCLI(epicenter, { argv: [] });
		expect(cli).toBeDefined();
	});

	test('Zod converter extracts schema fields for CLI flags', () => {
		const converter = createZodConverter();
		const schema = z.object({
			name: z.string().describe('Item name'),
			count: z.number().default(1),
		});

		// Verify converter detects Zod schemas
		expect(converter.condition(schema as any)).toBe(true);
	});

	test('creates CLI with proper command structure', () => {
		const cli = createCLI(epicenter, {
			argv: [],
			schemaConverters: [createZodConverter()],
		});

		// Verify CLI has basic yargs structure
		expect(cli.parse).toBeDefined();
		expect(cli.getOptions).toBeDefined();
	});
});
