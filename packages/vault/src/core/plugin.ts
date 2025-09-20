import type {
	SQLiteColumnBuilderBase,
	SQLiteTable,
	SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { BuildColumns } from 'drizzle-orm/column-builder';
import type { Result } from 'wellcrafted/result';
import type { id } from './columns';
import type { VaultOperationError } from './errors';
import type { TableSelectBuilder } from '../types/drizzle-helpers';
import type { PluginMethod } from './method-helpers';

/**
 * Define a vault plugin with full type safety and IntelliSense support.
 *
 * This function validates plugin configuration and provides TypeScript inference
 * for the vault context passed to plugin methods.
 *
 * ## Key Concepts
 *
 * ### Plugin Namespacing
 * Each plugin gets its own namespace in the vault context:
 * - Tables: `vault.[pluginId].[tableName]`
 * - Methods: `vault.[pluginId].[methodName]()`
 *
 * ### Table Helper Methods
 * Every table automatically gets these helper methods:
 * - `getById(id)` - Get a single record by ID
 * - `create(data)` - Create a new record
 * - `update(id, data)` - Update an existing record
 * - `delete(id)` - Delete a record
 * - `select()` - Access Drizzle query builder for complex queries
 * - And more...
 *
 * ### Dependency Management
 * Plugins can depend on other plugins to access their tables and methods.
 * The vault uses a two-phase initialization:
 * 1. First phase: All tables are created
 * 2. Second phase: All methods are initialized with access to dependency tables
 *
 * @param plugin - The plugin configuration object
 * @returns The same plugin object with validated configuration
 *
 * @example
 * ```typescript
 * // Example: Blog system with plugin dependencies
 *
 * // Posts plugin can depend on comments
 * const postsPlugin = definePlugin({
 *   id: 'posts',
 *   dependencies: [commentsPlugin], // Depend on comments plugin
 *
 *   tables: {
 *     posts: {
 *       id: id(),                  // Required: auto-generated ID
 *       title: text(),             // String column
 *       author: text(),
 *       score: integer(),          // Number column
 *       publishedAt: date({ nullable: true }) // Optional date
 *     }
 *   },
 *
 *   methods: (vault) => ({
 *     // Access own tables via vault.posts.posts
 *     async getTopPosts(limit = 10) {
 *       return vault.posts.posts
 *         .select()
 *         .orderBy(desc(vault.posts.posts.score))
 *         .limit(limit)
 *         .all();
 *     },
 *
 *     // Use table helper methods
 *     async getPostById(postId: string) {
 *       return vault.posts.posts.getById(postId);
 *     },
 *
 *     // Access dependency plugins
 *     async getPostWithComments(postId: string) {
 *       const post = await vault.posts.posts.getById(postId);
 *       if (!post) return null;
 *
 *       // Call methods from the comments plugin
 *       const comments = await vault.comments.getCommentsForPost(postId);
 *       return { ...post, comments };
 *     },
 *
 *     // Create new records with helper methods
 *     async createPost(title: string, author: string) {
 *       return vault.posts.posts.create({
 *         id: generateId(), // You provide the ID
 *         title,
 *         author,
 *         score: 0,
 *         publishedAt: null
 *       });
 *     }
 *   })
 * });
 *
 * // Comments plugin for handling blog comments
 * const commentsPlugin = definePlugin({
 *   id: 'comments',
 *   dependencies: [], // Can add dependencies as needed
 *
 *   tables: {
 *     comments: {
 *       id: id(),
 *       postId: text(),            // Foreign key to posts
 *       author: text(),
 *       content: text(),
 *       createdAt: date()
 *     }
 *   },
 *
 *   methods: (vault) => ({
 *     // Access dependency's tables
 *     async getCommentsForPost(postId: string) {
 *       // Can access posts table from the posts plugin
 *       const post = await vault.posts.posts.getById(postId);
 *       if (!post) return [];
 *
 *       // Use own tables with query builder
 *       return vault.comments.comments
 *         .select()
 *         .where(eq(vault.comments.comments.postId, postId))
 *         .orderBy(desc(vault.comments.comments.createdAt))
 *         .all();
 *     },
 *
 *     // Call dependency's methods
 *     async getCommentsForTopPosts() {
 *       // Call posts plugin method
 *       const topPosts = await vault.posts.getTopPosts();
 *
 *       // Fetch comments for all top posts
 *       const allComments = [];
 *       for (const post of topPosts) {
 *         const comments = await this.getCommentsForPost(post.id);
 *         allComments.push(...comments);
 *       }
 *       return allComments;
 *     },
 *
 *     // Use table helper methods
 *     async createComment(postId: string, author: string, content: string) {
 *       return vault.comments.comments.create({
 *         id: generateId(),
 *         postId,
 *         author,
 *         content,
 *         createdAt: new Date()
 *       });
 *     }
 *   })
 * });
 * ```
 *
 * @throws {Error} If plugin ID contains invalid characters (must be lowercase alphanumeric with optional hyphens/underscores)
 * @throws {Error} If any dependency is not a valid plugin object
 */
export function definePlugin<
	TId extends string,
	TTableMap extends TableMap,
	TMethods extends Record<string, PluginMethod>,
	TDeps extends readonly Plugin[] = readonly [],
>(
	plugin: Plugin<TId, TTableMap, TMethods, TDeps>,
): Plugin<TId, TTableMap, TMethods, TDeps> {
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
 * Plugin definition with strongly typed vault context.
 *
 * @template TId - Unique plugin identifier (lowercase, alphanumeric)
 * @template TTableMap - Table definitions for this plugin
 * @template TMethods - Methods exposed by this plugin (must be functions)
 * @template TDeps - Other plugins this plugin depends on
 *
 * Key features:
 * - **Namespaced access**: Each plugin gets its own namespace in the vault
 * - **Dependency management**: Plugins can depend on other plugins for composition
 * - **Type safety**: Full TypeScript inference for tables and methods
 * - **Helper methods**: Every table gets CRUD helpers automatically
 *
 * @example
 * ```typescript
 * const blogPlugin = definePlugin({
 *   id: 'blog',
 *   dependencies: [usersPlugin], // Can depend on other plugins
 *
 *   tables: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       authorId: text(),
 *       content: text({ nullable: true }),
 *       publishedAt: date({ nullable: true })
 *     },
 *     tags: {
 *       id: id(),
 *       name: text(),
 *       postId: text()
 *     }
 *   },
 *
 *   methods: (vault) => ({
 *     // Access own tables via vault.blog.posts, vault.blog.tags
 *     async getPublishedPosts() {
 *       return vault.blog.posts
 *         .select()
 *         .where(isNotNull(vault.blog.posts.publishedAt))
 *         .orderBy(desc(vault.blog.posts.publishedAt))
 *         .all();
 *     },
 *
 *     // Access dependency plugins via vault.users
 *     async getPostsByAuthor(authorId: string) {
 *       const author = await vault.users.users.getById(authorId);
 *       if (!author) return [];
 *
 *       return vault.blog.posts
 *         .select()
 *         .where(eq(vault.blog.posts.authorId, authorId))
 *         .all();
 *     },
 *
 *     // Use table helper methods
 *     async createPost(data: PostInput) {
 *       return vault.blog.posts.create({
 *         id: generateId(),
 *         ...data
 *       });
 *     }
 *   })
 * });
 * ```
 */
export type Plugin<
	TId extends string = string,
	TTableMap extends TableMap = TableMap,
	TMethods extends Record<string, PluginMethod> = Record<string, PluginMethod>,
	TDeps extends readonly Plugin[] = readonly [],
> = {
	id: TId;
	dependencies?: TDeps;
	tables: TTableMap;
	methods: (vault: VaultContext<TId, TTableMap, TDeps>) => TMethods;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Helper methods automatically added to every table in the vault.
 *
 * These methods provide a high-level API for common database operations,
 * handling both SQLite storage and markdown file synchronization. All methods
 * return Result types for explicit error handling.
 *
 * @template T - The SQLite table type from Drizzle ORM
 *
 * @example
 * ```typescript
 * // Every table gets these methods automatically:
 * const post = await vault.posts.posts.getById('abc123');
 * const allPosts = await vault.posts.posts.getAll();
 * const created = await vault.posts.posts.create({ id: 'xyz', title: 'Hello' });
 * const updated = await vault.posts.posts.update('abc123', { title: 'Updated' });
 * const deleted = await vault.posts.posts.delete('abc123');
 *
 * // Plus access to Drizzle query builder:
 * const published = await vault.posts.posts
 *   .select()
 *   .where(isNotNull(vault.posts.posts.publishedAt))
 *   .all();
 * ```
 */
export type TableHelpers<T extends SQLiteTable> = {
	// Fast read operations (from SQLite)
	getById(
		id: string,
	): Promise<Result<InferSelectModel<T> | null, VaultOperationError>>;
	findById(
		id: string,
	): Promise<Result<InferSelectModel<T> | null, VaultOperationError>>; // Alias for getById
	get(
		id: string,
	): Promise<Result<InferSelectModel<T> | null, VaultOperationError>>;
	get(
		ids: string[],
	): Promise<Result<InferSelectModel<T>[], VaultOperationError>>;
	getAll(): Promise<Result<InferSelectModel<T>[], VaultOperationError>>;
	count(): Promise<Result<number, VaultOperationError>>;

	// Write operations (sync to both SQLite and markdown)
	create(
		data: InferInsertModel<T> & { id: string },
	): Promise<Result<InferSelectModel<T>, VaultOperationError>>;
	create(
		data: (InferInsertModel<T> & { id: string })[],
	): Promise<Result<InferSelectModel<T>[], VaultOperationError>>;
	update(
		id: string,
		data: Partial<InferInsertModel<T>>,
	): Promise<Result<InferSelectModel<T> | null, VaultOperationError>>;
	delete(id: string): Promise<Result<boolean, VaultOperationError>>;
	delete(ids: string[]): Promise<Result<boolean, VaultOperationError>>;
	upsert(
		data: InferInsertModel<T> & { id: string },
	): Promise<Result<InferSelectModel<T>, VaultOperationError>>;

	// Drizzle query builder for advanced queries
	select(): TableSelectBuilder<T>;
};

/**
 * The vault context passed to plugin methods.
 *
 * This context provides namespaced access to:
 * - **Own tables**: Via `vault.[pluginId].[tableName]` with full column access and helper methods
 * - **Own methods**: Will be available at `vault.[pluginId].[methodName]()` after initialization
 * - **Dependency plugins**: Complete access to their tables and methods
 *
 * @template TSelfId - The current plugin's ID
 * @template TTableMap - The current plugin's table definitions (column builders)
 * @template TDeps - The plugin's dependencies
 *
 * @example
 * ```typescript
 * // In a plugin with id 'posts' that depends on 'comments':
 * methods: (vault) => ({
 *   async getPostWithComments(postId: string) {
 *     // Access own tables with full column types
 *     const post = await vault.posts.posts.getById(postId);
 *
 *     // Use columns in Drizzle operations
 *     const published = await vault.posts.posts
 *       .select()
 *       .where(eq(vault.posts.posts.publishedAt, new Date()))
 *       .all();
 *
 *     // Access dependency methods
 *     const comments = await vault.comments.getCommentsForPost(postId);
 *
 *     return { ...post, comments };
 *   }
 * })
 * ```
 *
 * The tables in the vault context are "enhanced" - they work as both:
 * 1. **Drizzle tables**: Access columns for queries `table.columnName`
 * 2. **Helper objects**: Call CRUD methods like `table.getById()`
 */
type VaultContext<
	TSelfId extends string,
	TTableMap extends TableMap,
	TDeps extends readonly Plugin[] = readonly [],
> = BuildDependencyNamespaces<TDeps> & {
	// The current plugin's tables are added to its namespace
	// These are properly typed with all column information preserved
	[K in TSelfId]: BuildEnhancedTables<TTableMap>;
};

/**
 * Builds namespaces for all dependency plugins.
 *
 * Creates a mapping from plugin IDs to their complete namespaces (tables + methods).
 * This type is used to provide typed access to all dependency plugins within
 * a plugin's vault context.
 *
 * @template TDeps - Array of dependency plugins
 *
 * @example
 * ```typescript
 * // With dependencies: [usersPlugin, commentsPlugin]
 * type DependencyNamespaces = BuildDependencyNamespaces<[UsersPlugin, CommentsPlugin]>;
 * // Result: {
 * //   users: {
 * //     users: EnhancedUsersTable;      // users plugin's table
 * //     getUserById(id): Promise<User>; // users plugin's method
 * //   },
 * //   comments: {
 * //     comments: EnhancedCommentsTable;           // comments plugin's table
 * //     getCommentsForPost(id): Promise<Comment[]>; // comments plugin's method
 * //   }
 * // }
 *
 * // In vault context, accessed as:
 * vault.users.users.getById('123');
 * vault.comments.getCommentsForPost('456');
 * ```
 */
type BuildDependencyNamespaces<TDeps extends readonly Plugin[]> = {
	[K in TDeps[number]['id']]: TDeps[number] extends { id: K }
		? BuildPluginNamespace<TDeps[number]>
		: never;
};

/**
 * Builds the complete namespace for a single plugin (tables + methods).
 *
 * Combines the plugin's enhanced tables with its custom methods into a single
 * namespace. This is what gets mounted at `vault.[pluginId]` in the vault context.
 *
 * @template TPlugin - A plugin conforming to the Plugin type
 *
 * @example
 * ```typescript
 * // For a blog plugin:
 * type BlogNamespace = BuildPluginNamespace<BlogPlugin>;
 * // Result: {
 * //   // Tables (enhanced with helpers)
 * //   posts: EnhancedPostsTable;
 * //   comments: EnhancedCommentsTable;
 * //
 * //   // Custom methods
 * //   getPublishedPosts(): Promise<Post[]>;
 * //   getPostsByAuthor(authorId: string): Promise<Post[]>;
 * // }
 *
 * // Accessed in vault as:
 * vault.blog.posts.getById('123');        // table helper
 * vault.blog.getPublishedPosts();         // custom method
 * ```
 */
type BuildPluginNamespace<TPlugin extends Plugin> = BuildEnhancedTables<
	TPlugin['tables']
> &
	ReturnType<TPlugin['methods']>;

/**
 * Builds enhanced Drizzle tables from plugin table definitions.
 *
 * This type transformation pipeline:
 * 1. Takes simple column definitions from TableMap
 * 2. Converts each to a properly typed SQLite table using SQLiteTableType
 * 3. Enhances each table with CRUD helper methods by adding TableHelpers
 *
 * The result is a set of tables that can be used both for Drizzle queries
 * (accessing columns) and high-level operations (calling helper methods),
 * with complete type safety and IntelliSense support.
 *
 * @template TTableMap - The table schema definitions from a plugin
 *
 * @example
 * ```typescript
 * // Input: Plugin table definitions
 * type BlogTables = {
 *   posts: { id: ReturnType<typeof id>; title: ReturnType<typeof text>; };
 *   comments: { id: ReturnType<typeof id>; content: ReturnType<typeof text>; };
 * }
 *
 * // Output: Tables with both columns and methods
 * type EnhancedBlogTables = BuildEnhancedTables<BlogTables>;
 * // Result: {
 * //   posts: PostsTable & TableHelpers<PostsTable>;
 * //   comments: CommentsTable & TableHelpers<CommentsTable>;
 * // }
 *
 * // Usage in vault context:
 * vault.blog.posts.title           // column access
 * vault.blog.posts.getById('123')  // method access
 * vault.blog.comments.select()     // query builder access
 * ```
 */
type BuildEnhancedTables<TTableMap extends TableMap> = {
	[K in keyof TTableMap]: SQLiteTableType<K & string, TTableMap[K]> &
		TableHelpers<SQLiteTableType<K & string, TTableMap[K]>>;
};

/**
 * Type-level equivalent of Drizzle's `sqliteTable()` function.
 *
 * Produces the exact same type that would be returned by:
 * ```typescript
 * sqliteTable(tableName, columns)
 * ```
 *
 * This allows the plugin system to have full type safety for tables
 * before they're actually created at runtime.
 *
 * @template TTableName - The table name
 * @template TColumns - The column definitions (same format as sqliteTable's second parameter)
 *
 * @example
 * ```typescript
 * // These produce the exact same type:
 *
 * // Runtime (using sqliteTable):
 * const posts = sqliteTable('posts', {
 *   id: id(),
 *   title: text(),
 *   score: integer()
 * });
 *
 * // Type-level (using SQLiteTableType):
 * type PostsTable = SQLiteTableType<'posts', {
 *   id: ReturnType<typeof id>;
 *   title: ReturnType<typeof text>;
 *   score: ReturnType<typeof integer>;
 * }>;
 *
 * // Both result in: SQLiteTableWithColumns<...> with identical structure
 * ```
 */
type SQLiteTableType<
	TTableName extends string,
	TColumns extends TableWithId,
> = SQLiteTableWithColumns<{
	name: TTableName;
	schema: undefined;
	columns: BuildColumns<TTableName, TColumns, 'sqlite'>;
	dialect: 'sqlite';
}>;

/**
 * Table schema definitions for a plugin.
 *
 * Maps table names to their column definitions. Each plugin can define multiple
 * tables, and each table must have an 'id' column. These definitions are used
 * to create both SQLite tables and markdown storage structures.
 *
 * Structure:
 * - First level: table names (e.g., "posts", "comments")
 * - Second level: column definitions with required 'id' column
 *
 * @example
 * ```typescript
 * const blogTables: TableMap = {
 *   posts: {
 *     id: id(),           // Required: auto-generated ID
 *     title: text(),      // String column
 *     score: integer(),   // Number column
 *     publishedAt: date({ nullable: true })  // Optional date
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text(),     // Foreign key reference
 *     content: text(),
 *     createdAt: date()
 *   }
 * }
 * // Results in two tables: 'posts' and 'comments'
 * ```
 */
type TableMap = Record<string, TableWithId>;

/**
 * A single table definition that must have an 'id' column created with id().
 *
 * This type ensures every table in the vault has a unique identifier column,
 * which is essential for the document-based storage system and markdown sync.
 * The id column uses nanoid for URL-safe, collision-resistant identifiers.
 *
 * @example
 * ```typescript
 * const postColumns: TableWithId = {
 *   id: id(),           // Required: auto-generated nanoid
 *   title: text(),      // String column
 *   score: integer(),   // Number column
 *   createdAt: date()   // Date column
 * }
 * ```
 */
type TableWithId = {
	id: ReturnType<typeof id>;
	[key: string]: SQLiteColumnBuilderBase;
};
