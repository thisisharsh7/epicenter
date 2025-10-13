import { z } from 'zod';
import { Ok } from 'wellcrafted/result';
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
} from '../../packages/epicenter/src/index';

/**
 * Content hub workspace
 * Manages pages and their distribution across social media platforms
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

export default defineWorkspace({
	id: 'content-hub',
	version: '1',
	name: 'content-hub',

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({ options: ['blog', 'article', 'guide', 'tutorial', 'news'] }),
			tags: select({ options: ['tech', 'lifestyle', 'business', 'education', 'entertainment'] }),
		},
		youtube: {
			id: id(),
			page_id: text(),
			title: text(),
			description: text(),
			niche,
			posted_at: date(),
			updated_at: date(),
		},
		instagram: {
			id: id(),
			page_id: text(),
			title: text(),
			description: text(),
			niche,
			posted_at: date(),
			updated_at: date(),
		},
		tiktok: {
			id: id(),
			page_id: text(),
			title: text(),
			description: text(),
			niche,
			posted_at: date(),
			updated_at: date(),
		},
		substack: {
			id: id(),
			page_id: text(),
			title: text(),
			subtitle: text(),
			content: text(),
			niche,
			posted_at: date(),
			updated_at: date(),
		},
		medium: {
			id: id(),
			page_id: text(),
			title: text(),
			subtitle: text(),
			content: text(),
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
		sqlite: sqliteIndex({ db, databaseUrl: 'file:test-data/content-hub.db' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all pages
		getPages: defineQuery({
			input: z.void(),
			handler: async () => {
				const pages = indexes.sqlite.db.select().from(indexes.sqlite.pages).all();
				return Ok(pages);
			},
		}),

		// Query: Get page by ID
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

		// Mutation: Create a page
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

		// Mutation: Create YouTube post
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

		// Mutation: Create Twitter post
		createTwitterPost: defineMutation({
			input: z.object({
				pageId: z.string(),
				content: z.string(),
				title: z.string().optional(),
			}),
			handler: async ({ pageId, content, title }) => {
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
	}),
});
