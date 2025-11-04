import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '@epicenter/hq/providers';
import {
	DateWithTimezone,
	type Row,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	markdownIndex,
	sqliteIndex,
} from '@epicenter/hq';
import { LONG_FORM_TEXT_SCHEMA } from './shared/schemas';

/**
 * Personal Blog workspace
 *
 * Manages personal blog posts with metadata for distribution tracking.
 * Uses the shared LONG_FORM_TEXT_SCHEMA for consistency across blog platforms.
 */
export const personalBlog = defineWorkspace({
	id: 'personal-blog',
	version: 1,

	schema: {
		posts: LONG_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: sqliteIndex,
		markdown: ({ id, db }) =>
			markdownIndex({
				id,
				db,
				rootPath: './personal-blog',
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all personal blog posts
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
		 * Get specific personal blog post by ID
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
		 * Create new personal blog post
		 */
		createPost: defineMutation({
			input: type({
				pageId: 'string',
				title: 'string',
				subtitle: 'string',
				content: 'string',
				niche:
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ pageId, title, subtitle, content, niche }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: 'UTC',
				}).toJSON();
				const post = {
					id: generateId(),
					pageId,
					title,
					subtitle,
					content,
					niche,
					postedAt: now,
					updatedAt: now,
				};

				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		/**
		 * Update personal blog post
		 */
		updatePost: defineMutation({
			input: type({
				id: 'string',
				'title?': 'string',
				'subtitle?': 'string',
				'content?': 'string',
				'niche?':
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ id, ...fields }) => {
				const updates = {
					id,
					...fields,
					updatedAt: DateWithTimezone({
						date: new Date(),
						timezone: 'UTC',
					}).toJSON(),
				};
				db.tables.posts.update(updates);
				const { row } = await db.tables.posts.get({ id });
				return Ok(row);
			},
		}),

		/**
		 * Delete personal blog post
		 */
		deletePost: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				await db.tables.posts.delete({ id });
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
