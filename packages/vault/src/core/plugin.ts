import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { BuildColumns } from 'drizzle-orm/column-builder';
import type {
	SQLiteColumnBuilderBase,
	SQLiteSelectBase,
	SQLiteTable,
	SQLiteTableWithColumns,
	SelectedFields,
} from 'drizzle-orm/sqlite-core';
import type { Result } from 'wellcrafted/result';
import type { id } from './columns';
import type { VaultOperationError } from './errors';
import type { PluginMethodMap } from './methods';

/**
 * Define a collaborative workspace with full type safety and IntelliSense support.
 *
 * Each folder containing an `epicenter.config.ts` file becomes a self-contained,
 * globally synchronizable workspace. The workspace ID serves as a globally unique
 * identifier for Yjs document synchronization, enabling real-time collaboration
 * across multiple users.
 *
 * ## Collaborative Workspace Model
 *
 * ### Globally Unique Workspace ID
 * The `id` field is a globally unique identifier (UUID or nanoid) that:
 * - Uniquely identifies this workspace across all instances
 * - Serves as the Yjs document ID for real-time collaboration
 * - Enables stable cross-workspace dependencies
 * - Allows workspace portability and sharing
 *
 * ```typescript
 * definePlugin({
 *   id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // Globally unique ID
 *   tables: { ... },
 *   methods: ({ tables }) => ({ ... })
 * })
 * ```
 *
 * ### Folder Structure
 * Organize workspaces as independent folders:
 * ```
 * my-project/
 *   users/
 *     epicenter.config.ts    # Users workspace
 *     data/                  # Local storage
 *   posts/
 *     epicenter.config.ts    # Posts workspace
 *     data/
 * ```
 *
 * ### Table Helper Methods
 * Every table you define automatically gets a complete set of API methods:
 * - `getById(id)` - Get a single record by ID
 * - `getByIds(ids)` - Get multiple records by IDs
 * - `getAll()` - Get all records from the table
 * - `count()` - Count total records in the table
 * - `upsert(data)` - Create or update a record (idempotent)
 * - `deleteById(id)` - Delete a single record
 * - `deleteByIds(ids)` - Delete multiple records
 * - `select()` - Access Drizzle query builder for complex queries
 *
 * ### Cross-Workspace Dependencies
 * Workspaces can depend on other workspaces via imports:
 * ```typescript
 * import usersPlugin from '../users/epicenter.config';
 *
 * definePlugin({
 *   id: 'workspace-id',
 *   dependencies: [usersPlugin],
 *   methods: ({ plugins }) => ({
 *     // Access users workspace methods
 *     async createComment({ userId }) {
 *       const user = await plugins.users.getUserById({ userId });
 *       // ...
 *     }
 *   })
 * })
 * ```
 *
 * @param workspace - The workspace configuration object
 * @returns The same workspace object with validated configuration
 *
 * @example
 * ```typescript
 * // Example: Blog system with workspace dependencies
 *
 * // Posts workspace can depend on comments
 * const postsWorkspace = defineWorkspace({
 *   id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // Globally unique ID
 *   dependencies: [commentsWorkspace], // Depend on comments workspace
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
 *   methods: ({ plugins, tables }) => ({
 *     // Access own tables via tables.posts
 *     getTopPosts: defineQuery({
 *       input: z.object({
 *         limit: z.number().optional().default(10)
 *       }),
 *       description: 'Get the top posts ordered by score',
 *       handler: async ({ limit }) => {
 *         return tables.posts
 *           .select()
 *           .orderBy(desc(tables.posts.score))
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
 *         return tables.posts.getById(postId);
 *       }
 *     }),
 *
 *     // Access dependency workspaces
 *     getPostWithComments: defineQuery({
 *       input: z.object({
 *         postId: z.string()
 *       }),
 *       description: 'Get a post with all its comments',
 *       handler: async ({ postId }) => {
 *         const post = await tables.posts.getById(postId);
 *         if (!post) return null;
 *
 *         // Call methods from the comments workspace
 *         const comments = await plugins.comments.getCommentsForPost({ postId });
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
 *         return tables.posts.upsert({
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
 * // Comments workspace for handling blog comments
 * const commentsWorkspace = defineWorkspace({
 *   id: 'f7g8h9i0-j1k2-3456-lmno-pq7890123456', // Globally unique ID
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
 *   methods: ({ plugins, tables }) => ({
 *     // Access dependency methods
 *     getCommentsForPost: defineQuery({
 *       input: z.object({
 *         postId: z.string()
 *       }),
 *       description: 'Get all comments for a specific post',
 *       handler: async ({ postId }) => {
 *         // Call posts workspace method to verify post exists
 *         const post = await plugins.posts.getPostById({ postId });
 *         if (!post) return [];
 *
 *         // Use own tables with query builder
 *         return tables.comments
 *           .select()
 *           .where(eq(tables.comments.postId, postId))
 *           .orderBy(desc(tables.comments.createdAt))
 *           .all();
 *       }
 *     }),
 *
 *     // Call dependency's methods
 *     getCommentsForTopPosts: defineQuery({
 *       input: z.void(),
 *       description: 'Get comments from all top posts',
 *       handler: async () => {
 *         // Call posts workspace method
 *         const topPosts = await plugins.posts.getTopPosts();
 *
 *         // Fetch comments for all top posts
 *         const allComments = [];
 *         for (const post of topPosts) {
 *           const comments = await plugins.comments.getCommentsForPost({ postId: post.id });
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
 *         return tables.comments.upsert({
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
 * @throws {Error} If workspace ID is invalid (must be a non-empty string)
 * @throws {Error} If any dependency is not a valid workspace object
 */
export function defineWorkspace<
	TId extends string,
	TTableMap extends PluginTableMap,
	TMethodMap extends PluginMethodMap,
	TDeps extends readonly Plugin[] = readonly [],
>(
	plugin: Plugin<TId, TTableMap, TMethodMap, TDeps>,
): Plugin<TId, TTableMap, TMethodMap, TDeps> {
	// Validate workspace ID (can be UUID, nanoid, or simple identifier)
	if (!plugin.id || typeof plugin.id !== 'string') {
		throw new Error(
			`Invalid workspace ID "${plugin.id}". Workspace IDs must be non-empty strings (UUID, nanoid, or simple identifier).`,
		);
	}

	// Validate dependencies are workspace objects with IDs
	if (plugin.dependencies) {
		for (const dep of plugin.dependencies) {
			if (!dep || typeof dep !== 'object' || !dep.id) {
				throw new Error(
					`Invalid dependency in workspace "${plugin.id}": dependencies must be workspace objects`,
				);
			}
		}
	}

	// Return the workspace as-is (it's already properly typed)
	return plugin;
}

/**
 * @deprecated Use `defineWorkspace` instead. This alias exists for backwards compatibility.
 */
export const definePlugin = defineWorkspace; /**
 * Collaborative workspace definition with strongly typed API context.
 *
 * A workspace is a self-contained, globally synchronizable module that defines
 * data tables and business logic. Each workspace lives in its own folder with
 * an `epicenter.config.ts` file and can be shared, synced, and collaborated on
 * in real-time using Yjs. Every workspace has four essential parts:
 * - `id`: A globally unique identifier (UUID/nanoid) used as the Yjs document ID
 * - `dependencies`: Other workspaces this workspace imports and depends on
 * - `tables`: Database tables this workspace manages
 * - `methods`: Functions that define what this workspace can do
 *
 * ## The Methods Function (Core Concept)
 *
 * The `methods` function is the heart of your workspace. It receives a single `api`
 * parameter and returns an object containing your workspace's functionality.
 *
 * ```typescript
 * methods: ({ plugins, tables }) => ({
 *   // Your workspace's methods go here
 *   doSomething: defineQuery({
 *     input: z.void(),
 *     description: 'Does something useful',
 *     handler: async () => {
 *       // Use plugins and tables to access other workspaces and own tables
 *     }
 *   })
 * })
 * ```
 *
 * The `api` parameter is dynamically constructed and contains everything your
 * workspace needs to interact with other workspaces and the vault system.
 *
 * ## How Your API is Constructed
 *
 * The magic happens in how the `api` parameter is built. It combines two sources:
 *
 * **1. Dependency Workspace Methods**
 * Every workspace listed in your `dependencies` array contributes its methods to your API.
 * If you depend on a `users` workspace, you can call `plugins.users.getAllUsers()`.
 *
 * **2. Table Helper Methods**
 * Every table you define in `tables` gets a complete set of helper methods automatically.
 * A `posts` table becomes `tables.posts` with methods like `getById()`, `upsert()`, etc.
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
 * methods: ({ plugins, tables }) => ({
 *   exampleUsage: defineQuery({
 *     input: z.void(),
 *     description: 'Demonstrates various table operations',
 *     handler: async () => {
 *       // Read operations
 *       const post = await tables.posts.getById('abc123');
 *       const posts = await tables.posts.getByIds(['abc123', 'def456']);
 *       const allPosts = await tables.posts.getAll();
 *       const count = await tables.posts.count();
 *
 *       // Write operations
 *       const newPost = await tables.posts.upsert({
 *         id: generateId(),
 *         title: 'Hello World',
 *         content: 'This is my first post'
 *       });
 *
 *       // Complex queries (full Drizzle power)
 *       const recentPosts = await tables.posts
 *         .select()
 *         .where(gt(tables.posts.createdAt, lastWeek))
 *         .orderBy(desc(tables.posts.createdAt))
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
 * ## Dependency System (Workspace Composition)
 *
 * Workspaces can depend on other workspaces to access their functionality. This enables
 * building complex features by composing simpler, focused workspaces. Dependencies are
 * imported from sibling folders, creating an explicit dependency graph.
 *
 * ```typescript
 * const commentsWorkspace = defineWorkspace({
 *   id: 'i9j0k1l2-m3n4-5678-opqr-st9012345678',
 *   dependencies: [usersWorkspace], // Now we can use user methods
 *
 *   methods: ({ plugins, tables }) => ({
 *     createComment: defineMutation({
 *       input: z.object({
 *         postId: z.string(),
 *         authorId: z.string(),
 *         content: z.string().min(1)
 *       }),
 *       description: 'Create a new comment with user validation',
 *       handler: async ({ postId, authorId, content }) => {
 *         // Use dependency method to validate user exists
 *         const author = await plugins.users.getUserById({ userId: authorId });
 *         if (!author) throw new Error('User not found');
 *
 *         // Use our own table helpers
 *         return tables.comments.upsert({
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
 * methods: ({ plugins, tables }) => ({
 *   // Spread dependency methods to expose them
 *   ...plugins.users,
 *
 *   // Add your own methods
 *   createUserPost: defineMutation({
 *     input: z.object({
 *       userId: z.string(),
 *       title: z.string().min(1)
 *     }),
 *     description: 'Create a post for a specific user',
 *     handler: async ({ userId, title }) => {
 *       const user = await plugins.users.getUserById({ userId }); // From dependency
 *       if (!user) throw new Error('User not found');
 *       return tables.posts.upsert({
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
 * Define reusable helpers within your workspace scope:
 *
 * ```typescript
 * methods: ({ plugins, tables }) => {
 *   // Internal helper (not exported)
 *   const getPostsByStatus = async (status: string) => {
 *     return tables.posts
 *       .select()
 *       .where(eq(tables.posts.status, status))
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
 * @template TId - Unique workspace identifier (UUID, nanoid, or simple string)
 * @template TTableMap - Table definitions for this workspace
 * @template TMethodMap - Methods exposed by this workspace (must be functions)
 * @template TDeps - Other workspaces this workspace depends on
 *
 * @example
 * ```typescript
 * // Simple workspace with just tables
 * const tagsWorkspace = defineWorkspace({
 *   id: 'm1n2o3p4-q5r6-7890-stuv-wx1234567890',
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
 *   methods: ({ plugins, tables }) => ({
 *     // Use table helpers
 *     createTag: defineMutation({
 *       input: z.object({
 *         name: z.string().min(1),
 *         color: z.string().optional()
 *       }),
 *       description: 'Create a new tag with optional color',
 *       handler: async ({ name, color }) => {
 *         return tables.tags.upsert({
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
 *         return tables.tags
 *           .select()
 *           .where(eq(tables.tags.name, name))
 *           .get();
 *       }
 *     })
 *   })
 * });
 *
 * // Complex workspace with dependencies
 * const blogWorkspace = defineWorkspace({
 *   id: 'y1z2a3b4-c5d6-7890-efgh-ij1234567890',
 *   dependencies: [tagsWorkspace], // Can use tag methods
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
 *   methods: ({ plugins, tables }) => ({
 *     createPost: defineMutation({
 *       input: z.object({
 *         title: z.string().min(1),
 *         content: z.string(),
 *         tagNames: z.array(z.string())
 *       }),
 *       description: 'Create a new post with tags',
 *       handler: async ({ title, content, tagNames }) => {
 *         // Create the post
 *         const post = await tables.posts.upsert({
 *           id: generateId(),
 *           title,
 *           content,
 *           authorId: 'current-user',
 *           publishedAt: null
 *         });
 *
 *         // Create tags and associations using dependency methods
 *         for (const tagName of tagNames) {
 *           let tag = await plugins.tags.getTagByName({ name: tagName }); // Dependency method
 *           if (!tag) {
 *             tag = await plugins.tags.createTag({ name: tagName }); // Dependency method
 *           }
 *
 *           await tables.postTags.upsert({
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
 *         const posts = await tables.posts.getAll();
 *
 *         return Promise.all(
 *           posts.map(async (post) => {
 *             const postTagLinks = await tables.postTags
 *               .select()
 *               .where(eq(tables.postTags.postId, post.id))
 *               .all();
 *
 *             const tags = await Promise.all(
 *               postTagLinks.map(link =>
 *                 plugins.tags.tags.getById(link.tagId)
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
	methods: (context: {
		plugins: DependencyPluginsAPI<TDeps>;
		tables: PluginTablesAPI<TTableMap>;
	}) => TMethodMap;
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
 * const post = await tables.posts.getById('abc123');
 * const posts = await tables.posts.getByIds(['abc123', 'def456']);
 * const allPosts = await tables.posts.getAll();
 * const count = await tables.posts.count();
 *
 * // Create or update with upsert:
 * const upserted = await tables.posts.upsert({ id: 'xyz', title: 'Hello' });
 *
 * // Delete operations:
 * const deleted = await tables.posts.deleteById('abc123'); // returns boolean
 * const deletedCount = await tables.posts.deleteByIds(['abc123', 'def456']); // returns count
 *
 * // Plus access to Drizzle query builder:
 * const published = await tables.posts
 *   .select()
 *   .where(isNotNull(tables.posts.publishedAt))
 *   .all();
 * ```
 */
export type TableHelpers<T extends SQLiteTable> = {
	// Read operations
	getById(
		id: string,
	): Promise<Result<InferSelectModel<T> | null, VaultOperationError>>;
	getByIds(
		ids: string[],
	): Promise<Result<InferSelectModel<T>[], VaultOperationError>>;
	getAll(): Promise<Result<InferSelectModel<T>[], VaultOperationError>>;
	count(): Promise<Result<number, VaultOperationError>>;

	// Write operations (sync to both SQLite and markdown)
	upsert(
		data: InferInsertModel<T> & { id: string },
	): Promise<Result<InferSelectModel<T>, VaultOperationError>>;
	deleteById(id: string): Promise<Result<boolean, VaultOperationError>>;
	deleteByIds(ids: string[]): Promise<Result<number, VaultOperationError>>;

	/**
	 * Creates a select query builder for this table.
	 *
	 * Calling this method with no arguments will select all columns from the table.
	 * Pass a selection object to specify which columns you want to select.
	 *
	 * Returns the equivalent of `db.select().from(table)` or `db.select(fields).from(table)`.
	 *
	 * @param fields Optional selection object to specify which columns to select
	 *
	 * @example
	 * ```typescript
	 * // Select all columns
	 * const allPosts = await tables.posts.select().where(gt(tables.posts.score, 10)).all();
	 *
	 * // Select specific columns
	 * const postTitles = await tables.posts
	 *   .select({ id: tables.posts.id, title: tables.posts.title })
	 *   .where(isNotNull(tables.posts.publishedAt))
	 *   .all();
	 * ```
	 */
	select(): SQLiteSelectBase<
		T['_']['name'],
		'async',
		unknown,
		InferSelectModel<T>,
		'single'
	>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBase<T['_']['name'], 'async', unknown, TSelection, 'partial'>;
};

/**
 * API surface for dependency workspaces.
 *
 * Aggregates the finalized methods from all dependency workspaces into their
 * respective namespaces. Each dependency workspace's methods are accessible
 * via `plugins.[workspaceId].[methodName]()`.
 *
 * @template TDeps - Array of dependency workspaces
 */
type DependencyPluginsAPI<TDeps extends readonly Plugin[]> = {
	// Dependencies: Get their methods
	[K in TDeps[number]['id']]: TDeps[number] extends Plugin<K>
		? ExtractHandlers<ReturnType<TDeps[number]['methods']>>
		: never;
};

/**
 * API surface for workspace's own tables.
 *
 * Provides direct access to table helper methods without workspace ID nesting.
 * Tables come with helper methods like getById, create, update, delete, select,
 * etc., plus access to the underlying Drizzle table instance.
 *
 * This allows you to access columns for queries (`tables.posts.title`), call
 * helper methods (`tables.posts.getById('123')`), and use the query builder
 * (`tables.posts.select().where(...)`).
 *
 * @template TTableMap - The current workspace's table definitions
 */
type PluginTablesAPI<TTableMap extends PluginTableMap> = {
	// Current plugin: Get initial methods from tables
	// Each table gets both SQLite table access and helper methods like getById, create, update, delete, etc.
	[TableName in keyof TTableMap]: TableHelpers<
		SQLiteTableType<TableName & string, TTableMap[TableName]>
	> &
		SQLiteTableType<TableName & string, TTableMap[TableName]>;
};

/**
 * Type-level equivalent of Drizzle's `sqliteTable()` function.
 *
 * Produces the exact same type that would be returned by:
 * ```typescript
 * sqliteTable(tableName, columns)
 * ```
 *
 * This allows the workspace system to have full type safety for tables
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
 * Table schema definitions for a workspace.
 *
 * Maps table names to their column definitions. Each workspace can define multiple
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
