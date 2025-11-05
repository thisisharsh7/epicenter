import { defineEpicenter } from '@epicenter/hq';

// Content repository
import { pages } from './workspaces/pages';

// Email
import { email } from './workspaces/email';

// Video platforms
import { instagram } from './workspaces/instagram';
import { tiktok } from './workspaces/tiktok';
import { youtube } from './workspaces/youtube';

// Blog platforms
import { epicenterBlog } from './workspaces/epicenter-blog';
import { medium } from './workspaces/medium';
import { personalBlog } from './workspaces/personal-blog';
import { substack } from './workspaces/substack';

// Social platforms
import { bookface } from './workspaces/bookface';
import { discord } from './workspaces/discord';
import { hackernews } from './workspaces/hackernews';
import { producthunt } from './workspaces/producthunt';
import { reddit } from './workspaces/reddit';
import { twitter } from './workspaces/twitter';

// Development
import { githubIssues } from './workspaces/github-issues';

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
