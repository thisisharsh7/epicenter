import { browser } from './browser/browser.workspace';
import { clippings } from './clippings/clippings.workspace';
import { email } from './email/email.workspace';
import { epicenter } from './epicenter/epicenter.workspace';
import { gmail } from './gmail/gmail.workspace';
import { journal } from './journal/journal.workspace';
import { pages } from './pages/pages.workspace';
import { posts } from './posts/posts.workspace';
import { whispering } from './whispering/whispering.workspace';

/**
 * Content Hub: Production-grade Epicenter application
 *
 * Manages content distribution across multiple platforms:
 * - Posts: All social media content (YouTube, TikTok, Instagram, Medium, Substack, etc.)
 * - Content: Pages (central repository), Journal (personal reflections), Whispering (voice transcriptions), Clippings (saved web content)
 *
 * Features demonstrated:
 * - Multi-workspace architecture
 * - Consolidated posts workspace with multiple tables
 * - SQLite indexes for querying
 * - Universal persistence (desktop + browser)
 * - Type-safe actions and queries
 * - CLI auto-generation
 */
export default [
	pages,
	journal,
	whispering,
	clippings,
	email,
	gmail,
	epicenter,
	posts,
	browser,
] as const;
