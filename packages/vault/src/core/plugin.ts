import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BuildColumns } from 'drizzle-orm/column-builder';
import type {
	SQLiteColumnBuilderBase,
	SQLiteTable,
	SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { Result } from 'wellcrafted/result';
import type { TableSelectBuilder } from '../types/drizzle-helpers';
import type { id } from './columns';
import type { VaultOperationError } from './errors';
import type { PluginMethodMap } from './methods';

/**
 * Define a plugin with full type safety and IntelliSense support.
 *
 * This function validates plugin configuration and provides TypeScript inference
 * for the plugin API passed to plugin methods.
 *
 * ## Key Concepts
 *
 * ### Plugin Namespacing
 * Each plugin gets its own namespace in the plugin API:
 * - Tables: `api.[pluginId].[tableName]`
 * - Methods: `api.[pluginId].[methodName]()`
 *
 * ### Table Helper Methods
 * Every table you define automatically gets a complete set of API methods:
 * - `getById(id)` - Get a single record by ID
 * - `create(data)` - Create a new record
 * - `update(id, data)` - Update an existing record
 * - `delete(id)` - Delete a record
 * - `select()` - Access Drizzle query builder for complex queries
 * - And more...
 *
 * ### Dependency Management
 * Plugins can depend on other plugins to access their methods
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
 *   methods: (api) => ({
 *     // Access own tables via api.posts.posts
 *     async getTopPosts(limit = 10) {
 *       return api.posts.posts
 *         .select()
 *         .orderBy(desc(api.posts.posts.score))
 *         .limit(limit)
 *         .all();
 *     },
 *
 *     // Use table helper methods
 *     async getPostById(postId: string) {
 *       return api.posts.posts.getById(postId);
 *     },
 *
 *     // Access dependency plugins
 *     async getPostWithComments(postId: string) {
 *       const post = await api.posts.posts.getById(postId);
 *       if (!post) return null;
 *
 *       // Call methods from the comments plugin
 *       const comments = await api.comments.getCommentsForPost(postId);
 *       return { ...post, comments };
 *     },
 *
 *     // Create new records with helper methods
 *     async createPost(title: string, author: string) {
 *       return api.posts.posts.create({
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
 *   methods: (api) => ({
 *     // Access dependency methods
 *     async getCommentsForPost(postId: string) {
 *       // Call posts plugin method to verify post exists
 *       const post = await api.posts.getPostById(postId);
 *       if (!post) return [];
 *
 *       // Use own tables with query builder
 *       return api.comments.comments
 *         .select()
 *         .where(eq(api.comments.comments.postId, postId))
 *         .orderBy(desc(api.comments.comments.createdAt))
 *         .all();
 *     },
 *
 *     // Call dependency's methods
 *     async getCommentsForTopPosts() {
 *       // Call posts plugin method
 *       const topPosts = await api.posts.getTopPosts();
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
 *       return api.comments.comments.create({
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
	TTableMap extends PluginTableMap,
	TMethodMap extends PluginMethodMap,
	TDeps extends readonly Plugin[] = readonly [],
>(
	plugin: Plugin<TId, TTableMap, TMethodMap, TDeps>,
): Plugin<TId, TTableMap, TMethodMap, TDeps> {
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
 * @template TMethodMap - Methods exposed by this plugin (must be functions)
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
 *   methods: (api) => ({
 *     // Access own tables via api.blog.posts, api.blog.tags
 *     async getPublishedPosts() {
 *       return api.blog.posts
 *         .select()
 *         .where(isNotNull(api.blog.posts.publishedAt))
 *         .orderBy(desc(api.blog.posts.publishedAt))
 *         .all();
 *     },
 *
 *     // Access dependency methods
 *     async getPostsByAuthor(authorId: string) {
 *       const author = await api.users.getUserById(authorId);
 *       if (!author) return [];
 *
 *       return api.blog.posts
 *         .select()
 *         .where(eq(api.blog.posts.authorId, authorId))
 *         .all();
 *     },
 *
 *     // Use table helper methods
 *     async createPost(data: PostInput) {
 *       return api.blog.posts.create({
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
	TTableMap extends PluginTableMap = PluginTableMap,
	TMethodMap extends PluginMethodMap = PluginMethodMap,
	TDeps extends readonly Plugin[] = readonly [],
> = {
	id: TId;
	dependencies?: TDeps;
	tables: TTableMap;
	methods: (api: PluginAPI<TId, TTableMap, TDeps>) => TMethodMap;
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
 * const post = await api.posts.posts.getById('abc123');
 * const allPosts = await api.posts.posts.getAll();
 * const created = await api.posts.posts.create({ id: 'xyz', title: 'Hello' });
 * const updated = await api.posts.posts.update('abc123', { title: 'Updated' });
 * const deleted = await api.posts.posts.delete('abc123');
 *
 * // Plus access to Drizzle query builder:
 * const published = await api.posts.posts
 *   .select()
 *   .where(isNotNull(api.posts.posts.publishedAt))
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
 * The plugin API passed to plugin methods.
 *
 * This API provides namespaced access to:
 * - **Own tables**: Via `api.[pluginId].[tableName]` with full column access and helper methods
 * - **Dependency plugins**: Access to their exposed methods
 *
 * ## Method Composition Patterns
 *
 * You can compose methods in several ways:
 *
 * ### Pass Through Dependency Methods
 * Spread the API to expose dependency methods directly:
 *
 * ```typescript
 * methods: (api) => ({
 *   // Pass through all methods
 *   ...api,
 *
 *   // Add your own custom methods
 *   async createPostWithAuthor(title: string, authorId: string) {
 *     // Use the passed-through method or compose with API
 *     const author = await api.users.getUserById(authorId);
 *     return api.blog.posts.create({ id: generateId(), title, authorId });
 *   }
 * })
 * ```
 *
 * ### Reusing Methods Within Your Plugin
 *
 * To reuse logic between methods, define helper functions in the plugin scope:
 *
 * ```typescript
 * methods: (api) => {
 *   // Define reusable helper
 *   const getPostsByAuthor = async (authorId: string) => {
 *     return api.blog.posts
 *       .select()
 *       .where(eq(api.blog.posts.authorId, authorId));
 *   };
 *
 *   return {
 *     // Export the helper as a method
 *     getPostsByAuthor,
 *
 *     // Reuse the helper in other methods
 *     async getPopularPostsByAuthor(authorId: string, minViews: number) {
 *       const posts = await getPostsByAuthor(authorId);
 *       return posts.filter(post => post.views >= minViews);
 *     }
 *   };
 * }
 * ```
 *
 * @template TSelfId - The current plugin's ID
 * @template TTableMap - The current plugin's table definitions (column builders)
 * @template TDeps - The plugin's dependencies
 *
 * @example
 * ```typescript
 * // In a plugin with id 'posts' that depends on 'comments':
 * methods: (api) => ({
 *   async getPostWithComments(postId: string) {
 *     // Access own tables with full column types
 *     const post = await api.posts.posts.getById(postId);
 *
 *     // Use columns in Drizzle operations
 *     const published = await api.posts.posts
 *       .select()
 *       .where(eq(api.posts.posts.publishedAt, new Date()))
 *       .all();
 *
 *     // Access dependency methods
 *     const comments = await api.comments.getCommentsForPost(postId);
 *
 *     return { ...post, comments };
 *   }
 * })
 * ```
 *
 * The tables in the plugin API are "enhanced" - they work as both:
 * 1. **Drizzle tables**: Access columns for queries `table.columnName`
 * 2. **Helper objects**: Call CRUD methods like `table.getById()`
 */
type PluginAPI<
	TSelfId extends string,
	TTableMap extends PluginTableMap,
	TDeps extends readonly Plugin[] = readonly [],
> = BuildDependencyNamespaces<TDeps> &
	BuildInitialPluginNamespace<TSelfId, TTableMap>;

/**
 * Builds namespaces for dependency plugins.
 *
 * Aggregates the finalized methods from all dependency plugins into their
 * respective namespaces. Each dependency plugin's methods are accessible
 * via `api.[dependencyId].[methodName]()`.
 *
 * @template TDeps - Array of dependency plugins
 */
type BuildDependencyNamespaces<TDeps extends readonly Plugin[]> = {
	// Dependencies: Get their methods
	[K in TDeps[number]['id']]: TDeps[number] extends Plugin<K>
		? ExtractHandlers<ReturnType<TDeps[number]['methods']>>
		: never;
};

/**
 * Builds the initial namespace for the current plugin.
 *
 * Provides the namespace with table helper methods before custom methods are
 * defined. Tables come with helper methods like getById, create, update,
 * delete, select, etc., plus access to the underlying Drizzle table instance.
 *
 * This allows you to access columns for queries (`api.posts.posts.title`), call
 * helper methods (`api.posts.posts.getById('123')`), and use the query builder
 * (`api.posts.posts.select().where(...)`).
 *
 * @template TSelfId - The current plugin's ID
 * @template TTableMap - The current plugin's table definitions
 */
type BuildInitialPluginNamespace<
	TSelfId extends string,
	TTableMap extends PluginTableMap,
> = {
	// Current plugin: Get initial methods from tables
	// Each table gets both SQLite table access and helper methods like getById, create, update, delete, etc.
	[K in TSelfId]: {
		[TableName in keyof TTableMap]: TableHelpers<
			SQLiteTableType<TableName & string, TTableMap[TableName]>
		> &
			SQLiteTableType<TableName & string, TTableMap[TableName]>;
	};
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
 * Extracts just the handler functions from a PluginMethodMap.
 *
 * This type transforms method objects (which have properties like type, input, handler)
 * into just their handler functions, so they can be called directly in the vault context.
 *
 * @template T - A PluginMethodMap containing method definitions
 *
 * @example
 * ```typescript
 * // Input: Method objects with handler properties
 * type Methods = {
 *   getUser: QueryMethod<UserSchema, User>;
 *   createUser: MutationMethod<CreateUserSchema, User>;
 * }
 *
 * // Output: Just the handler functions
 * type Handlers = ExtractHandlers<Methods>;
 * // Result: {
 * //   getUser: (input: UserInput) => User | Promise<User>;
 * //   createUser: (input: CreateUserInput) => User | Promise<User>;
 * // }
 * ```
 */
type ExtractHandlers<T extends PluginMethodMap> = {
	[K in keyof T]: T[K]['handler'];
};

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
 * const blogTables: PluginTableMap = {
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
type PluginTableMap = Record<string, TableWithId>;

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
