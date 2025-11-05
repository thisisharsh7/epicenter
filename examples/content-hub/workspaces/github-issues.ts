import path from 'node:path';
import {
	DateWithTimezone,
	date,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	markdownIndex,
	multiSelect,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { NICHES } from './shared/niches';

/**
 * GitHub Issues workspace
 *
 * Manages GitHub issues for projects with tracking metadata.
 * Uses a custom schema specific to issue tracking needs.
 */
export const githubIssues = defineWorkspace({
	id: 'github-issues',
	version: 1,

	schema: {
		issues: {
			id: id(),
			repository: text(),
			title: text(),
			body: text(),
			status: select({ options: ['open', 'in-progress', 'closed'] }),
			labels: multiSelect({
				options: ['bug', 'feature', 'documentation', 'enhancement', 'question'],
			}),
			niche: select({ options: NICHES }),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: ({ id, db }) =>
			markdownIndex({
				id,
				db,
				rootPath: process.env.EPICENTER_ROOT_PATH
					? path.join(process.env.EPICENTER_ROOT_PATH, id)
					: `./${id}`,
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all GitHub issues
		 */
		getIssues: defineQuery({
			handler: async () => {
				const issues = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.issues);
				return Ok(issues);
			},
		}),

		/**
		 * Get specific GitHub issue by ID
		 */
		getIssue: defineQuery({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const issues = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.issues)
					.where(eq(indexes.sqlite.issues.id, id));
				return Ok(issues[0] ?? null);
			},
		}),

		/**
		 * Create new GitHub issue
		 */
		createIssue: defineMutation({
			input: type({
				repository: 'string',
				title: 'string',
				body: 'string',
				'labels?':
					"('bug' | 'feature' | 'documentation' | 'enhancement' | 'question')[]",
				niche:
					"'personal' | 'epicenter' | 'y-combinator' | 'yale' | 'college-students' | 'high-school-students' | 'coding' | 'productivity' | 'ethics' | 'writing'",
			}),
			handler: async ({ repository, title, body, labels, niche }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: 'UTC',
				}).toJSON();
				const issue = {
					id: generateId(),
					repository,
					title,
					body,
					status: 'open' as const,
					labels: labels ?? [],
					niche,
					createdAt: now,
					updatedAt: now,
				};

				db.tables.issues.insert(issue);
				return Ok(issue);
			},
		}),

		/**
		 * Update GitHub issue
		 */
		updateIssue: defineMutation({
			input: type({
				id: 'string',
				'title?': 'string',
				'body?': 'string',
				'status?': "'open' | 'in-progress' | 'closed'",
				'labels?':
					"('bug' | 'feature' | 'documentation' | 'enhancement' | 'question')[]",
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
				db.tables.issues.update(updates);
				const { row } = await db.tables.issues.get({ id });
				return Ok(row);
			},
		}),

		/**
		 * Close GitHub issue (sets status to closed)
		 */
		closeIssue: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				db.tables.issues.update({
					id,
					status: 'closed',
					updatedAt: DateWithTimezone({
						date: new Date(),
						timezone: 'UTC',
					}).toJSON(),
				});
				const { row } = await db.tables.issues.get({ id });
				return Ok(row);
			},
		}),

		/**
		 * Get issues filtered by status
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

		pushToMarkdown: indexes.markdown.pushToMarkdown,
		pullFromMarkdown: indexes.markdown.pullFromMarkdown,
		pushToSqlite: indexes.sqlite.pushToSqlite,
		pullFromSqlite: indexes.sqlite.pullFromSqlite,
	}),
});
