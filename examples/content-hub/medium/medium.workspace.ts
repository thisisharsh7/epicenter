import {
	defineQuery,
	defineWorkspace,
	eq,
	markdownIndex,
	sqliteIndex,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { LONG_FORM_TEXT_SCHEMA } from '../shared/schemas';

/**
 * Medium workspace
 *
 * Manages Medium blog posts with metadata for distribution tracking.
 * Uses the shared LONG_FORM_TEXT_SCHEMA for consistency across blog platforms.
 */
export const medium = defineWorkspace({
	id: 'medium',

	schema: {
		posts: LONG_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: sqliteIndex,
		markdown: (c) => markdownIndex(c),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all Medium posts
		 *
		 * Direct table helper: `db.tables.posts.getAll` is already a Query<> with the
		 * correct types based on LONG_FORM_TEXT_SCHEMA. No defineQuery() needed.
		 */
		getPosts: db.tables.posts.getAll,

		/**
		 * Get a specific Medium post by ID
		 *
		 * Table helper assignment: `db.tables.posts.get` is pre-built and pre-typed.
		 */
		getPost: db.tables.posts.get,

		/**
		 * Create a new Medium post
		 *
		 * Using the table helper directly. The caller must provide:
		 * - id, pageId, title, subtitle, content, niche, postedAt, updatedAt
		 *
		 * If we wanted to auto-generate `id` or auto-set timestamps, we'd write
		 * a custom mutation. But for this "caller provides everything" approach,
		 * the table helper works perfectly.
		 */
		createPost: db.tables.posts.insert,

		/**
		 * Update a Medium post
		 *
		 * The table helper handles partial updates. Note: this doesn't auto-manage
		 * `updatedAt` - if you need that, write a custom mutation.
		 */
		updatePost: db.tables.posts.update,

		/**
		 * Delete a Medium post
		 *
		 * Simple and straightforward: `db.tables.posts.delete` removes a post by ID.
		 */
		deletePost: db.tables.posts.delete,

		/**
		 * Get posts filtered by niche
		 *
		 * CUSTOM query that we keep because it requires SQL filtering by the niche
		 * field. This is beyond basic CRUD, so we use `defineQuery()`.
		 */
		getPostsByNiche: defineQuery({
			input: type({
				niche:
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ niche }) => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.niche, niche));
				return Ok(posts);
			},
		}),

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
