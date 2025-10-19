import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineWorkspace,
	id,
	text,
	select,
	date,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	eq,
	type ValidatedRow,
} from '../../src/index';
import { users } from './users';

/**
 * Posts workspace (Single Dependency)
 * Depends on: users
 *
 * This workspace demonstrates:
 * - Single dependency pattern
 * - Accessing dependency actions via `workspaces.users`
 * - Type safety when calling dependency actions
 * - Cross-workspace queries (fetching author data from users workspace)
 */
export const posts = defineWorkspace({
	id: 'posts',
	version: 1,
	name: 'posts',

	// Single dependency on users workspace
	dependencies: [users],

	schema: {
		posts: {
			id: id(),
			title: text(),
			content: text(),
			// References a user ID (author)
			authorId: text(),
			status: select({ options: ['draft', 'published', 'archived'] }),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: '.data/posts.db' }),
	}),

	// NOTE: workspaces parameter provides typed access to dependency actions
	actions: ({ db, indexes, workspaces }) => ({
		// Query: Get all posts
		getAllPosts: defineQuery({
			handler: async () => {
				const posts = indexes.sqlite.db.select().from(indexes.sqlite.posts).all();
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id))
					.get();
				return Ok(post);
			},
		}),

		// Query: Get posts by status
		getPostsByStatus: defineQuery({
			input: Type.Object({
				status: Type.Union([
					Type.Literal('draft'),
					Type.Literal('published'),
					Type.Literal('archived'),
				]),
			}),
			handler: async ({ status }) => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.status, status))
					.all();
				return Ok(posts);
			},
		}),

		// Query: Get post with author details
		// Demonstrates cross-workspace query with type safety
		getPostWithAuthor: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id))
					.get();

				if (!post) {
					return Ok(null);
				}

				// ✅ Type-safe access to users workspace action
				// workspaces.users.getUser is fully typed with autocomplete
				const authorResult = await workspaces.users.getUser({ id: post.authorId });

				return Ok({
					...post,
					author: authorResult.data,
				});
			},
		}),

		// Query: Get posts by author
		// Demonstrates filtering by author with dependency access
		getPostsByAuthor: defineQuery({
			input: Type.Object({
				authorId: Type.String(),
			}),
			handler: async ({ authorId }) => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.authorId, authorId))
					.all();

				// Could also fetch author details here using workspaces.users.getUser
				return Ok(posts);
			},
		}),

		// Mutation: Create a post
		createPost: defineMutation({
			input: Type.Object({
				title: Type.String(),
				content: Type.String(),
				authorId: Type.String(),
				status: Type.Union([
					Type.Literal('draft'),
					Type.Literal('published'),
					Type.Literal('archived'),
				]),
			}),
			handler: async ({ title, content, authorId, status }) => {
				// ✅ Could validate author exists using workspaces.users.getUser here
				const authorResult = await workspaces.users.getUser({ id: authorId });
				if (!authorResult.data) {
					throw new Error(`Author with id ${authorId} not found`);
				}

				const post = {
					id: generateId(),
					title,
					content,
					authorId,
					status,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				} satisfies ValidatedRow<typeof db.schema.posts>;

				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Update post
		updatePost: defineMutation({
			input: Type.Object({
				id: Type.String(),
				title: Type.Optional(Type.String()),
				content: Type.Optional(Type.String()),
				status: Type.Optional(
					Type.Union([
						Type.Literal('draft'),
						Type.Literal('published'),
						Type.Literal('archived'),
					]),
				),
			}),
			handler: async ({ id, title, content, status }) => {
				const { status: rowStatus } = db.tables.posts.get(id);
				if (rowStatus !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}

				db.tables.posts.update({
					id,
					...(title && { title }),
					...(content && { content }),
					...(status && { status }),
					updatedAt: new Date().toISOString(),
				});

				const { row: updatedPost } = db.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),
	}),
});
