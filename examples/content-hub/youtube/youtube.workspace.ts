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
import { SHORT_FORM_VIDEO_SCHEMA } from '../shared/schemas';

/**
 * YouTube workspace
 *
 * Manages YouTube video posts with metadata for distribution tracking.
 * Uses the shared SHORT_FORM_VIDEO_SCHEMA for consistency across video platforms.
 */
export const youtube = defineWorkspace({
	id: 'youtube',

	schema: {
		posts: SHORT_FORM_VIDEO_SCHEMA,
	},

	indexes: {
		sqlite: sqliteIndex,
		markdown: (c) => markdownIndex(c),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all YouTube posts
		 *
		 * Table helper pattern: we can pass `db.tables.posts.getAll` directly because
		 * it's already a Query<> with the correct type annotations. Epicenter recognizes
		 * table helpers as valid actions without needing `defineQuery()` wrapper.
		 */
		getPosts: db.tables.posts.getAll,

		/**
		 * Get a specific YouTube post by ID
		 *
		 * Same pattern: `db.tables.posts.get` is a pre-built Query that's already typed
		 * to accept { id: string } and return a post or null.
		 */
		getPost: db.tables.posts.get,

		/**
		 * Create a new YouTube post
		 *
		 * Why use table helper here? The schema enforces all required fields are provided.
		 * We don't need auto-generated IDs or timestamps because the caller provides them.
		 * If we needed to add postedAt/updatedAt automatically, we'd write a custom mutation.
		 */
		createPost: db.tables.posts.insert,

		/**
		 * Update a YouTube post
		 *
		 * `db.tables.posts.update` handles partial updates. The table helper already knows
		 * how to merge the provided fields with the existing row. No need to wrap it.
		 */
		updatePost: db.tables.posts.update,

		/**
		 * Delete a YouTube post
		 *
		 * Table helper for deletion. Clean, simple, and already properly typed.
		 */
		deletePost: db.tables.posts.delete,

		/**
		 * Get posts filtered by niche
		 *
		 * This is a CUSTOM query that we keep because it has business logic the table helper
		 * doesn't provide: filtering by the niche field using SQL.
		 *
		 * We still use `defineQuery()` here because we're doing something beyond basic CRUD.
		 * The pattern is:
		 * - Use table helpers for CRUD (create, read, update, delete)
		 * - Use defineQuery/defineMutation for custom logic (filtering, joining, complex ops)
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
