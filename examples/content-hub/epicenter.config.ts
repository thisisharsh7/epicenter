import { defineEpicenter } from '@epicenter/hq';

// Content repository
import { pages } from './pages/pages.workspace';

// Email
import { email } from './email/email.workspace';

// Video platforms
import { instagram } from './instagram/instagram.workspace';
import { tiktok } from './tiktok/tiktok.workspace';
import { youtube } from './youtube/youtube.workspace';

// Blog platforms
import { epicenterBlog } from './epicenter-blog/epicenter-blog.workspace';
import { medium } from './medium/medium.workspace';
import { personalBlog } from './personal-blog/personal-blog.workspace';
import { substack } from './substack/substack.workspace';

// Social platforms
import { bookface } from './bookface/bookface.workspace';
import { discord } from './discord/discord.workspace';
import { hackernews } from './hackernews/hackernews.workspace';
import { producthunt } from './producthunt/producthunt.workspace';
import { reddit } from './reddit/reddit.workspace';
import { twitter } from './twitter/twitter.workspace';

// Development
import { githubIssues } from './github-issues/github-issues.workspace';

/**
 * Content Hub: Production-grade Epicenter application
 *
 * Manages content distribution across 15 platforms:
 * - Video: YouTube, Instagram, TikTok
 * - Blogs: Medium, Substack, Personal Blog, Epicenter Blog
 * - Social: Reddit, Twitter, Hacker News, Discord, Product Hunt, Bookface
 * - Development: GitHub Issues
 * - Content: Pages (central repository)
 *
 * Features demonstrated:
 * - Multi-workspace architecture (15 workspaces)
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

		// Email
		email,

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
