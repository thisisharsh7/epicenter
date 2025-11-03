import { defineEpicenter } from '../../src/index';

// Content repository
import { pages } from './workspace.pages';

// Video platforms
import { youtube } from './workspace.youtube';
import { instagram } from './workspace.instagram';
import { tiktok } from './workspace.tiktok';

// Blog platforms
import { medium } from './workspace.medium';
import { substack } from './workspace.substack';
import { personalBlog } from './workspace.personal-blog';
import { epicenterBlog } from './workspace.epicenter-blog';

// Social platforms
import { reddit } from './workspace.reddit';
import { twitter } from './workspace.twitter';
import { hackernews } from './workspace.hackernews';
import { discord } from './workspace.discord';
import { producthunt } from './workspace.producthunt';
import { bookface } from './workspace.bookface';

// Development
import { githubIssues } from './workspace.github-issues';

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
