import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '../../../src/core/workspace/providers/persistence/desktop';
import {
	DateWithTimezone,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	markdownIndex,
	sqliteIndex,
} from '../../../src/index';
import { LONG_FORM_TEXT_SCHEMA } from '../shared/schemas';

/**
 * Medium workspace
 *
 * Manages Medium blog posts with metadata for distribution tracking.
 * Uses the shared LONG_FORM_TEXT_SCHEMA for consistency across blog platforms.
 */
export const medium = defineWorkspace({
	id: 'medium',
	version: 1,

	schema: {
		posts: LONG_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: (db) => sqliteIndex(db),
		markdown: (db) =>
			markdownIndex(db, {
				rootPath: path.join(import.meta.dirname, '.data/content'),
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
			storagePath: path.join(import.meta.dirname, '.epicenter'),
		}),
	],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all Medium posts
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
		 * Get specific Medium post by ID
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
		 * Create new Medium post
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
		 * Update Medium post
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
				const { row } = db.tables.posts.get(id);
				return Ok(row);
			},
		}),

		/**
		 * Delete Medium post
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
