import type {
	SQLiteColumnBuilderBase,
	SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import type { Id } from './columns';

/**
 * Table schema definitions for a plugin
 * First level: table names (e.g., "posts", "comments")
 * Second level: column names (e.g., "id", "title", "createdAt")
 * Values: SQLite column builder definitions
 * @example
 * {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     createdAt: date()
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text()
 *   }
 * }
 */
type TableSchemaDefinitions = Record<
	string,
	Record<string, SQLiteColumnBuilderBase>
>;

/**
 * Helper type to check if a table has at least one ID column
 */
type HasIdColumn<TColumns extends Record<string, SQLiteColumnBuilderBase>> = {
	[K in keyof TColumns]: TColumns[K]['_']['data'] extends Id ? true : never;
}[keyof TColumns] extends never
	? false
	: true;

/**
 * Helper type to ensure all tables have at least one ID column
 */
type TablesWithId<TTables extends TableSchemaDefinitions> = {
	[K in keyof TTables]: HasIdColumn<TTables[K]> extends true
		? TTables[K]
		: never;
} extends TableSchemaDefinitions
	? TTables
	: never;

/**
 * Helper type to convert column builders to SQLite tables
 */
type ExtractDrizzleTables<TTables extends TableSchemaDefinitions> = {
	[K in keyof TTables]: SQLiteTable;
};

/**
 * Helper type to extract methods from plugin dependencies
 */
type ExtractPluginMethods<TDeps extends readonly AnyPlugin[]> = {
	[K in TDeps[number]['id']]: TDeps[number] extends { id: K }
		? ReturnType<TDeps[number]['methods']>
		: never;
};

/**
 * Vault context passed to plugin methods
 */
type VaultContext<
	TTables extends Record<string, SQLiteTable>,
	TPlugins extends Record<string, any> = {},
> = {
	[K in keyof TTables]: any; // TableContext will be defined in vault.ts
} & {
	plugins: TPlugins;
};

/**
 * Base plugin type for dependencies
 */
export type AnyPlugin = {
	id: string;
	dependencies?: readonly AnyPlugin[];
	tables: TablesWithId<TableSchemaDefinitions>;
	methods: (vault: any) => Record<string, any>;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Plugin definition
 */
export type Plugin<
	TId extends string = string,
	TTables extends
		TablesWithId<TableSchemaDefinitions> = TablesWithId<TableSchemaDefinitions>,
	TMethods extends Record<string, any> = {},
	TDeps extends readonly AnyPlugin[] = readonly [],
> = {
	id: TId;
	dependencies?: TDeps;
	tables: TTables;
	methods: (
		vault: VaultContext<
			ExtractDrizzleTables<TTables>,
			ExtractPluginMethods<TDeps>
		>,
	) => TMethods;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

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
	TTables extends TableSchemaDefinitions,
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
