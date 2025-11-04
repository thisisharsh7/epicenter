import { defineEpicenter } from '../../src/index';

// Content repository
import { pages } from './workspaces/pages';

// Video platforms
import { youtube } from './workspaces/youtube';
import { instagram } from './workspaces/instagram';
import { tiktok } from './workspaces/tiktok';

// Blog platforms
import { medium } from './workspaces/medium';
import { substack } from './workspaces/substack';
import { personalBlog } from './workspaces/personal-blog';
import { epicenterBlog } from './workspaces/epicenter-blog';

// Social platforms
import { reddit } from './workspaces/reddit';
import { twitter } from './workspaces/twitter';
import { hackernews } from './workspaces/hackernews';
import { discord } from './workspaces/discord';
import { producthunt } from './workspaces/producthunt';
import { bookface } from './workspaces/bookface';

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
