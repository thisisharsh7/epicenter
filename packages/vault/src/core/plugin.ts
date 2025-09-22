import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BuildColumns } from 'drizzle-orm/column-builder';
import type {
	SQLiteColumnBuilderBase,
	SQLiteTable,
	SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { Result } from 'wellcrafted/result';
import { z } from 'zod';
import type { TableSelectBuilder } from '../types/drizzle-helpers';
import type { id } from './columns';
import type { VaultOperationError } from './errors';
import type { PluginMethodMap } from './methods';
import { defineMutation, defineQuery } from './methods';

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
 *     getTopPosts: defineQuery({
 *       input: z.object({
 *         limit: z.number().optional().default(10)
 *       }),
 *       description: 'Get the top posts ordered by score',
 *       handler: async ({ limit }) => {
 *         return api.posts.posts
 *           .select()
 *           .orderBy(desc(api.posts.posts.score))
 *           .limit(limit)
 *           .all();
 *       }
 *     }),
 *
 *     // Use table helper methods
 *     getPostById: defineQuery({
 *       input: z.object({
 *         postId: z.string()
 *       }),
 *       description: 'Get a single post by its ID',
 *       handler: async ({ postId }) => {
 *         return api.posts.posts.getById(postId);
 *       }
 *     }),
 *
 *     // Access dependency plugins
 *     getPostWithComments: defineQuery({
 *       input: z.object({
 *         postId: z.string()
 *       }),
 *       description: 'Get a post with all its comments',
 *       handler: async ({ postId }) => {
 *         const post = await api.posts.posts.getById(postId);
 *         if (!post) return null;
 *
 *         // Call methods from the comments plugin
 *         const comments = await api.comments.getCommentsForPost({ postId });
 *         return { ...post, comments };
 *       }
 *     }),
 *
 *     // Create new records with helper methods
 *     createPost: defineMutation({
 *       input: z.object({
 *         title: z.string().min(1),
 *         author: z.string().min(1)
 *       }),
 *       description: 'Create a new blog post',
 *       handler: async ({ title, author }) => {
 *         return api.posts.posts.create({
 *           id: generateId(), // You provide the ID
 *           title,
 *           author,
 *           score: 0,
 *           publishedAt: null
 *         });
 *       }
 *     })
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
 *     getCommentsForPost: defineQuery({
 *       input: z.object({
 *         postId: z.string()
 *       }),
 *       description: 'Get all comments for a specific post',
 *       handler: async ({ postId }) => {
 *         // Call posts plugin method to verify post exists
 *         const post = await api.posts.getPostById({ postId });
 *         if (!post) return [];
 *
 *         // Use own tables with query builder
 *         return api.comments.comments
 *           .select()
 *           .where(eq(api.comments.comments.postId, postId))
 *           .orderBy(desc(api.comments.comments.createdAt))
 *           .all();
 *       }
 *     }),
 *
 *     // Call dependency's methods
 *     getCommentsForTopPosts: defineQuery({
 *       input: z.void(),
 *       description: 'Get comments from all top posts',
 *       handler: async () => {
 *         // Call posts plugin method
 *         const topPosts = await api.posts.getTopPosts();
 *
 *         // Fetch comments for all top posts
 *         const allComments = [];
 *         for (const post of topPosts) {
 *           const comments = await api.comments.getCommentsForPost({ postId: post.id });
 *           allComments.push(...comments);
 *         }
 *         return allComments;
 *       }
 *     }),
 *
 *     // Use table helper methods
 *     createComment: defineMutation({
 *       input: z.object({
 *         postId: z.string(),
 *         author: z.string().min(1),
 *         content: z.string().min(1)
 *       }),
 *       description: 'Create a new comment on a post',
 *       handler: async ({ postId, author, content }) => {
 *         return api.comments.comments.create({
 *           id: generateId(),
 *           postId,
 *           author,
 *           content,
 *           createdAt: new Date()
 *         });
 *       }
 *     })
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
} /**
 * Plugin definition with strongly typed API context.
 *
 * A plugin is a self-contained module that defines data tables and business logic.
 * Think of it as a mini-application that can interact with other plugins through
 * a shared API. Every plugin has four essential parts:
 * - `id`: A unique identifier for your plugin
 * - `dependencies`: Other plugins your plugin needs to work with
 * - `tables`: Database tables your plugin manages
 * - `methods`: Functions that define what your plugin can do
 *
 * ## The Methods Function (Core Concept)
 *
 * The `methods` function is the heart of your plugin. It receives a single `api`
 * parameter and returns an object containing your plugin's functionality.
 *
 * ```typescript
 * methods: (api) => ({
 *   // Your plugin's methods go here
 *   doSomething: defineQuery({
 *     input: z.void(),
 *     description: 'Does something useful',
 *     handler: async () => {
 *       // Use the api to access tables and other plugins
 *     }
 *   })
 * })
 * ```
 *
 * The `api` parameter is dynamically constructed and contains everything your
 * plugin needs to interact with the vault system.
 *
 * ## How Your API is Constructed
 *
 * The magic happens in how the `api` parameter is built. It combines two sources:
 *
 * **1. Dependency Plugin Methods**
 * Every plugin listed in your `dependencies` array contributes its methods to your API.
 * If you depend on a `users` plugin, you can call `api.users.getAllUsers()`.
 *
 * **2. Table Helper Methods**
 * Every table you define in `tables` gets a complete set of helper methods automatically.
 * A `posts` table becomes `api.[pluginId].posts` with methods like `getById()`, `create()`, etc.
 *
 * This creates a unified interface: **dependencies + tables = your API**
 *
 * ## Table Helpers (Automatic Superpowers)
 *
 * When you define a table, you automatically get powerful helper methods:
 *
 * ```typescript
 * // Your table definition:
 * tables: {
 *   posts: { id: id(), title: text(), content: text() }
 * }
 *
 * // Automatically available in your methods:
 * methods: (api) => ({
 *   exampleUsage: defineQuery({
 *     input: z.void(),
 *     description: 'Demonstrates various table operations',
 *     handler: async () => {
 *       // Read operations
 *       const post = await api.blog.posts.getById('abc123');
 *       const allPosts = await api.blog.posts.getAll();
 *
 *       // Write operations
 *       const newPost = await api.blog.posts.create({
 *         id: generateId(),
 *         title: 'Hello World',
 *         content: 'This is my first post'
 *       });
 *
 *       // Complex queries (full Drizzle power)
 *       const recentPosts = await api.blog.posts
 *         .select()
 *         .where(gt(api.blog.posts.createdAt, lastWeek))
 *         .orderBy(desc(api.blog.posts.createdAt))
 *         .limit(10)
 *         .all();
 *
 *       return { post, allPosts, newPost, recentPosts };
 *     }
 *   })
 * })
 * ```
 *
 * Your tables work as both Drizzle tables (for columns and queries) and helper
 * objects (for convenient methods). This gives you the best of both worlds.
 *
 * ## Dependency System (Plugin Composition)
 *
 * Plugins can depend on other plugins to access their functionality. This enables
 * building complex features by composing simpler, focused plugins.
 *
 * ```typescript
 * const commentsPlugin = definePlugin({
 *   id: 'comments',
 *   dependencies: [usersPlugin], // Now we can use user methods
 *
 *   methods: (api) => ({
 *     createComment: defineMutation({
 *       input: z.object({
 *         postId: z.string(),
 *         authorId: z.string(),
 *         content: z.string().min(1)
 *       }),
 *       description: 'Create a new comment with user validation',
 *       handler: async ({ postId, authorId, content }) => {
 *         // Use dependency method to validate user exists
 *         const author = await api.users.getUserById({ userId: authorId });
 *         if (!author) throw new Error('User not found');
 *
 *         // Use our own table helpers
 *         return api.comments.comments.create({
 *           id: generateId(),
 *           postId,
 *           authorId,
 *           content,
 *           createdAt: new Date()
 *         });
 *       }
 *     })
 *   })
 * });
 * ```
 *
 * ## Method Composition Patterns
 *
 * ### Exposing Dependency Methods
 * You can re-export methods from dependencies alongside your own:
 *
 * ```typescript
 * methods: (api) => ({
 *   // Spread dependency methods to expose them
 *   ...api.users,
 *
 *   // Add your own methods
 *   createUserPost: defineMutation({
 *     input: z.object({
 *       userId: z.string(),
 *       title: z.string().min(1)
 *     }),
 *     description: 'Create a post for a specific user',
 *     handler: async ({ userId, title }) => {
 *       const user = await api.users.getUserById({ userId }); // From dependency
 *       if (!user) throw new Error('User not found');
 *       return api.blog.posts.create({
 *         id: generateId(),
 *         title,
 *         authorId: userId,
 *         content: '',
 *         publishedAt: null
 *       }); // From own tables
 *     }
 *   })
 * })
 * ```
 *
 * ### Internal Helper Functions
 * Define reusable helpers within your plugin scope:
 *
 * ```typescript
 * methods: (api) => {
 *   // Internal helper (not exported)
 *   const getPostsByStatus = async (status: string) => {
 *     return api.blog.posts
 *       .select()
 *       .where(eq(api.blog.posts.status, status))
 *       .all();
 *   };
 *
 *   return {
 *     // Public methods that use the helper
 *     getPublishedPosts: defineQuery({
 *       input: z.void(),
 *       description: 'Get all published posts',
 *       handler: async () => {
 *         return getPostsByStatus('published');
 *       }
 *     }),
 *
 *     getDraftPosts: defineQuery({
 *       input: z.void(),
 *       description: 'Get all draft posts',
 *       handler: async () => {
 *         return getPostsByStatus('draft');
 *       }
 *     })
 *   };
 * }
 * ```
 *
 * @template TId - Unique plugin identifier (lowercase, alphanumeric)
 * @template TTableMap - Table definitions for this plugin
 * @template TMethodMap - Methods exposed by this plugin (must be functions)
 * @template TDeps - Other plugins this plugin depends on
 *
 * @example
 * ```typescript
 * // Simple plugin with just tables
 * const tagsPlugin = definePlugin({
 *   id: 'tags',
 *   dependencies: [],
 *
 *   tables: {
 *     tags: {
 *       id: id(),
 *       name: text(),
 *       color: text({ nullable: true })
 *     }
 *   },
 *
 *   methods: (api) => ({
 *     // Use table helpers
 *     createTag: defineMutation({
 *       input: z.object({
 *         name: z.string().min(1),
 *         color: z.string().optional()
 *       }),
 *       description: 'Create a new tag with optional color',
 *       handler: async ({ name, color }) => {
 *         return api.tags.tags.create({
 *           id: generateId(),
 *           name,
 *           color: color || null
 *         });
 *       }
 *     }),
 *
 *     getTagByName: defineQuery({
 *       input: z.object({
 *         name: z.string()
 *       }),
 *       description: 'Find a tag by its name',
 *       handler: async ({ name }) => {
 *         return api.tags.tags
 *           .select()
 *           .where(eq(api.tags.tags.name, name))
 *           .get();
 *       }
 *     })
 *   })
 * });
 *
 * // Complex plugin with dependencies
 * const blogPlugin = definePlugin({
 *   id: 'blog',
 *   dependencies: [tagsPlugin], // Can use tag methods
 *
 *   tables: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: text(),
 *       authorId: text(),
 *       publishedAt: date({ nullable: true })
 *     },
 *     postTags: {
 *       id: id(),
 *       postId: text(),
 *       tagId: text()
 *     }
 *   },
 *
 *   methods: (api) => ({
 *     createPost: defineMutation({
 *       input: z.object({
 *         title: z.string().min(1),
 *         content: z.string(),
 *         tagNames: z.array(z.string())
 *       }),
 *       description: 'Create a new post with tags',
 *       handler: async ({ title, content, tagNames }) => {
 *         // Create the post
 *         const post = await api.blog.posts.create({
 *           id: generateId(),
 *           title,
 *           content,
 *           authorId: 'current-user',
 *           publishedAt: null
 *         });
 *
 *         // Create tags and associations using dependency methods
 *         for (const tagName of tagNames) {
 *           let tag = await api.tags.getTagByName({ name: tagName }); // Dependency method
 *           if (!tag) {
 *             tag = await api.tags.createTag({ name: tagName }); // Dependency method
 *           }
 *
 *           await api.blog.postTags.create({
 *             id: generateId(),
 *             postId: post.id,
 *             tagId: tag.id
 *           });
 *         }
 *
 *         return post;
 *       }
 *     }),
 *
 *     getPostsWithTags: defineQuery({
 *       input: z.void(),
 *       description: 'Get all posts with their associated tags',
 *       handler: async () => {
 *         // Complex query using multiple tables
 *         const posts = await api.blog.posts.getAll();
 *
 *         return Promise.all(
 *           posts.map(async (post) => {
 *             const postTagLinks = await api.blog.postTags
 *               .select()
 *               .where(eq(api.blog.postTags.postId, post.id))
 *               .all();
 *
 *             const tags = await Promise.all(
 *               postTagLinks.map(link =>
 *                 api.tags.tags.getById(link.tagId)
 *               )
 *             );
 *
 *             return { ...post, tags: tags.filter(Boolean) };
 *           })
 *         );
 *       }
 *     })
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
	methods: (
		api: BuildDependencyNamespaces<TDeps> &
			BuildInitialPluginNamespace<TId, TTableMap>,
	) => TMethodMap;
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
