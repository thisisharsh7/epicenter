import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core';
import type { AnyPlugin, Plugin } from '../types/plugin';

/**
 * Define a vault plugin with type safety
 *
 * @example
 * ```typescript
 * // Posts plugin can depend on comments
 * const postsPlugin = definePlugin({
 *   id: 'posts',
 *   dependencies: [commentsPlugin], // OK even if comments depends on posts!
 *   tables: {
 *     posts: {
 *       id: id(),                  // Auto-generates nanoid, always primary key
 *       title: text(),              // NOT NULL by default
 *       author: text(),
 *       score: integer()
 *     }
 *   },
 *   methods: (vault) => ({
 *     async getTopPosts(limit = 10) {
 *       return vault.posts.select()
 *         .orderBy(desc(vault.posts.score))
 *         .limit(limit);
 *     },
 *     async getPostWithComments(postId: string) {
 *       const post = await vault.posts.findById(postId);
 *       // Can safely call comments methods even with circular dependency
 *       const comments = await vault.plugins.comments.getCommentsForPost(postId);
 *       return { ...post, comments };
 *     }
 *   })
 * });
 *
 * // Comments plugin can also depend on posts - circular dependency!
 * const commentsPlugin = definePlugin({
 *   id: 'comments',
 *   dependencies: [postsPlugin], // Circular dependency works!
 *   tables: {
 *     comments: {
 *       id: id(),
 *       postId: text(),
 *       author: text(),
 *       content: text(),
 *       createdAt: date()
 *     }
 *   },
 *   methods: (vault) => ({
 *     async getCommentsForPost(postId: string) {
 *       // Can access posts table safely
 *       const post = await vault.posts.findById(postId);
 *       if (!post) return [];
 *
 *       return vault.comments.select()
 *         .where(eq(vault.comments.postId, postId))
 *         .orderBy(desc(vault.comments.createdAt))
 *         .all();
 *     },
 *     async getCommentsForTopPosts() {
 *       // Can call posts plugin methods
 *       const topPosts = await vault.plugins.posts.getTopPosts();
 *       // ... fetch comments for those posts
 *     }
 *   })
 * });
 * ```
 */
export function definePlugin<
	TId extends string,
	TTables extends Record<string, Record<string, SQLiteColumnBuilderBase>>,
	TMethods extends Record<string, any>,
	TDeps extends readonly AnyPlugin[] = readonly [],
>(
	plugin: Plugin<TId, TTables, TMethods, TDeps>,
): Plugin<TId, TTables, TMethods, TDeps> {
	// Validate plugin ID (alphanumeric, lowercase, no spaces)
	if (!/^[a-z0-9_-]+$/.test(plugin.id)) {
		throw new Error(
			`Invalid plugin ID "${plugin.id}". Plugin IDs must be lowercase, alphanumeric, and may contain underscores or hyphens.`,
		);
	}

	// Validate dependencies are plugin objects with IDs
	if (plugin.dependencies) {
		for (const dep of plugin.dependencies) {
			if (!dep || typeof dep !== 'object' || !dep.id) {
				throw new Error(
					`Invalid dependency in plugin "${plugin.id}": dependencies must be plugin objects`,
				);
			}
		}
	}

	// Return the plugin as-is (it's already properly typed)
	return plugin;
}

/**
 * Create a plugin factory function for plugins that need configuration
 *
 * @example
 * ```typescript
 * const createRedditPlugin = definePluginFactory((config: { apiKey: string }) => ({
 *   id: 'reddit',
 *   dependencies: [authPlugin],
 *   tables: { ... },
 *   methods: (vault) => ({
 *     async fetchFromAPI() {
 *       // Use config.apiKey here
 *     }
 *   })
 * }));
 *
 * // Usage
 * const redditPlugin = createRedditPlugin({ apiKey: 'xxx' });
 * ```
 */
export function definePluginFactory<
	TConfig,
	TId extends string,
	TTables extends Record<string, Record<string, SQLiteColumnBuilderBase>>,
	TMethods extends Record<string, any>,
	TDeps extends readonly AnyPlugin[] = readonly [],
>(
	factory: (config: TConfig) => Plugin<TId, TTables, TMethods, TDeps>,
): (config: TConfig) => Plugin<TId, TTables, TMethods, TDeps> {
	return (config: TConfig) => {
		const plugin = factory(config);
		return definePlugin(plugin);
	};
}

/**
 * Helper type to extract the ID from a plugin
 */
export type PluginId<T> = T extends Plugin<infer Id, any, any, any>
	? Id
	: never;

/**
 * Helper type to extract the tables from a plugin
 */
export type PluginTables<T> = T extends Plugin<any, infer Tables, any, any>
	? Tables
	: never;

/**
 * Helper type to extract the methods from a plugin
 */
export type PluginMethods<T> = T extends Plugin<any, any, infer Methods, any>
	? Methods
	: never;

/**
 * Helper type to extract dependencies from a plugin
 */
export type PluginDeps<T> = T extends Plugin<any, any, any, infer Deps>
	? Deps
	: never;
