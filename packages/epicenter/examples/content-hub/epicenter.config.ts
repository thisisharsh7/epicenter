import { defineEpicenter } from '../../src/index';

// Content repository
import { pages } from './pages/workspace.config';

// Video platforms
import { youtube } from './youtube/workspace.config';
import { instagram } from './instagram/workspace.config';
import { tiktok } from './tiktok/workspace.config';

// Blog platforms
import { medium } from './medium/workspace.config';
import { substack } from './substack/workspace.config';
import { personalBlog } from './personal-blog/workspace.config';
import { epicenterBlog } from './epicenter-blog/workspace.config';

// Social platforms
import { reddit } from './reddit/workspace.config';
import { twitter } from './twitter/workspace.config';
import { hackernews } from './hackernews/workspace.config';
import { discord } from './discord/workspace.config';
import { producthunt } from './producthunt/workspace.config';
import { bookface } from './bookface/workspace.config';

// Development
import { githubIssues } from './github-issues/workspace.config';

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
