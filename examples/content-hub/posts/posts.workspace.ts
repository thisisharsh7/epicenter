import {
	date,
	defineWorkspace,
	id,
	markdownIndex,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';

const NICHES = [
	'personal',
	'epicenter',
	'y-combinator',
	'yale',
	'college-students',
	'high-school-students',
	'coding',
	'productivity',
	'ethics',
	'writing',
] as const;

/**
 * Schema for short-form video content (YouTube, Instagram, TikTok)
 */
const SHORT_FORM_VIDEO_SCHEMA = {
	id: id(),
	page_id: text(),
	title: text(),
	description: text(),
	niche: select({ options: NICHES }),
	posted_at: date(),
	updated_at: date(),
} as const;

/**
 * Schema for long-form text content (Medium, Substack, Personal Blog, Epicenter Blog)
 */
const LONG_FORM_TEXT_SCHEMA = {
	id: id(),
	page_id: text(),
	title: text(),
	subtitle: text(),
	content: text(),
	niche: select({ options: NICHES }),
	posted_at: date(),
	updated_at: date(),
} as const;

/**
 * Schema for short-form text content (Reddit, Twitter, Hacker News, Discord, Product Hunt, Bookface)
 */
const SHORT_FORM_TEXT_SCHEMA = {
	id: id(),
	page_id: text(),
	content: text(),
	title: text({ nullable: true }),
	niche: select({ options: NICHES }),
	posted_at: date(),
	updated_at: date(),
} as const;

/**
 * Posts workspace
 *
 * Consolidated workspace for all social media content across platforms.
 * Organizes content by platform type:
 * - Video: youtube, tiktok, instagram
 * - Blogs: medium, substack, personalBlog, epicenterBlog
 * - Social: reddit, twitter, discord, hackernews, producthunt, bookface
 */
export const posts = defineWorkspace({
	id: 'posts',

	schema: {
		// Video platforms
		youtube: SHORT_FORM_VIDEO_SCHEMA,
		tiktok: SHORT_FORM_VIDEO_SCHEMA,
		instagram: SHORT_FORM_VIDEO_SCHEMA,

		// Blog platforms
		medium: LONG_FORM_TEXT_SCHEMA,
		substack: LONG_FORM_TEXT_SCHEMA,
		personal_blog: LONG_FORM_TEXT_SCHEMA,
		epicenter_blog: LONG_FORM_TEXT_SCHEMA,

		// Social platforms
		reddit: SHORT_FORM_TEXT_SCHEMA,
		twitter: SHORT_FORM_TEXT_SCHEMA,
		discord: SHORT_FORM_TEXT_SCHEMA,
		hackernews: SHORT_FORM_TEXT_SCHEMA,
		producthunt: SHORT_FORM_TEXT_SCHEMA,
		bookface: SHORT_FORM_TEXT_SCHEMA,
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) => markdownIndex(c),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		...db,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
