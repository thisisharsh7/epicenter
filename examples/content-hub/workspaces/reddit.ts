import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '@epicenter/hq/providers';
import {
	defineQuery,
	defineWorkspace,
	eq,
	markdownIndex,
	sqliteIndex,
} from '@epicenter/hq';
import { SHORT_FORM_TEXT_SCHEMA } from './shared/schemas';

/**
 * Reddit workspace
 *
 * Manages Reddit posts with metadata for distribution tracking.
 * Uses the shared SHORT_FORM_TEXT_SCHEMA for consistency across social platforms.
 */
export const reddit = defineWorkspace({
	id: 'reddit',

	schema: {
		posts: SHORT_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: ({ id, db }) =>
			markdownIndex({
				id,
				db,
				storagePath: process.env.EPICENTER_ROOT_PATH
					? path.join(process.env.EPICENTER_ROOT_PATH, id)
					: `./${id}`,
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		getPosts: db.tables.posts.getAll,
		getPost: db.tables.posts.get,
		createPost: db.tables.posts.insert,
		updatePost: db.tables.posts.update,
		deletePost: db.tables.posts.delete,

		/**
		 * Get posts filtered by niche
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
