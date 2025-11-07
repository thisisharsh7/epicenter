import { defineEpicenter } from '@epicenter/hq';
import { bookface } from './bookface/bookface.workspace';
import { clippings } from './clippings/clippings.workspace';
import { discord } from './discord/discord.workspace';
import { email } from './email/email.workspace';
import { epicenterBlog } from './epicenter-blog/epicenter-blog.workspace';
import { epicenter } from './epicenter/epicenter.workspace';
import { githubIssues } from './github-issues/github-issues.workspace';
import { hackernews } from './hackernews/hackernews.workspace';
import { instagram } from './instagram/instagram.workspace';
import { medium } from './medium/medium.workspace';
import { pages } from './pages/pages.workspace';
import { personalBlog } from './personal-blog/personal-blog.workspace';
import { producthunt } from './producthunt/producthunt.workspace';
import { reddit } from './reddit/reddit.workspace';
import { substack } from './substack/substack.workspace';
import { tiktok } from './tiktok/tiktok.workspace';
import { twitter } from './twitter/twitter.workspace';
import { youtube } from './youtube/youtube.workspace';

/**
 * Content Hub: Production-grade Epicenter application
 *
 * Manages content distribution across 16 platforms:
 * - Video: YouTube, Instagram, TikTok
 * - Blogs: Medium, Substack, Personal Blog, Epicenter Blog
 * - Social: Reddit, Twitter, Hacker News, Discord, Product Hunt, Bookface
 * - Development: GitHub Issues
 * - Content: Pages (central repository), Clippings (saved web content)
 *
 * Features demonstrated:
 * - Multi-workspace architecture (16 workspaces)
 * - Schema reuse and organization (3 shared schemas)
 * - Workspace dependencies
 * - SQLite indexes for querying
 * - Universal persistence (desktop + browser)
 * - Type-safe actions and queries
 * - CLI auto-generation
 *
 * This is the flagship example for Epicenter, demonstrating a real-world
 * content distribution system with production-grade patterns.
 */
export default defineEpicenter({
	id: 'content-hub',
	workspaces: [
		// Central content repository
		pages,

		// Saved web content
		clippings,

		// Email
		email,

		// Company content
		epicenter,

		// Video platforms
		youtube,
		instagram,
		tiktok,

		// Blog platforms
		medium,
		substack,
		personalBlog,
		epicenterBlog,

		// Social platforms
		reddit,
		twitter,
		hackernews,
		discord,
		producthunt,
		bookface,

		// Development
		githubIssues,
	],
});
