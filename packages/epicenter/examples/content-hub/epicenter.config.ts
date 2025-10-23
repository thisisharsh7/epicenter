import { Type } from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineWorkspace,
	defineEpicenter,
	setupPersistenceDesktop,
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
	type Row,
	type Db,
	defineIndex,
} from '../../src/index';
import type { WorkspaceSchema } from '../../src/core/schema';

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

	indexes: {
		sqlite: (db) => sqliteIndex(db),
	},

	// Use desktop filesystem persistence helper
	// Stores YJS document at ./.epicenter/pages.yjs
	setupYDoc: (ydoc) => setupPersistenceDesktop(ydoc),

	actions: ({ db, indexes }) => ({
		// Query: Get all pages
		getPages: defineQuery({
			handler: async () => {
				console.log('Fetched pages:', indexes.sqlite.pages);
				const pages = await indexes.sqlite.db.select().from(indexes.sqlite.pages);
				return Ok(pages);
			},
		}),

		// Query: Get page by ID
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
				} satisfies Row<typeof db.schema.pages>;
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

export const contentHub = defineWorkspace({
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

	indexes: {
		sqlite: (db) => sqliteIndex(db),
	},

	// Use desktop filesystem persistence helper
	// Stores YJS document at ./.epicenter/content-hub.yjs
	setupYDoc: (ydoc) => setupPersistenceDesktop(ydoc),

	actions: ({ db, indexes }) => ({
		// Mutation: Create YouTube post
		// Note: Manual schema here for API design reasons (camelCase, omitting date fields)
		// Alternative with adapter: createInsertSchemaZod(db.schema.youtube).omit({ posted_at: true, updated_at: true })
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
				} satisfies Row<typeof db.schema.youtube>;
				db.tables.youtube.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Create Twitter post
		// Note: Manual schema here because API uses camelCase (pageId) while DB uses snake_case (page_id)
		// For schemas where API matches DB field names, use createInsertSchemaZod(db.schema.twitter)
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
				} satisfies Row<typeof db.schema.twitter>;
				db.tables.twitter.insert(post);
				return Ok(post);
			},
		}),
	}),
});

/**
 * Default export for CLI usage
 * The CLI expects the config to export the Epicenter app directly
 */
export default defineEpicenter({
	id: 'content-hub',
	workspaces: [pages, contentHub],
});
