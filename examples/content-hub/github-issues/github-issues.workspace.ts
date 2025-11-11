import {
	date,
	defineQuery,
	defineWorkspace,
	eq,
	id,
	markdownIndex,
	tags,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { NICHES } from '../shared/niches';

/**
 * GitHub Issues workspace
 *
 * Manages GitHub issues for projects with tracking metadata.
 * Uses a custom schema specific to issue tracking needs.
 */
export const githubIssues = defineWorkspace({
	id: 'github-issues',

	schema: {
		issues: {
			id: id(),
			repository: text(),
			title: text(),
			body: text(),
			status: select({ options: ['open', 'in-progress', 'closed'] }),
			labels: tags({
				options: ['bug', 'feature', 'documentation', 'enhancement', 'question'],
			}),
			niche: select({ options: NICHES }),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) => markdownIndex(c),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all GitHub issues
		 *
		 * Using the table helper directly: `db.tables.issues.getAll` is already a Query<>.
		 * We don't need to wrap it with `defineQuery()` because the table helper provides
		 * all the type information and behavior Epicenter needs.
		 */
		getIssues: db.tables.issues.getAll,

		/**
		 * Get a specific GitHub issue by ID
		 *
		 * Table helper approach: `db.tables.issues.get` is pre-typed as
		 * Query<{ id: string }, IssueRow | null>. Direct assignment works.
		 */
		getIssue: db.tables.issues.get,

		/**
		 * Create a new GitHub issue
		 *
		 * Why can we use `db.tables.issues.insert` directly?
		 *
		 * Because:
		 * 1. The table helper is already a Mutation<void, RowAlreadyExistsError>
		 * 2. Our schema validates that all required fields are present
		 * 3. The caller is responsible for providing ID, createdAt, updatedAt, etc.
		 *
		 * This is the "lean" approach. If we needed to:
		 * - Auto-generate IDs
		 * - Auto-set timestamps (createdAt, updatedAt)
		 * - Validate business rules
		 *
		 * ...we would write a custom mutation. But for straightforward inserts, the
		 * table helper is perfect.
		 */
		createIssue: db.tables.issues.insert,

		/**
		 * Update a GitHub issue
		 *
		 * Using the table helper: `db.tables.issues.update` handles partial updates.
		 * It takes an object with an `id` and any fields to update, then merges it
		 * with the existing row.
		 *
		 * NOTE: Unlike custom mutations, this doesn't auto-update `updatedAt`. If you
		 * need that behavior, write a custom mutation wrapper.
		 */
		updateIssue: db.tables.issues.update,

		/**
		 * Get issues filtered by status
		 *
		 * CUSTOM query - we keep `defineQuery()` here because we're doing something
		 * beyond basic CRUD: using SQL to filter by the status field.
		 *
		 * This demonstrates the pattern:
		 * - Table helpers for CRUD operations
		 * - defineQuery/defineMutation for custom logic (filtering, joining, etc.)
		 */
		getIssuesByStatus: defineQuery({
			input: type({
				status: "'open' | 'in-progress' | 'closed'",
			}),
			handler: async ({ status }) => {
				const issues = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.issues)
					.where(eq(indexes.sqlite.issues.status, status));
				return Ok(issues);
			},
		}),

		/**
		 * Get issues filtered by repository
		 *
		 * CUSTOM query - same reasoning as getIssuesByStatus. We need custom logic to
		 * filter by the repository field, so we use `defineQuery()`.
		 */
		getIssuesByRepository: defineQuery({
			input: type({
				repository: 'string',
			}),
			handler: async ({ repository }) => {
				const issues = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.issues)
					.where(eq(indexes.sqlite.issues.repository, repository));
				return Ok(issues);
			},
		}),

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
