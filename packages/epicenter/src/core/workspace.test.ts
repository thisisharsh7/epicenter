import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { type } from 'arktype';
import { createWorkspaceClient, defineWorkspace } from './workspace';
import { id, text, integer } from './schema';
import { defineQuery, defineMutation } from './actions';
import { Ok } from 'wellcrafted/result';
import { sqliteIndex } from '../indexes/sqlite';
import { markdownIndex } from '../indexes/markdown';

/**
 * Test suite for workspace initialization with topological sort
 * Tests various dependency scenarios to ensure correct initialization order
 */
describe('createWorkspaceClient - Topological Sort', () => {
	/**
	 * Track initialization order to verify topological sorting
	 */
	const initOrder: string[] = [];

	test('linear dependency chain: A -> B -> C', async () => {
		initOrder.length = 0;

		// Create workspaces: C depends on B, B depends on A
		const workspaceA = defineWorkspace({
			id: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-a');
				},
			],
		});
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-b');
				},
			],
		});

		// Flat dependency resolution: C must declare ALL transitive dependencies
		// C depends on B (direct), and A (transitive through B)
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			version: 1,
			dependencies: [workspaceA, workspaceB], // Hoisted/flat dependencies
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-c');
				},
			],
		});

		// Initialize workspace C
		await createWorkspaceClient(workspaceC);

		// Verify initialization order: A -> B -> C
		expect(initOrder).toEqual(['workspace-a', 'workspace-b', 'workspace-c']);
	});

	test('diamond dependency: C depends on A and B, both depend on D', async () => {
		initOrder.length = 0;

		// Create diamond dependency structure
		// D is the base, A and B depend on D, C depends on both A and B
		const workspaceD = defineWorkspace({
			id: 'workspace-d',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-d');
				},
			],
		});
		const workspaceA = defineWorkspace({
			id: 'workspace-a',
			version: 1,
			dependencies: [workspaceD],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-a');
				},
			],
		});
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceD],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-b');
				},
			],
		});

		// Flat dependency resolution: C must declare ALL transitive dependencies
		// C depends on A, B (direct), and D (transitive through A and B)
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			version: 1,
			dependencies: [workspaceD, workspaceA, workspaceB], // All hoisted
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-c');
				},
			],
		});

		await createWorkspaceClient(workspaceC);

		// D must be initialized first
		expect(initOrder[0]).toBe('workspace-d');

		// A and B can be in any order (both depend only on D)
		expect(initOrder.slice(1, 3)).toContain('workspace-a');
		expect(initOrder.slice(1, 3)).toContain('workspace-b');

		// C must be initialized last
		expect(initOrder[3]).toBe('workspace-c');
	});

	test('multiple independent workspaces', async () => {
		initOrder.length = 0;

		// Create three independent workspaces (no dependencies)
		const workspaceX = defineWorkspace({
			id: 'workspace-x',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-x');
				},
			],
		});
		const workspaceY = defineWorkspace({
			id: 'workspace-y',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-y');
				},
			],
		});
		const workspaceZ = defineWorkspace({
			id: 'workspace-z',
			version: 1,
			dependencies: [workspaceX, workspaceY],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-z');
				},
			],
		});

		await createWorkspaceClient(workspaceZ);

		// X and Y can be in any order (both have no dependencies)
		expect(initOrder.slice(0, 2)).toContain('workspace-x');
		expect(initOrder.slice(0, 2)).toContain('workspace-y');

		// Z must be initialized last
		expect(initOrder[2]).toBe('workspace-z');
	});

	test('version resolution: highest version wins', async () => {
		initOrder.length = 0;

		// Create workspace A with version 1
		const workspaceA_v1 = defineWorkspace({
			id: 'workspace-a',
			version: 1,
			dependencies: [],
			schema: {
				items: {
					id: id(),
					value: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-a-v1');
				},
			],
		});

		// Create workspace A with version 3 (higher)
		const workspaceA_v3 = defineWorkspace({
			id: 'workspace-a',
			version: 3,
			dependencies: [],
			schema: {
				items: {
					id: id(),
					value: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-a-v3');
				},
			],
		});

		// B depends on v1, C depends on v3
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceA_v1],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-b');
				},
			],
		});
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			version: 1,
			dependencies: [workspaceA_v3],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-c');
				},
			],
		});

		// Root depends on both B and C (flat resolution: include ALL transitive deps)
		const root = defineWorkspace({
			id: 'root',
			version: 1,
			dependencies: [workspaceA_v1, workspaceA_v3, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: ({ workspaces }) => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('root');
				},
			],
		});

		await createWorkspaceClient(root);

		// Should only initialize v3 (highest version)
		expect(initOrder).toContain('workspace-a-v3');
		expect(initOrder).not.toContain('workspace-a-v1');

		// Verify v3 is initialized before B and C
		const v3Index = initOrder.indexOf('workspace-a-v3');
		const bIndex = initOrder.indexOf('workspace-b');
		const cIndex = initOrder.indexOf('workspace-c');
		expect(v3Index).toBeLessThan(bIndex);
		expect(v3Index).toBeLessThan(cIndex);
	});

	test('circular dependency detection', async () => {
		// Create circular dependency: A -> B -> A
		const workspaceA: any = {
			id: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
		};

		const workspaceB: any = {
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
		};

		// Create circular reference
		workspaceA.dependencies = [workspaceB];

		// Should throw error about circular dependency
		expect(() => createWorkspaceClient(workspaceA)).toThrow(
			/Circular dependency/,
		);
	});

	test('complex dependency graph with multiple levels', async () => {
		initOrder.length = 0;

		// Create a more complex dependency structure:
		//       F
		//      / \
		//     D   E
		//     |\ /|
		//     | X |
		//     |/ \|
		//     B   C
		//      \ /
		//       A

		const workspaceA = defineWorkspace({
			id: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-a');
				},
			],
		});
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-b');
				},
			],
		});
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-c');
				},
			],
		});
		const workspaceD = defineWorkspace({
			id: 'workspace-d',
			version: 1,
			dependencies: [workspaceA, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-d');
				},
			],
		});
		const workspaceE = defineWorkspace({
			id: 'workspace-e',
			version: 1,
			dependencies: [workspaceA, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-e');
				},
			],
		});

		// F must declare ALL transitive dependencies (flat resolution)
		const workspaceF = defineWorkspace({
			id: 'workspace-f',
			version: 1,
			dependencies: [
				workspaceA,
				workspaceB,
				workspaceC,
				workspaceD,
				workspaceE,
			],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({}),
			providers: [
				({ ydoc }) => {
					initOrder.push('workspace-f');
				},
			],
		});

		await createWorkspaceClient(workspaceF);

		// A must be first (no dependencies)
		expect(initOrder[0]).toBe('workspace-a');

		// B and C can be in any order (both depend only on A)
		const aIndex = initOrder.indexOf('workspace-a');
		const bIndex = initOrder.indexOf('workspace-b');
		const cIndex = initOrder.indexOf('workspace-c');
		expect(bIndex).toBeGreaterThan(aIndex);
		expect(cIndex).toBeGreaterThan(aIndex);

		// D and E must come after both B and C
		const dIndex = initOrder.indexOf('workspace-d');
		const eIndex = initOrder.indexOf('workspace-e');
		expect(dIndex).toBeGreaterThan(bIndex);
		expect(dIndex).toBeGreaterThan(cIndex);
		expect(eIndex).toBeGreaterThan(bIndex);
		expect(eIndex).toBeGreaterThan(cIndex);

		// F must be last (depends on D and E)
		const fIndex = initOrder.indexOf('workspace-f');
		expect(fIndex).toBeGreaterThan(dIndex);
		expect(fIndex).toBeGreaterThan(eIndex);
		expect(fIndex).toBe(initOrder.length - 1);
	});

	test('workspace can access initialized dependencies', async () => {
		// Create workspace A that exposes an action
		const workspaceA = defineWorkspace({
			id: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({
				getValue: defineQuery({
					handler: () => {
						return Ok('value-from-a');
					},
				}),
			}),
		});

		// Create workspace B that depends on A and uses its action
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: ({ workspaces }) => ({
				getValueFromA: defineQuery({
					handler: async () => {
						// Access workspace A's action
						const result = await workspaces['workspace-a'].getValue();
						return result;
					},
				}),
			}),
		});

		using client = await createWorkspaceClient(workspaceB);

		// Verify that B can call A's action
		const result = await client.getValueFromA();
		expect(result.data).toBe('value-from-a');
	});

	test('createWorkspaceClient returns only the specified workspace', async () => {
		const workspaceA = defineWorkspace({
			id: 'a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({
				getValueFromA: defineQuery({
					handler: () => Ok('value-from-a'),
				}),
			}),
		});

		const workspaceB = defineWorkspace({
			id: 'b',
			version: 1,
			dependencies: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: ({ workspaces }) => ({
				getValueFromB: defineQuery({
					handler: () => Ok('value-from-b'),
				}),
				callA: defineQuery({
					handler: async () => workspaces['a'].getValueFromA(),
				}),
			}),
		});

		using client = await createWorkspaceClient(workspaceB);

		// createWorkspaceClient returns workspace B's actions
		expect(client.getValueFromB).toBeDefined();
		expect(typeof client.getValueFromB).toBe('function');
		expect(client.callA).toBeDefined();

		// All workspaces are initialized, but createWorkspaceClient only returns B's client
		// Dependency workspace A is not accessible on this return value
		expect((client as any).workspaceA).toBeUndefined();

		// B can call A's actions internally via workspaces parameter
		const result = await client.callA();
		expect(result.data).toBe('value-from-a');
	});

	test('createWorkspaceClient with multiple dependencies returns only specified workspace', async () => {
		const workspaceA = defineWorkspace({
			id: 'a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-a'),
				}),
			}),
		});

		const workspaceB = defineWorkspace({
			id: 'b',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: () => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-b'),
				}),
			}),
		});

		const workspaceC = defineWorkspace({
			id: 'c',
			version: 1,
			dependencies: [workspaceA, workspaceB],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: {},
			actions: ({ workspaces }) => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-c'),
				}),
				getFromA: defineQuery({
					handler: async () => workspaces['a'].getValue(),
				}),
				getFromB: defineQuery({
					handler: async () => workspaces['b'].getValue(),
				}),
			}),
		});

		using client = await createWorkspaceClient(workspaceC);

		// createWorkspaceClient returns only C's actions
		expect(client.getValue).toBeDefined();
		expect(client.getFromA).toBeDefined();
		expect(client.getFromB).toBeDefined();

		// All workspaces are initialized, but createWorkspaceClient only returns C's client
		// A and B are not accessible on this return value
		expect((client as any).workspaceA).toBeUndefined();
		expect((client as any).workspaceB).toBeUndefined();

		// C can access A and B internally via workspaces parameter
		const resultA = await client.getFromA();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.getFromB();
		expect(resultB.data).toBe('value-from-b');
	});
});

/**
 * Test suite for workspace action handlers
 * Tests actions directly without CLI layer
 */
describe('Workspace Action Handlers', () => {
	const TEST_DIR = path.join(import.meta.dir, '.data/action-handler-test');
	const TEST_DB = path.join(TEST_DIR, 'test.db');
	const TEST_MARKDOWN = path.join(TEST_DIR, 'content');

	// Define a test workspace with CRUD operations
	const postsWorkspace = defineWorkspace({
		id: 'posts-test',
		version: 1,

		schema: {
			posts: {
				id: id(),
				title: text(),
				content: text({ nullable: true }),
				category: text(),
				views: integer({ default: 0 }),
			},
		},

		indexes: {
			sqlite: sqliteIndex,
			markdown: ({ id, db }) =>
				markdownIndex({
					id,
					db,
					storagePath: TEST_MARKDOWN,
				}),
		},

		actions: ({ db, indexes }) => {
			const { defineMutation, defineQuery, eq } = require('../index');
			return {
				listPosts: defineQuery({
					handler: async () => {
						const posts = await indexes.sqlite.db
							.select()
							.from(indexes.sqlite.posts);
						return Ok(posts);
					},
				}),

				getPost: defineQuery({
					input: type({ id: "string" }),
					handler: async ({ id }) => {
						const post = await indexes.sqlite.db
							.select()
							.from(indexes.sqlite.posts)
							.where(eq(indexes.sqlite.posts.id, id));
						return Ok(post);
					},
				}),

				createPost: defineMutation({
					input: type({
						title: "string",
						content: "string?",
						category: "string",
					}),
					handler: async ({ title, content, category }) => {
						const { generateId } = require('../index');
						const post = {
							id: generateId(),
							title,
							content: content ?? null,
							category,
							views: 0,
						};
						db.tables.posts.insert(post);
						return Ok(post);
					},
				}),

				updateViews: defineMutation({
					input: type({
						id: "string",
						views: "number",
					}),
					handler: async ({ id, views }) => {
						const { status, row } = db.tables.posts.get({ id });
						if (status !== 'valid') {
							throw new Error(`Post ${id} not found`);
						}
						db.tables.posts.update({ id, views });
						const { row: updatedPost } = db.tables.posts.get({ id });
						return Ok(updatedPost);
					},
				}),
			};
		},
	});

	beforeEach(async () => {
		const { existsSync } = await import('node:fs');
		const { mkdir, rm } = await import('node:fs/promises');
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
		await mkdir(TEST_DIR, { recursive: true });
		await mkdir(TEST_MARKDOWN, { recursive: true });
	});

	afterEach(async () => {
		const { existsSync } = await import('node:fs');
		const { rm } = await import('node:fs/promises');
		// Clean up test data
		if (existsSync(TEST_DIR)) {
			await rm(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('createPost mutation creates a post', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		const result = await client.createPost({
			title: 'Test Post',
			content: 'Test content',
			category: 'tech',
		});

		expect(result.error).toBeUndefined();
		expect(result.data?.title).toBe('Test Post');
		expect(result.data?.content).toBe('Test content');
		expect(result.data?.category).toBe('tech');
		expect(result.data?.views).toBe(0);
		expect(result.data?.id).toBeDefined();
	});

	test('listPosts query returns created posts', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		// Create a post first
		await client.createPost({
			title: 'Query Test',
			category: 'tech',
		});

		// Wait for indexes to sync
		await new Promise((resolve) => setTimeout(resolve, 200));

		// List all posts
		const result = await client.listPosts({});

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect(Array.isArray(result.data)).toBe(true);
		expect(result.data?.length).toBe(1);
		expect(result.data?.[0]?.title).toBe('Query Test');
	});

	test('getPost query retrieves specific post', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		// Create a post
		const createResult = await client.createPost({
			title: 'Specific Post',
			category: 'tech',
		});

		expect(createResult.data).toBeDefined();
		const postId = createResult.data!.id;

		// Wait for indexes to sync
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get the specific post
		const result = await client.getPost({ id: postId });

		expect(result.error).toBeUndefined();
		expect(result.data).toBeDefined();
		expect(Array.isArray(result.data)).toBe(true);
		expect(result.data?.length).toBe(1);
		expect(result.data?.[0]?.id).toBe(postId);
		expect(result.data?.[0]?.title).toBe('Specific Post');
	});

	test('updateViews mutation updates post view count', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		// Create a post
		const createResult = await client.createPost({
			title: 'Views Test',
			category: 'tech',
		});

		expect(createResult.data).toBeDefined();
		const postId = createResult.data!.id;

		// Update views
		const updateResult = await client.updateViews({
			id: postId,
			views: 42,
		});

		expect(updateResult.error).toBeUndefined();
		expect(updateResult.data?.views).toBe(42);
	});

	test('updateViews throws error for non-existent post', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		// Try to update views on non-existent post
		try {
			await client.updateViews({
				id: 'non-existent-id',
				views: 42,
			});
			expect(false).toBe(true); // Should not reach here
		} catch (error) {
			expect(error).toBeDefined();
			expect((error as Error).message).toContain('not found');
		}
	});

	test('createPost with optional content field', async () => {
		using client = await createWorkspaceClient(postsWorkspace);

		const result = await client.createPost({
			title: 'No Content Post',
			category: 'tech',
		});

		expect(result.error).toBeUndefined();
		expect(result.data?.title).toBe('No Content Post');
		expect(result.data?.content).toBe(null);
		expect(result.data?.category).toBe('tech');
	});
});
