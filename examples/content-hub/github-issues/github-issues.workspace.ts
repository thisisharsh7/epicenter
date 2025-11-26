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

	exports: ({ db, indexes }) => ({
		...db.issues,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,

		/** Filter issues by status */
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

		/** Filter issues by repository */
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
	}),
});
