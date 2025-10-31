import { id, text, select, date } from '../../../src/index';
import { NICHES } from './niches';

/**
 * Schema for short-form video content (YouTube, Instagram, TikTok)
 *
 * Fields:
 * - id: Unique identifier (auto-generated)
 * - pageId: Reference to the page/channel where posted
 * - title: Video title
 * - description: Video description/caption
 * - niche: Content category (single selection)
 * - postedAt: Publication timestamp
 * - updatedAt: Last modification timestamp
 */
export const SHORT_FORM_VIDEO_SCHEMA = {
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
 *
 * Fields:
 * - id: Unique identifier
 * - pageId: Reference to the blog/publication
 * - title: Article title
 * - subtitle: Article subtitle/description
 * - content: Full article content
 * - niche: Content category (single selection)
 * - postedAt: Publication timestamp
 * - updatedAt: Last modification timestamp
 */
export const LONG_FORM_TEXT_SCHEMA = {
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
 *
 * Fields:
 * - id: Unique identifier
 * - pageId: Reference to the platform page/account
 * - content: Post content (main text)
 * - title: Optional title (some platforms have titles, others don't)
 * - niche: Content category (single selection)
 * - postedAt: Publication timestamp
 * - updatedAt: Last modification timestamp
 */
export const SHORT_FORM_TEXT_SCHEMA = {
	id: id(),
	pageId: text(),
	content: text(),
	title: text({ nullable: true }),
	niche: select({ options: NICHES }),
	postedAt: date(),
	updatedAt: date(),
} as const;
