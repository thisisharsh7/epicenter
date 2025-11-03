import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '../../src/core/workspace/providers/persistence/desktop';
import {
	DateWithTimezone,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	markdownIndex,
	sqliteIndex,
} from '../../src/index';
import { SHORT_FORM_TEXT_SCHEMA } from './shared/schemas';

/**
 * Product Hunt workspace
 *
 * Manages Product Hunt posts with metadata for distribution tracking.
 * Uses the shared SHORT_FORM_TEXT_SCHEMA for consistency across social platforms.
 */
export const producthunt = defineWorkspace({
	id: 'producthunt',
	version: 1,

	schema: {
		posts: SHORT_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: (db) =>
			sqliteIndex(db, {
				path: path.join('.epicenter', 'producthunt.db'),
			}),
		markdown: (db) =>
			markdownIndex(db, {
				rootPath: './producthunt',
				pathToTableAndId: ({ path: filePath }) => {
					const parts = filePath.split(path.sep);
					if (parts.length !== 2) return null;
					const [tableName, fileName] = parts as [string, string];
					const id = path.basename(fileName, '.md');
					return { tableName, id };
				},
				tableAndIdToPath: ({ id, tableName }) =>
					path.join(tableName, `${id}.md`),
			}),
	},

	providers: [
		setupPersistence({
			storagePath: './.epicenter',
		}),
	],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all Product Hunt posts
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
		 * Get specific Product Hunt post by ID
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
		 * Create new Product Hunt post
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
				const now = DateWithTimezone({
					date: new Date(),
					timezone: 'UTC',
				}).toJSON();
				const post = {
					id: generateId(),
					pageId,
					content,
					title: title ?? null,
					niche,
					postedAt: now,
					updatedAt: now,
				};

				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		/**
		 * Update Product Hunt post
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
					updatedAt: DateWithTimezone({
						date: new Date(),
						timezone: 'UTC',
					}).toJSON(),
				};
				db.tables.posts.update(updates);
				const { row } = db.tables.posts.get(id);
				return Ok(row);
			},
		}),

		/**
		 * Delete Product Hunt post
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
