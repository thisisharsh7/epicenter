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
	pageId: text(),
	title: text(),
	description: text(),
	niche: select({ options: NICHES }),
	postedAt: date(),
	updatedAt: date(),
} as const;

/**
 * Schema for long-form text content (Medium, Substack, Personal Blog, Epicenter Blog)
 */
const LONG_FORM_TEXT_SCHEMA = {
	id: id(),
	pageId: text(),
	title: text(),
	subtitle: text(),
	content: text(),
	niche: select({ options: NICHES }),
	postedAt: date(),
	updatedAt: date(),
} as const;

/**
 * Schema for short-form text content (Reddit, Twitter, Hacker News, Discord, Product Hunt, Bookface)
 */
const SHORT_FORM_TEXT_SCHEMA = {
	id: id(),
	pageId: text(),
	content: text(),
	title: text({ nullable: true }),
	niche: select({ options: NICHES }),
	postedAt: date(),
	updatedAt: date(),
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
		personalBlog: LONG_FORM_TEXT_SCHEMA,
		epicenterBlog: LONG_FORM_TEXT_SCHEMA,

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
		// Video platforms
		youtube: {
			getAll: db.youtube.getAll,
			get: db.youtube.get,
			create: db.youtube.insert,
			update: db.youtube.update,
			delete: db.youtube.delete,
		},
		tiktok: {
			getAll: db.tiktok.getAll,
			get: db.tiktok.get,
			create: db.tiktok.insert,
			update: db.tiktok.update,
			delete: db.tiktok.delete,
		},
		instagram: {
			getAll: db.instagram.getAll,
			get: db.instagram.get,
			create: db.instagram.insert,
			update: db.instagram.update,
			delete: db.instagram.delete,
		},

		// Blog platforms
		medium: {
			getAll: db.medium.getAll,
			get: db.medium.get,
			create: db.medium.insert,
			update: db.medium.update,
			delete: db.medium.delete,
		},
		substack: {
			getAll: db.substack.getAll,
			get: db.substack.get,
			create: db.substack.insert,
			update: db.substack.update,
			delete: db.substack.delete,
		},
		personalBlog: {
			getAll: db.personalBlog.getAll,
			get: db.personalBlog.get,
			create: db.personalBlog.insert,
			update: db.personalBlog.update,
			delete: db.personalBlog.delete,
		},
		epicenterBlog: {
			getAll: db.epicenterBlog.getAll,
			get: db.epicenterBlog.get,
			create: db.epicenterBlog.insert,
			update: db.epicenterBlog.update,
			delete: db.epicenterBlog.delete,
		},

		// Social platforms
		reddit: {
			getAll: db.reddit.getAll,
			get: db.reddit.get,
			create: db.reddit.insert,
			update: db.reddit.update,
			delete: db.reddit.delete,
		},
		twitter: {
			getAll: db.twitter.getAll,
			get: db.twitter.get,
			create: db.twitter.insert,
			update: db.twitter.update,
			delete: db.twitter.delete,
		},
		discord: {
			getAll: db.discord.getAll,
			get: db.discord.get,
			create: db.discord.insert,
			update: db.discord.update,
			delete: db.discord.delete,
		},
		hackernews: {
			getAll: db.hackernews.getAll,
			get: db.hackernews.get,
			create: db.hackernews.insert,
			update: db.hackernews.update,
			delete: db.hackernews.delete,
		},
		producthunt: {
			getAll: db.producthunt.getAll,
			get: db.producthunt.get,
			create: db.producthunt.insert,
			update: db.producthunt.update,
			delete: db.producthunt.delete,
		},
		bookface: {
			getAll: db.bookface.getAll,
			get: db.bookface.get,
			create: db.bookface.insert,
			update: db.bookface.update,
			delete: db.bookface.delete,
		},

		// Index operations
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
