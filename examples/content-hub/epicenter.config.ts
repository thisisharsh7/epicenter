import Type from 'typebox';
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
	type ValidatedRow,
} from '../../packages/epicenter/src/index';

/**
 * Pages workspace
 * Manages page content (blogs, articles, guides, tutorials, news)
 */
export const pages = defineWorkspace({
	id: 'pages',
	version: 1,
	name: 'pages',

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({ options: ['blog', 'article', 'guide', 'tutorial', 'news'] }),
			tags: select({ options: ['tech', 'lifestyle', 'business', 'education', 'entertainment'] }),
		},
	},

	indexes: ({ db }) => ({
		sqlite: sqliteIndex({ db, databaseUrl: 'file:test-data/pages.db' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all pages
		getPages: defineQuery({
			handler: async () => {
				const pages = indexes.sqlite.db.select().from(indexes.sqlite.pages).all();
				return Ok(pages);
			},
		}),

		// Query: Get page by ID
		getPage: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
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
			handler: async (data) => {
				const page = {
					id: generateId(),
					...data,
				} satisfies ValidatedRow<typeof db.schema.pages>;
				db.tables.pages.insert(page);
				return Ok(page);
			},
		}),
	}),
});

/**
 * Content hub workspace
 * Manages distribution of pages across social media platforms
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
	version: 1,
	name: 'content-hub',

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
		// Mutation: Create YouTube post
		// Note: Manual schema here for API design reasons (camelCase, omitting date fields)
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
				const post = {
					id: generateId(),
					page_id: pageId,
					title,
					description,
					niche,
					posted_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				} satisfies ValidatedRow<typeof db.schema.youtube>;
				db.tables.youtube.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Create Twitter post
		// Note: Manual schema here because API uses camelCase (pageId) while DB uses snake_case (page_id)
		createTwitterPost: defineMutation({
			input: Type.Object({
				pageId: Type.String(),
				content: Type.String(),
				title: Type.Optional(Type.String()),
			}),
			handler: async ({ pageId, content, title }) => {
				const post = {
					id: generateId(),
					page_id: pageId,
					content,
					title: title ?? null,
				} satisfies ValidatedRow<typeof db.schema.twitter>;
				db.tables.twitter.insert(post);
				return Ok(post);
			},
		}),
	}),
});
