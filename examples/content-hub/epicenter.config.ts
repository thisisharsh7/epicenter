import { defineEpicenter } from '@epicenter/hq';
import { clippings } from './clippings/clippings.workspace';
import { email } from './email/email.workspace';
import { epicenter } from './epicenter/epicenter.workspace';
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
export default defineEpicenter({
	id: 'content-hub',
	workspaces: [
		// Central content repository
		pages,

		// Personal journal entries
		journal,

		// Quick voice transcriptions
		whispering,

		// Saved web content
		clippings,

		// Email
		email,

		// Company content
		epicenter,

		// All social media posts (video, blogs, social platforms)
		posts,
	],
	storageDir: '/Users/braden/Code/EpicenterHQ',
});
