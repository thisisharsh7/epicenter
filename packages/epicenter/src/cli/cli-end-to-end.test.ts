import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { createClient } from '../core/workspace/client.node';
import {
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	integer,
	text,
} from '../index.node';
import { markdownProvider } from '../providers/markdown';
import { sqliteProvider } from '../providers/sqlite';
import { createCLI } from './cli';

/**
 * CLI End-to-End Tests
 * These tests verify that the full CLI flow works: parsing, routing, execution, and output.
 * Business logic is tested separately in workspace.test.ts
 */
describe('CLI End-to-End Tests', () => {
	const TEST_DIR = path.join(import.meta.dir, '.data');
	const TEST_MARKDOWN = path.join(TEST_DIR, 'content');

	// Define a test workspace
	const testWorkspace = defineWorkspace({
		id: 'posts',

		tables: {
			posts: {
				id: id(),
				title: text(),
				content: text({ nullable: true }),
				category: text(),
				views: integer({ default: 0 }),
			},
		},

		providers: {
			sqlite: (c) => sqliteProvider(c),
			markdown: (c) => markdownProvider(c, { directory: './content' }),
		},

		exports: ({ tables, providers }) => ({
			listPosts: defineQuery({
				handler: async () => {
					const posts = await providers.sqlite.db
						.select()
						.from(providers.sqlite.posts);
					return Ok(posts);
				},
			}),

			getPost: defineQuery({
				input: type({ id: 'string' }),
				handler: async ({ id }) => {
					const post = await providers.sqlite.db
						.select()
						.from(providers.sqlite.posts)
						.where(eq(providers.sqlite.posts.id, id));
					return Ok(post);
				},
			}),

			createPost: defineMutation({
				input: type({
					title: 'string',
					'content?': 'string',
					category: 'string',
				}),
				handler: async ({ title, content, category }) => {
					const post = {
						id: generateId(),
						title,
						content: content ?? null,
						category,
						views: 0,
					} satisfies typeof tables.posts.$inferSerializedRow;
					tables.posts.upsert(post);
					return Ok(post);
				},
			}),

			updateViews: defineMutation({
				input: type({
					id: 'string',
					views: 'number',
				}),
				handler: async ({ id, views }) => {
					const result = tables.posts.get({ id });
					if (result.status !== 'valid') {
						return Ok(null);
					}
					tables.posts.update({ id, views });
					const updatedResult = tables.posts.get({ id });
					if (updatedResult.status !== 'valid') {
						return Ok(null);
					}
					return Ok(updatedResult.row.toJSON());
				},
			}),
		}),
	});

	const workspaces = [testWorkspace] as const;
	const options = { projectDir: TEST_DIR };

	beforeEach(async () => {
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
		await mkdir(TEST_DIR, { recursive: true });
		await mkdir(TEST_MARKDOWN, { recursive: true });
		await mkdir(path.join(TEST_MARKDOWN, 'posts'), { recursive: true });
	});

	afterEach(async () => {
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('CLI can create a post', async () => {
		const client = await createClient(workspaces, options);
		await createCLI(client).run([
			'posts',
			'createPost',
			'--title',
			'Test Post',
			'--content',
			'Test content',
			'--category',
			'tech',
		]);

		await new Promise((resolve) => setTimeout(resolve, 200));
		const files = await Bun.$`ls ${TEST_MARKDOWN}/posts`.text();
		expect(files.trim().length).toBeGreaterThan(0);
	});

	test('CLI can query posts', async () => {
		const client = await createClient(workspaces, options);
		await createCLI(client).run([
			'posts',
			'createPost',
			'--title',
			'Query Test',
			'--category',
			'tech',
		]);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const client2 = await createClient(workspaces, options);
		await createCLI(client2).run(['posts', 'listPosts']);
	});

	test('CLI handles missing required options', async () => {
		try {
			const client = await createClient(workspaces, options);
			await createCLI(client).run([
				'posts',
				'createPost',
				'--title',
				'Missing Category',
			]);
			expect(false).toBe(true);
		} catch (error) {
			expect(error).toBeDefined();
		}
	});

	test('CLI properly formats success output', async () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.join(' '));
			originalLog(...args);
		};

		const client = await createClient(workspaces, options);
		await createCLI(client).run([
			'posts',
			'createPost',
			'--title',
			'Output Test',
			'--category',
			'test',
		]);

		console.log = originalLog;

		expect(logs.some((log) => log.includes('Success'))).toBe(true);
	});
});
