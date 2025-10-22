import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import { defineEpicenter } from '../core/epicenter';
import {
	type Row,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	integer,
	markdownIndex,
	sqliteIndex,
	text,
} from '../index';
import { generateCLI } from './generate';

describe('CLI End-to-End Tests', () => {
	const TEST_DIR = './test-data/cli-e2e-test';
	const TEST_DB = `${TEST_DIR}/test.db`;
	const TEST_MARKDOWN = `${TEST_DIR}/content`;

	// Define a test workspace
	const testWorkspace = defineWorkspace({
		id: 'cli-test-workspace',
		version: 1,
		name: 'posts',

		schema: {
			posts: {
				id: id(),
				title: text(),
				content: text({ nullable: true }),
				category: text(),
				views: integer({ default: 0 }),
			},
		},

		indexes: async ({ db }) => ({
			sqlite: await sqliteIndex(db, { database: `${TEST_DB}` }),
			markdown: markdownIndex(db, { storagePath: TEST_MARKDOWN }),
		}),

		actions: ({ db, indexes }) => ({
			listPosts: defineQuery({
				handler: async () => {
					const posts = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.posts);
					return Ok(posts);
				},
			}),

			getPost: defineQuery({
				input: Type.Object({ id: Type.String() }),
				handler: async ({ id }) => {
					const post = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.posts)
						.where(eq(indexes.sqlite.posts.id, id));
					return Ok(post);
				},
			}),

			createPost: defineMutation({
				input: Type.Object({
					title: Type.String({ description: 'Post title' }),
					content: Type.Optional(Type.String({ description: 'Post content' })),
					category: Type.String({ description: 'Post category' }),
				}),
				handler: async ({ title, content, category }) => {
					const post = {
						id: generateId(),
						title,
						content: content ?? null,
						category,
						views: 0,
					} satisfies Row<typeof db.schema.posts>;
					db.tables.posts.insert(post);
					return Ok(post);
				},
			}),

			updateViews: defineMutation({
				input: Type.Object({
					id: Type.String({ description: 'Post ID' }),
					views: Type.Number({ description: 'New view count' }),
				}),
				handler: async ({ id, views }) => {
					const { status, row } = db.tables.posts.get(id);
					if (status !== 'valid') {
						throw new Error(`Post ${id} not found`);
					}
					db.tables.posts.update({ id, views });
					const { row: updatedPost } = db.tables.posts.get(id);
					return Ok(updatedPost);
				},
			}),
		}),
	});

	const epicenter = defineEpicenter({
		id: 'cli-e2e-test',
		workspaces: [testWorkspace],
	});

	beforeEach(async () => {
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
		await mkdir(TEST_DIR, { recursive: true });
		await mkdir(TEST_MARKDOWN, { recursive: true });
	});

	afterEach(async () => {
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('CLI can create a post', async () => {
		const cli = generateCLI(epicenter, {
			argv: [
				'posts',
				'createPost',
				'--title',
				'Test Post',
				'--content',
				'Test content',
				'--category',
				'tech',
			],
		});

		// Parse will execute the command
		await cli.parse();

		// Verify the post was created by checking the markdown file
		await new Promise((resolve) => setTimeout(resolve, 200));
		const files = await Bun.$`ls ${TEST_MARKDOWN}/posts`.text();
		expect(files.trim().length).toBeGreaterThan(0);
	});

	test('CLI can query posts', async () => {
		// First create a post
		const createCli = generateCLI(epicenter, {
			argv: [
				'posts',
				'createPost',
				'--title',
				'Query Test',
				'--category',
				'tech',
			],
		});
		await createCli.parse();

		// Wait for the post to be created
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Now query all posts
		const listCli = generateCLI(epicenter, {
			argv: ['posts', 'listPosts'],
		});
		await listCli.parse();
	});

	test('CLI handles missing required options', async () => {
		const cli = generateCLI(epicenter, {
			argv: ['posts', 'createPost', '--title', 'Missing Category'],
		});

		try {
			await cli.parse();
			expect(false).toBe(true); // Should not reach here
		} catch (error) {
			// Expected to fail due to missing required field
			expect(error).toBeDefined();
		}
	});

	test('CLI properly formats success output', async () => {
		const cli = generateCLI(epicenter, {
			argv: [
				'posts',
				'createPost',
				'--title',
				'Output Test',
				'--category',
				'test',
			],
		});

		// Capture console output
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: any[]) => {
			logs.push(args.join(' '));
			originalLog(...args);
		};

		await cli.parse();

		console.log = originalLog;

		// Verify output format
		expect(logs.some((log) => log.includes('Executing'))).toBe(true);
		expect(logs.some((log) => log.includes('Success'))).toBe(true);
	});
});
