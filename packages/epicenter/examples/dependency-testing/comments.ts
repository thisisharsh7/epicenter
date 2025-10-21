import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineEpicenter,
	id,
	text,
	date,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	eq,
	type ValidatedRow,
} from '../../src/index';
import { posts } from './posts';

/**
 * Comments epicenter (Chained Workspace Dependency)
 * Depends on: posts (which depends on users)
 *
 * This epicenter demonstrates:
 * - Chained/transitive workspace dependencies
 * - Access to immediate workspace (posts) but NOT transitive workspace (users)
 * - Type safety: `workspaces.posts` exists, `workspaces.users` does NOT
 * - How to access users data indirectly through posts actions
 */
export const comments = defineEpicenter({
	id: 'comments',
	version: 1,
	name: 'comments',

	// Only direct workspace dependency on posts
	// NOTE: Users epicenter is NOT directly accessible even though posts depends on it
	workspaces: [posts],

	schema: {
		comments: {
			id: id(),
			postId: text(),
			authorId: text(),
			content: text(),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: '.data/comments.db' }),
	}),

	// NOTE: Only workspaces.posts is available, NOT workspaces.users
	// This demonstrates that workspace dependencies are NOT transitive
	actions: ({ db, indexes, workspaces }) => ({
		// Query: Get all comments
		getAllComments: defineQuery({
			handler: async () => {
				const comments = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments);
				return Ok(comments);
			},
		}),

		// Query: Get comment by ID
		getComment: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				const comment = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.id, id));
				return Ok(comment);
			},
		}),

		// Query: Get comments for a post
		getCommentsByPost: defineQuery({
			input: Type.Object({
				postId: Type.String(),
			}),
			handler: async ({ postId }) => {
				const comments = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.postId, postId));
				return Ok(comments);
			},
		}),

		// Query: Get comment with post details
		// Demonstrates accessing posts epicenter action
		getCommentWithPost: defineQuery({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				const comment = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.id, id));

				if (!comment) {
					return Ok(null);
				}

				// ✅ Can access posts epicenter (direct workspace dependency)
				const postResult = await workspaces.posts.getPost({ id: comment.postId });

				// ❌ CANNOT access workspaces.users directly (not a direct workspace dependency)
				// This would cause a TypeScript error:
				// await workspaces.users.getUser({ id: comment.authorId });
				//                ^^^^^ Property 'users' does not exist

				// ✅ But can get author data through posts.getPostWithAuthor
				const postWithAuthorResult = await workspaces.posts.getPostWithAuthor({
					id: comment.postId,
				});

				return Ok({
					...comment,
					post: postResult.data,
					// Author data available indirectly through post
					author: postWithAuthorResult.data?.author,
				});
			},
		}),

		// Query: Get comments by author (indirect access to user data)
		getCommentsByAuthor: defineQuery({
			input: Type.Object({
				authorId: Type.String(),
			}),
			handler: async ({ authorId }) => {
				// Direct query on our own table
				const comments = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.authorId, authorId));

				// ✅ Could enrich with post data using workspaces.posts epicenter
				// ❌ CANNOT directly access workspaces.users.getUser epicenter

				return Ok(comments);
			},
		}),

		// Mutation: Create a comment
		createComment: defineMutation({
			input: Type.Object({
				postId: Type.String(),
				authorId: Type.String(),
				content: Type.String(),
			}),
			handler: async ({ postId, authorId, content }) => {
				// ✅ Can validate post exists using workspaces.posts epicenter
				const postResult = await workspaces.posts.getPost({ id: postId });
				if (!postResult.data) {
					throw new Error(`Post with id ${postId} not found`);
				}

				// ❌ CANNOT directly validate author using workspaces.users epicenter
				// Would need to add users as a direct workspace dependency or trust the authorId

				const comment = {
					id: generateId(),
					postId,
					authorId,
					content,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				} satisfies ValidatedRow<typeof db.schema.comments>;

				db.tables.comments.insert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Update comment
		updateComment: defineMutation({
			input: Type.Object({
				id: Type.String(),
				content: Type.String(),
			}),
			handler: async ({ id, content }) => {
				const { status } = db.tables.comments.get(id);
				if (status !== 'valid') {
					throw new Error(`Comment ${id} not found`);
				}

				db.tables.comments.update({
					id,
					content,
					updatedAt: new Date().toISOString(),
				});

				const { row: updatedComment } = db.tables.comments.get(id);
				return Ok(updatedComment);
			},
		}),

		// Mutation: Delete comment
		deleteComment: defineMutation({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				db.tables.comments.delete(id);
				return Ok(undefined);
			},
		}),
	}),
});
