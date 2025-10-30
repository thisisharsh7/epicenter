import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { join } from 'node:path';
import { setupPersistence } from '../../../src/core/workspace/providers/persistence/desktop';
import {
	type Row,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	sqliteIndex,
} from '../../../src/index';
import { SHORT_FORM_TEXT_SCHEMA } from '../shared/schemas';

/**
 * Hacker News workspace
 *
 * Manages Hacker News posts with metadata for distribution tracking.
 * Uses the shared SHORT_FORM_TEXT_SCHEMA for consistency across social platforms.
 */
export const hackernews = defineWorkspace({
	id: 'hackernews',
	version: 1,

	schema: {
		posts: SHORT_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: (db) => sqliteIndex(db, {
			path: join(import.meta.dirname, '.epicenter/database.db'),
		}),
	},

	providers: [
		setupPersistence({
			storagePath: join(import.meta.dirname, '.epicenter'),
		}),
	],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all Hacker News posts
		 */
		getPosts: defineQuery({
			handler: async () => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts);
				return Ok(posts);
			},
		}),

		/**
		 * Get specific Hacker News post by ID
		 */
		getPost: defineQuery({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id));
				return Ok(posts[0] ?? null);
			},
		}),

		/**
		 * Create new Hacker News post
		 */
		createPost: defineMutation({
			input: type({
				pageId: 'string',
				content: 'string',
				'title?': 'string',
				niche:
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ pageId, content, title, niche }) => {
				const now = new Date();
				const post = {
					id: generateId(),
					pageId,
					content,
					title: title ?? null,
					niche,
					postedAt: now,
					updatedAt: now,
				} satisfies Row<typeof db.schema.posts>;

				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		/**
		 * Update Hacker News post
		 */
		updatePost: defineMutation({
			input: type({
				id: 'string',
				'content?': 'string',
				'title?': 'string',
				'niche?':
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ id, ...fields }) => {
				const updates = {
					id,
					...fields,
					updatedAt: new Date(),
				};
				db.tables.posts.update(updates);
				const { row } = db.tables.posts.get(id);
				return Ok(row);
			},
		}),

		/**
		 * Delete Hacker News post
		 */
		deletePost: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				db.tables.posts.delete(id);
				return Ok({ id });
			},
		}),

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
	}),
});
