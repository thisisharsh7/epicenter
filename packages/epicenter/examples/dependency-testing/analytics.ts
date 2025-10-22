import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineWorkspace,
	id,
	text,
	integer,
	date,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	eq,
	type Row,
} from '../../src/index';
import { users } from './users';
import { posts } from './posts';
import { comments } from './comments';

/**
 * Analytics workspace (Multiple Dependencies)
 * Depends on: users, posts, comments
 *
 * This workspace demonstrates:
 * - Multiple dependencies in a single workspace
 * - Type-safe access to ALL dependency actions
 * - Cross-workspace aggregation and analytics
 * - Full autocomplete for all three workspaces
 */
export const analytics = defineWorkspace({
	id: 'analytics',
	version: 1,
	name: 'analytics',

	// Multiple dependencies: all three workspaces
	dependencies: [users, posts, comments],

	schema: {
		userStats: {
			id: id(),
			userId: text(),
			totalPosts: integer({ default: 0 }),
			totalComments: integer({ default: 0 }),
			lastActivityAt: date(),
		},
		postStats: {
			id: id(),
			postId: text(),
			totalComments: integer({ default: 0 }),
			lastCommentAt: date({ nullable: true }),
		},
	},

	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: 'analytics.db' }),
	}),

	// NOTE: workspaces has ALL three dependencies with full type safety
	// ✅ workspaces.users - all user actions
	// ✅ workspaces.posts - all post actions
	// ✅ workspaces.comments - all comment actions
	actions: ({ db, indexes, workspaces }) => ({
		// Query: Get user statistics
		// Demonstrates accessing multiple dependencies
		getUserStats: defineQuery({
			input: Type.Object({
				userId: Type.String(),
			}),
			handler: async ({ userId }) => {
				// ✅ Access users workspace
				const userResult = await workspaces.users.getUser({ id: userId });
				if (!userResult.data) {
					throw new Error(`User ${userId} not found`);
				}

				// ✅ Access posts workspace
				const postsResult = await workspaces.posts.getPostsByAuthor({
					authorId: userId,
				});
				const totalPosts = postsResult.data?.length ?? 0;

				// ✅ Access comments workspace
				const commentsResult = await workspaces.comments.getCommentsByAuthor({
					authorId: userId,
				});
				const totalComments = commentsResult.data?.length ?? 0;

				return Ok({
					user: userResult.data,
					totalPosts,
					totalComments,
					posts: postsResult.data,
					comments: commentsResult.data,
				});
			},
		}),

		// Query: Get post statistics
		// Demonstrates aggregating data from multiple workspaces
		getPostStats: defineQuery({
			input: Type.Object({
				postId: Type.String(),
			}),
			handler: async ({ postId }) => {
				// ✅ Access posts workspace (with author details)
				const postResult = await workspaces.posts.getPostWithAuthor({ id: postId });
				if (!postResult.data) {
					throw new Error(`Post ${postId} not found`);
				}

				// ✅ Access comments workspace
				const commentsResult = await workspaces.comments.getCommentsByPost({
					postId,
				});
				const totalComments = commentsResult.data?.length ?? 0;

				// Could also access users workspace to get commenter details
				// ✅ workspaces.users.getUser({ id: comment.authorId })

				return Ok({
					post: postResult.data,
					totalComments,
					comments: commentsResult.data,
				});
			},
		}),

		// Query: Get comprehensive analytics for all users
		getAllUserStats: defineQuery({
			handler: async () => {
				// ✅ Get all users
				const usersResult = await workspaces.users.getAllUsers();
				const users = usersResult.data ?? [];

				// ✅ Get all posts
				const postsResult = await workspaces.posts.getAllPosts();
				const allPosts = postsResult.data ?? [];

				// ✅ Get all comments
				const commentsResult = await workspaces.comments.getAllComments();
				const allComments = commentsResult.data ?? [];

				// Aggregate stats per user
				const stats = users.map((user) => {
					const userPosts = allPosts.filter((p) => p.authorId === user.id);
					const userComments = allComments.filter((c) => c.authorId === user.id);

					return {
						user,
						totalPosts: userPosts.length,
						totalComments: userComments.length,
					};
				});

				return Ok(stats);
			},
		}),

		// Query: Get top content creators
		// Demonstrates complex cross-workspace analytics
		getTopContentCreators: defineQuery({
			input: Type.Object({
				limit: Type.Number(),
			}),
			handler: async ({ limit }) => {
				// ✅ Access all three workspaces
				const usersResult = await workspaces.users.getUsersByRole({
					role: 'author',
				});
				const authors = usersResult.data ?? [];

				const postsResult = await workspaces.posts.getAllPosts();
				const allPosts = postsResult.data ?? [];

				const commentsResult = await workspaces.comments.getAllComments();
				const allComments = commentsResult.data ?? [];

				// Calculate engagement score
				const authorStats = authors.map((author) => {
					const authorPosts = allPosts.filter((p) => p.authorId === author.id);
					const authorComments = allComments.filter((c) => c.authorId === author.id);

					// Simple engagement score: posts * 10 + comments * 1
					const engagementScore = authorPosts.length * 10 + authorComments.length;

					return {
						author,
						totalPosts: authorPosts.length,
						totalComments: authorComments.length,
						engagementScore,
					};
				});

				// Sort by engagement and limit
				const topCreators = authorStats
					.sort((a, b) => b.engagementScore - a.engagementScore)
					.slice(0, limit);

				return Ok(topCreators);
			},
		}),

		// Mutation: Update user stats (cached analytics)
		updateUserStats: defineMutation({
			input: Type.Object({
				userId: Type.String(),
			}),
			handler: async ({ userId }) => {
				// ✅ Fetch fresh data from all dependencies
				const postsResult = await workspaces.posts.getPostsByAuthor({
					authorId: userId,
				});
				const commentsResult = await workspaces.comments.getCommentsByAuthor({
					authorId: userId,
				});

				const totalPosts = postsResult.data?.length ?? 0;
				const totalComments = commentsResult.data?.length ?? 0;

				// Check if stats exist
				const existingStats = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.userStats)
					.where(eq(indexes.sqlite.userStats.userId, userId));

				if (existingStats) {
					// Update existing
					db.tables.userStats.update({
						id: existingStats.id,
						totalPosts,
						totalComments,
						lastActivityAt: new Date().toISOString(),
					});
					const { row } = db.tables.userStats.get(existingStats.id);
					return Ok(row);
				}

				// Create new stats
				const stats = {
					id: generateId(),
					userId,
					totalPosts,
					totalComments,
					lastActivityAt: new Date().toISOString(),
				} satisfies Row<typeof db.schema.userStats>;

				db.tables.userStats.insert(stats);
				return Ok(stats);
			},
		}),

		// Mutation: Update post stats
		updatePostStats: defineMutation({
			input: Type.Object({
				postId: Type.String(),
			}),
			handler: async ({ postId }) => {
				// ✅ Access comments workspace
				const commentsResult = await workspaces.comments.getCommentsByPost({
					postId,
				});
				const comments = commentsResult.data ?? [];
				const totalComments = comments.length;

				// Find latest comment
				const lastCommentAt =
					comments.length > 0
						? comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
								.createdAt
						: null;

				// Check if stats exist
				const existingStats = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.postStats)
					.where(eq(indexes.sqlite.postStats.postId, postId));

				if (existingStats) {
					// Update existing
					db.tables.postStats.update({
						id: existingStats.id,
						totalComments,
						lastCommentAt,
					});
					const { row } = db.tables.postStats.get(existingStats.id);
					return Ok(row);
				}

				// Create new stats
				const stats = {
					id: generateId(),
					postId,
					totalComments,
					lastCommentAt,
				} satisfies Row<typeof db.schema.postStats>;

				db.tables.postStats.insert(stats);
				return Ok(stats);
			},
		}),
	}),
});
