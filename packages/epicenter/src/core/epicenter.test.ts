import { describe, expect, test } from 'bun:test';
import { defineEpicenter, createEpicenterClient } from './epicenter';
import {
	defineWorkspace,
	id,
	text,
	select,
	multiSelect,
	date,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	eq,
} from '../index';
import { z } from 'zod';
import { Ok } from 'wellcrafted/result';

/**
 * Pages workspace - manages page content
 */
const pages = defineWorkspace({
	id: 'pages',
	version: '1',
	name: 'pages',

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({ options: ['blog', 'article', 'guide', 'tutorial', 'news'] }),
			tags: select({
				options: ['tech', 'lifestyle', 'business', 'education', 'entertainment'],
			}),
		},
	},

	indexes: ({ db }) => ({
		sqlite: sqliteIndex({ db, databaseUrl: ':memory:' }),
	}),

	actions: ({ db, indexes }) => ({
		getPages: defineQuery({
			input: z.void(),
			handler: async () => {
				const pages = indexes.sqlite.db.select().from(indexes.sqlite.pages).all();
				return Ok(pages);
			},
		}),

		getPage: defineQuery({
			input: z.object({ id: z.string() }),
			handler: async ({ id }) => {
				const page = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages)
					.where(eq(indexes.sqlite.pages.id, id))
					.get();
				return Ok(page);
			},
		}),

		createPage: defineMutation({
			input: z.object({
				title: z.string(),
				content: z.string(),
				type: z.enum(['blog', 'article', 'guide', 'tutorial', 'news']),
				tags: z.enum(['tech', 'lifestyle', 'business', 'education', 'entertainment']),
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
	version: '1',
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

	indexes: ({ db }) => ({
		sqlite: sqliteIndex({ db, databaseUrl: ':memory:' }),
	}),

	actions: ({ db, indexes, workspaces }) => ({
		createYouTubePost: defineMutation({
			input: z.object({
				pageId: z.string(),
				title: z.string(),
				description: z.string(),
				niche: z.array(
					z.enum([
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
					]),
				),
			}),
			handler: async ({ pageId, title, description, niche }) => {
				// Verify page exists by querying pages workspace
				const { data: page } = await workspaces.pages.getPage({ id: pageId });
				if (!page) {
					throw new Error(`Page with id ${pageId} not found`);
				}

				const post = {
					id: generateId(),
					page_id: pageId,
					title,
					description,
					niche,
					posted_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				};
				db.tables.youtube.insert(post);
				return Ok(post);
			},
		}),

		createTwitterPost: defineMutation({
			input: z.object({
				pageId: z.string(),
				content: z.string(),
				title: z.string().optional(),
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
			input: z.object({ pageId: z.string() }),
			handler: async ({ pageId }) => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.youtube)
					.where(eq(indexes.sqlite.youtube.page_id, pageId))
					.all();
				return Ok(posts);
			},
		}),

		getTwitterPosts: defineQuery({
			input: z.object({ pageId: z.string() }),
			handler: async ({ pageId }) => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.twitter)
					.where(eq(indexes.sqlite.twitter.page_id, pageId))
					.all();
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

		await client.destroy();
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
		const { data: retrievedPage } = await client.pages.getPage({ id: page!.id });
		expect(retrievedPage).toBeDefined();
		expect(retrievedPage?.title).toBe('Building with Epicenter');

		// Step 3: Create YouTube post for the page
		const { data: youtubePost } = await client.contentHub.createYouTubePost({
			pageId: page!.id,
			title: 'Building with Epicenter - Full Tutorial',
			description: 'Learn how to build collaborative apps with Epicenter',
			niche: ['Coding', 'Productivity'],
		});

		expect(youtubePost).toBeDefined();
		expect(youtubePost?.page_id).toBe(page!.id);
		expect(youtubePost?.title).toBe('Building with Epicenter - Full Tutorial');

		// Step 4: Create Twitter post for the page
		const { data: twitterPost } = await client.contentHub.createTwitterPost({
			pageId: page!.id,
			content:
				'Just published a new blog post about Epicenter! Check it out: https://example.com/blog/epicenter',
			title: 'New Blog Post',
		});

		expect(twitterPost).toBeDefined();
		expect(twitterPost?.page_id).toBe(page!.id);
		expect(twitterPost?.content).toContain('Epicenter');

		// Step 5: Query all posts for this page
		const { data: youtubePosts } = await client.contentHub.getYouTubePosts({
			pageId: page!.id,
		});
		expect(youtubePosts).toHaveLength(1);
		expect(youtubePosts?.[0].title).toBe('Building with Epicenter - Full Tutorial');

		const { data: twitterPosts } = await client.contentHub.getTwitterPosts({
			pageId: page!.id,
		});
		expect(twitterPosts).toHaveLength(1);
		expect(twitterPosts?.[0].content).toContain('Epicenter');

		await client.destroy();
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
			content: 'YJS is a CRDT library for building collaborative applications...',
			type: 'tutorial',
			tags: 'tech',
		});

		const { data: page2 } = await client.pages.createPage({
			title: 'Real-time Collaboration Patterns',
			content: 'Learn about common patterns for real-time collaboration...',
			type: 'guide',
			tags: 'tech',
		});

		// Create posts for page1
		await client.contentHub.createYouTubePost({
			pageId: page1!.id,
			title: 'YJS Tutorial - Getting Started',
			description: 'A beginner-friendly introduction to YJS',
			niche: ['Coding', 'Productivity'],
		});

		await client.contentHub.createTwitterPost({
			pageId: page1!.id,
			content: 'New tutorial on YJS is live!',
		});

		// Create posts for page2
		await client.contentHub.createYouTubePost({
			pageId: page2!.id,
			title: 'Real-time Collaboration - Best Practices',
			description: 'Learn the best patterns for collaborative apps',
			niche: ['Coding', 'Productivity', 'Epicenter'],
		});

		await client.contentHub.createTwitterPost({
			pageId: page2!.id,
			content: 'Check out my new guide on real-time collaboration!',
		});

		// Verify all pages exist
		const { data: allPages } = await client.pages.getPages();
		expect(allPages).toHaveLength(2);

		// Verify posts for each page
		const { data: page1Youtube } = await client.contentHub.getYouTubePosts({
			pageId: page1!.id,
		});
		expect(page1Youtube).toHaveLength(1);

		const { data: page1Twitter } = await client.contentHub.getTwitterPosts({
			pageId: page1!.id,
		});
		expect(page1Twitter).toHaveLength(1);

		const { data: page2Youtube } = await client.contentHub.getYouTubePosts({
			pageId: page2!.id,
		});
		expect(page2Youtube).toHaveLength(1);

		const { data: page2Twitter } = await client.contentHub.getTwitterPosts({
			pageId: page2!.id,
		});
		expect(page2Twitter).toHaveLength(1);

		await client.destroy();
	});

	test('should fail when creating post for non-existent page', async () => {
		const epicenter = defineEpicenter({
			id: 'content-platform',
			workspaces: [pages, contentHub],
		});

		const client = await createEpicenterClient(epicenter);

		// Try to create a YouTube post for a non-existent page
		await expect(
			client.contentHub.createYouTubePost({
				pageId: 'non-existent-id',
				title: 'Test',
				description: 'Test',
				niche: ['Coding'],
			}),
		).rejects.toThrow('Page with id non-existent-id not found');

		await client.destroy();
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
		await expect(client.destroy()).resolves.not.toThrow();
	});
});
