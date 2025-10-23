import { describe, expect, expectTypeOf, test } from 'bun:test';
import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	date,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	multiSelect,
	select,
	sqliteIndex,
	text,
} from '../index';
import { createEpicenterClient, defineEpicenter } from './epicenter/index';

/**
 * Pages workspace - manages page content
 */
const pages = defineWorkspace({
	id: 'pages',
	version: 1,
	name: 'pages',

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({
				options: ['blog', 'article', 'guide', 'tutorial', 'news'],
			}),
			tags: select({
				options: [
					'tech',
					'lifestyle',
					'business',
					'education',
					'entertainment',
				],
			}),
		},
	},

	indexes: {
		sqlite: (db) => sqliteIndex(db, { inMemory: true }),
	},

	actions: ({ db, indexes }) => ({
		getPages: defineQuery({
			handler: async () => {
				const pages = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages);
				return Ok(pages);
			},
		}),

		getPage: defineQuery({
			input: Type.Object({ id: Type.String() }),
			handler: async ({ id }) => {
				const page = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages)
					.where(eq(indexes.sqlite.pages.id, id));
				return Ok(page);
			},
		}),

		createPage: defineMutation({
			input: Type.Object({
				title: Type.String(),
				content: Type.String(),
				type: Type.Union([
					Type.Literal('blog'),
					Type.Literal('article'),
					Type.Literal('guide'),
					Type.Literal('tutorial'),
					Type.Literal('news'),
				]),
				tags: Type.Union([
					Type.Literal('tech'),
					Type.Literal('lifestyle'),
					Type.Literal('business'),
					Type.Literal('education'),
					Type.Literal('entertainment'),
				]),
			}),
			handler: async ({ title, content, type, tags }) => {
				const page = {
					id: generateId(),
					title,
					content,
					type,
					tags,
				};
				db.tables.pages.insert(page);
				return Ok(page);
			},
		}),
	}),
});

/**
 * Content hub workspace - manages distribution across social media
 */
const niche = multiSelect({
	options: [
		'Braden',
		'Epicenter',
		'YC',
		'Yale',
		'College Students',
		'High School Students',
		'Coding',
		'Productivity',
		'Ethics',
		'Writing',
	],
});

const contentHub = defineWorkspace({
	id: 'content-hub',
	version: 1,
	name: 'contentHub',

	dependencies: [pages],

	schema: {
		youtube: {
			id: id(),
			page_id: text(),
			title: text(),
			description: text(),
			niche,
			posted_at: date(),
			updated_at: date(),
		},
		twitter: {
			id: id(),
			page_id: text(),
			content: text(),
			title: text({ nullable: true }),
		},
	},

	indexes: {
		sqlite: (db) => sqliteIndex(db, { inMemory: true }),
	},

	actions: ({ db, indexes, workspaces }) => ({
		createYouTubePost: defineMutation({
			input: Type.Object({
				pageId: Type.String(),
				title: Type.String(),
				description: Type.String(),
				niche: Type.Array(
					Type.Union([
						Type.Literal('Braden'),
						Type.Literal('Epicenter'),
						Type.Literal('YC'),
						Type.Literal('Yale'),
						Type.Literal('College Students'),
						Type.Literal('High School Students'),
						Type.Literal('Coding'),
						Type.Literal('Productivity'),
						Type.Literal('Ethics'),
						Type.Literal('Writing'),
					]),
				),
			}),
			handler: async ({ pageId, title, description, niche }) => {
				// Verify page exists by querying pages workspace
				const { data: page } = await workspaces.pages.getPage({ id: pageId });
				if (!page) {
					throw new Error(`Page with id ${pageId} not found`);
				}

				const now = { date: new Date(), timezone: 'UTC' };
				const post = {
					id: generateId(),
					page_id: pageId,
					title,
					description,
					niche,
					posted_at: now,
					updated_at: now,
				};
				db.tables.youtube.insert(post);
				return Ok(post);
			},
		}),

		createTwitterPost: defineMutation({
			input: Type.Object({
				pageId: Type.String(),
				content: Type.String(),
				title: Type.Optional(Type.String()),
			}),
			handler: async ({ pageId, content, title }) => {
				// Verify page exists by querying pages workspace
				const { data: page } = await workspaces.pages.getPage({ id: pageId });
				if (!page) {
					throw new Error(`Page with id ${pageId} not found`);
				}

				const post = {
					id: generateId(),
					page_id: pageId,
					content,
					title: title ?? null,
				};
				db.tables.twitter.insert(post);
				return Ok(post);
			},
		}),

		getYouTubePosts: defineQuery({
			input: Type.Object({ pageId: Type.String() }),
			handler: async ({ pageId }) => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.youtube)
					.where(eq(indexes.sqlite.youtube.page_id, pageId));
				return Ok(posts);
			},
		}),

		getTwitterPosts: defineQuery({
			input: Type.Object({ pageId: Type.String() }),
			handler: async ({ pageId }) => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.twitter)
					.where(eq(indexes.sqlite.twitter.page_id, pageId));
				return Ok(posts);
			},
		}),
	}),
});

describe('Epicenter', () => {
	test('should define epicenter with multiple workspaces', () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		expect(epicenter.id).toBe('content-platform');
		expect(epicenter.workspaces).toHaveLength(2);
		expect(epicenter.workspaces[0].name).toBe('pages');
		expect(epicenter.workspaces[1].name).toBe('contentHub');
	});

	test('should throw on duplicate workspace names', () => {
		const pages2 = defineWorkspace({
			...pages,
			id: 'pages2',
			name: 'pages', // Same name!
		});

		expect(() =>
			defineEpicenter({
				id: 'test',
				workspaces: [pages, pages2],
			}),
		).toThrow('Duplicate workspace names detected');
	});

	test('should throw on duplicate workspace IDs', () => {
		const pages2 = defineWorkspace({
			...pages,
			name: 'pages2',
		});

		expect(() =>
			defineEpicenter({
				id: 'test',
				workspaces: [pages, pages2],
			}),
		).toThrow('Duplicate workspace IDs detected');
	});

	test('should create epicenter client with all workspaces', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		expect(client.pages).toBeDefined();
		expect(client.contentHub).toBeDefined();
		expect(client.destroy).toBeDefined();

		client.destroy();
	});

	test('client types are correctly inferred and non-nullable', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Type-level assertions using expectTypeOf (compile-time checks)
		// These verify TypeScript correctly infers the types
		expectTypeOf(client).toHaveProperty('pages');
		expectTypeOf(client).toHaveProperty('contentHub');
		expectTypeOf(client).toHaveProperty('destroy');

		expectTypeOf(client.pages).toHaveProperty('createPage');
		expectTypeOf(client.pages).toHaveProperty('getPage');
		expectTypeOf(client.pages).toHaveProperty('getPages');
		expectTypeOf(client.contentHub).toHaveProperty('createYouTubePost');
		expectTypeOf(client.contentHub).toHaveProperty('createTwitterPost');

		// Runtime assertions to verify the properties actually exist
		expect(client.pages).toBeDefined();
		expect(client.contentHub).toBeDefined();

		client.destroy();
	});

	test('should chain workspaces: create page and distribute to social media', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Step 1: Create a page in the pages workspace
		const { data: page } = await client.pages.createPage({
			title: 'Building with Epicenter',
			content: 'Epicenter is a YJS-first collaborative workspace system...',
			type: 'blog',
			tags: 'tech',
		});

		expect(page).toBeDefined();
		expect(page?.title).toBe('Building with Epicenter');
		expect(page?.type).toBe('blog');

		// Step 2: Verify we can query the page
		const { data: retrievedPage } = await client.pages.getPage({
			id: page!.id,
		});
		expect(retrievedPage).toBeDefined();
		expect(retrievedPage?.title).toBe('Building with Epicenter');

		// Step 3: Create Twitter post for the page
		const { data: twitterPost } = await client.contentHub.createTwitterPost({
			pageId: page!.id,
			content:
				'Just published a new blog post about Epicenter! Check it out: https://example.com/blog/epicenter',
			title: 'New Blog Post',
		});

		expect(twitterPost).toBeDefined();
		expect(twitterPost?.page_id).toBe(page!.id);
		expect(twitterPost?.content).toContain('Epicenter');

		// Wait for SQLite sync to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Step 4: Query all posts for this page
		const { data: twitterPosts } = await client.contentHub.getTwitterPosts({
			pageId: page!.id,
		});
		expect(twitterPosts).toHaveLength(1);
		expect(twitterPosts?.[0].content).toContain('Epicenter');

		client.destroy();
	});

	test('should chain workspaces: create multiple pages and posts', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Create multiple pages
		const { data: page1 } = await client.pages.createPage({
			title: 'Introduction to YJS',
			content:
				'YJS is a CRDT library for building collaborative applications...',
			type: 'tutorial',
			tags: 'tech',
		});

		const { data: page2 } = await client.pages.createPage({
			title: 'Real-time Collaboration Patterns',
			content: 'Learn about common patterns for real-time collaboration...',
			type: 'guide',
			tags: 'tech',
		});

		// Create Twitter posts for both pages
		await client.contentHub.createTwitterPost({
			pageId: page1!.id,
			content: 'New tutorial on YJS is live!',
		});

		await client.contentHub.createTwitterPost({
			pageId: page2!.id,
			content: 'Check out my new guide on real-time collaboration!',
		});

		// Wait for SQLite sync to complete
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify all pages exist
		const { data: allPages } = await client.pages.getPages();
		expect(allPages).toHaveLength(2);

		// Verify Twitter posts for each page
		const { data: page1Twitter } = await client.contentHub.getTwitterPosts({
			pageId: page1!.id,
		});
		expect(page1Twitter).toHaveLength(1);
		expect(page1Twitter?.[0].content).toContain('YJS');

		const { data: page2Twitter } = await client.contentHub.getTwitterPosts({
			pageId: page2!.id,
		});
		expect(page2Twitter).toHaveLength(1);
		expect(page2Twitter?.[0].content).toContain('collaboration');

		client.destroy();
	});

	test('should fail when creating post for non-existent page', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Try to create a Twitter post for a non-existent page
		await expect(
			client.contentHub.createTwitterPost({
				pageId: 'non-existent-id',
				content: 'Test',
			}),
		).rejects.toThrow();

		client.destroy();
	});

	test('should properly clean up all workspaces on destroy', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Create some data
		await client.pages.createPage({
			title: 'Test Page',
			content: 'Test content',
			type: 'blog',
			tags: 'tech',
		});

		// Destroy should not throw
		client.destroy();
	});

	describe('Action Exposure', () => {
		/**
		 * Helper to create a simple workspace with actions for testing action exposure
		 */
		const createTestWorkspace = (
			workspaceId: string,
			name: string,
			deps: any[] = [],
		) => {
			return defineWorkspace({
				id: workspaceId,
				version: 1,
				name,
				dependencies: deps,
				schema: {
					items: {
						id: id(),
						value: text(),
					},
				},
				indexes: {
					sqlite: (db) => sqliteIndex(db, { inMemory: true }),
				},
				actions: ({ workspaces }) => ({
					getValue: defineQuery({
						handler: () => Ok(`value-from-${name}`),
					}),
					...(deps.length > 0
						? {
								getValueFromDependency: defineQuery({
									handler: async () => {
										// Access the first dependency's action
										const depName = deps[0].name;
										const result = await (workspaces as any)[
											depName
										].getValue();
										return result;
									},
								}),
							}
						: {}),
				}),
			});
		};

		test('exposes all workspaces in the workspaces array by name', async () => {
			const workspaceA = createTestWorkspace('a', 'workspaceA');
			const workspaceB = createTestWorkspace('b', 'workspaceB', [workspaceA]);

			const epicenter = defineEpicenter({
				id: 'test',
				workspaces: [workspaceA, workspaceB],
			});

			const client = await createEpicenterClient(epicenter);

			// BOTH workspaces are exposed by their names
			expect(client.workspaceA).toBeDefined();
			expect(client.workspaceB).toBeDefined();

			// Both have their actions
			expect(client.workspaceA.getValue).toBeDefined();
			expect(client.workspaceB.getValue).toBeDefined();
			expect(client.workspaceB.getValueFromDependency).toBeDefined();

			// Can call actions on both
			const resultA = await client.workspaceA.getValue();
			expect(resultA.data).toBe('value-from-workspaceA');

			const resultB = await client.workspaceB.getValue();
			expect(resultB.data).toBe('value-from-workspaceB');

			client.destroy();
		});

		test('requires all transitive dependencies in workspaces array (flat/hoisted)', () => {
			const workspaceA = createTestWorkspace('a', 'workspaceA');
			const workspaceB = createTestWorkspace('b', 'workspaceB', [workspaceA]);
			const workspaceC = createTestWorkspace('c', 'workspaceC', [
				workspaceA,
				workspaceB,
			]);

			// Only include B and C in epicenter, not A (missing dependency)
			const epicenter = defineEpicenter({
				id: 'test',
				workspaces: [workspaceB, workspaceC],
			});

			// Should throw because A is a dependency but not listed
			expect(() => createEpicenterClient(epicenter)).toThrow(
				/Missing dependency.*"a"/,
			);
		});

		test('flat/hoisted model: all dependencies must be explicitly listed', async () => {
			const workspaceA = createTestWorkspace('a', 'workspaceA');
			const workspaceB = createTestWorkspace('b', 'workspaceB', [workspaceA]);
			const workspaceC = createTestWorkspace('c', 'workspaceC', [
				workspaceA,
				workspaceB,
			]);

			// Correctly include ALL workspaces (flat/hoisted)
			const epicenter = defineEpicenter({
				id: 'test',
				workspaces: [workspaceA, workspaceB, workspaceC],
			});

			const client = await createEpicenterClient(epicenter);

			// All workspaces are exposed
			expect(client.workspaceA).toBeDefined();
			expect(client.workspaceB).toBeDefined();
			expect(client.workspaceC).toBeDefined();

			// Can call actions on all workspaces
			const resultA = await client.workspaceA.getValue();
			expect(resultA.data).toBe('value-from-workspaceA');

			const resultB = await client.workspaceB.getValueFromDependency();
			expect(resultB.data).toBe('value-from-workspaceA');

			client.destroy();
		});

		test('multiple workspaces with no dependencies - all exposed', async () => {
			const workspaceA = createTestWorkspace('a', 'workspaceA');
			const workspaceB = createTestWorkspace('b', 'workspaceB');
			const workspaceC = createTestWorkspace('c', 'workspaceC');

			const epicenter = defineEpicenter({
				id: 'test',
				workspaces: [workspaceA, workspaceB, workspaceC],
			});

			const client = await createEpicenterClient(epicenter);

			// All three workspaces exposed
			expect(client.workspaceA).toBeDefined();
			expect(client.workspaceB).toBeDefined();
			expect(client.workspaceC).toBeDefined();

			// All have their actions
			const resultA = await client.workspaceA.getValue();
			expect(resultA.data).toBe('value-from-workspaceA');

			const resultB = await client.workspaceB.getValue();
			expect(resultB.data).toBe('value-from-workspaceB');

			const resultC = await client.workspaceC.getValue();
			expect(resultC.data).toBe('value-from-workspaceC');

			client.destroy();
		});
	});
});
