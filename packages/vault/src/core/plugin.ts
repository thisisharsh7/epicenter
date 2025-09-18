import type {
	SQLiteColumnBuilderBase,
	SQLiteTable,
	SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { BuildColumns } from 'drizzle-orm/column-builder';
import type { id } from './columns';

/**
 * A single table definition that must have an 'id' column created with id()
 *
 * @example
 * ```typescript
 * {
 *   id: id(),           // Required: auto-generated nanoid
 *   title: text(),      // Other columns
 *   createdAt: date()
 * }
 * ```
 */
type TableWithId = {
	id: ReturnType<typeof id>;
	[key: string]: SQLiteColumnBuilderBase;
};

/**
 * Table schema definitions for a plugin.
 *
 * Structure:
 * - First level: table names (e.g., "posts", "comments")
 * - Second level: column definitions with required 'id' column
 *
 * @example
 * ```typescript
 * const tables = {
 *   posts: {
 *     id: id(),           // Required: auto-generated ID
 *     title: text(),      // String column
 *     score: integer(),   // Number column
 *     createdAt: date()   // Date column
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text(),     // Foreign key reference
 *     content: text()
 *   }
 * }
 * ```
 */
type TableSchemaDefinitions = Record<string, TableWithId>;

/**
 * Built-in helper methods available on each table.
 * These are automatically added to every table in the vault.
 */
type TableHelperMethods<T extends SQLiteTable> = {
	// Fast read operations (from SQLite)
	getById(id: string): Promise<InferSelectModel<T> | null>;
	findById(id: string): Promise<InferSelectModel<T> | null>; // Alias for getById
	get(id: string): Promise<InferSelectModel<T> | null>;
	get(ids: string[]): Promise<InferSelectModel<T>[]>;
	getAll(): Promise<InferSelectModel<T>[]>;
	count(): Promise<number>;

	// Write operations (sync to both SQLite and markdown)
	create(
		data: InferInsertModel<T> & { id: string },
	): Promise<InferSelectModel<T>>;
	create(
		data: (InferInsertModel<T> & { id: string })[],
	): Promise<InferSelectModel<T>[]>;
	update(
		id: string,
		data: Partial<InferInsertModel<T>>,
	): Promise<InferSelectModel<T> | null>;
	delete(id: string): Promise<boolean>;
	delete(ids: string[]): Promise<boolean>;
	upsert(
		data: InferInsertModel<T> & { id: string },
	): Promise<InferSelectModel<T>>;

	// Drizzle query builder for advanced queries
	select(): any; // Returns Drizzle select query builder
	query?: any; // Drizzle relational query API if available
};

/**
 * Enhanced table type that includes both Drizzle table columns and helper methods.
 *
 * This type represents the dual nature of vault tables:
 * 1. **Column Access**: For use in Drizzle operations like `eq(table.columnName, value)`
 * 2. **Helper Methods**: For CRUD operations like `table.getById(id)`
 *
 * @example
 * ```typescript
 * // Column access for Drizzle operations
 * vault.posts.posts
 *   .select()
 *   .where(eq(vault.posts.posts.title, 'Hello')) // Accessing .title column
 *   .all();
 *
 * // Helper method access
 * const post = await vault.posts.posts.getById('123'); // Calling helper method
 * ```
 */
type EnhancedTableType<T extends SQLiteTable> = T & TableHelperMethods<T>;

/**
 * Maps column definitions (from definePlugin) to the SQLite table type that
 * would be produced by Drizzle's sqliteTable() function.
 *
 * This preserves all column type information for IntelliSense.
 *
 * @template TTableName - The name of the table
 * @template TColumns - The column definitions (matches what sqliteTable expects)
 */
type ColumnDefsToSQLiteTable<
	TTableName extends string,
	TColumns extends TableWithId,
> = SQLiteTableWithColumns<{
	name: TTableName;
	schema: undefined;
	columns: BuildColumns<TTableName, TColumns, 'sqlite'>;
	dialect: 'sqlite';
}>;

/**
 * Helper type to convert column builders to enhanced SQLite tables with methods.
 *
 * This transformation:
 * 1. Takes column definitions from TableSchemaDefinitions
 * 2. Converts them to properly typed SQLite tables using ColumnDefsToSQLiteTable
 * 3. Enhances them with helper methods
 *
 * The result is a table that has both column properties and helper methods,
 * with full type information preserved.
 */
type ExtractDrizzleTables<TTables extends TableSchemaDefinitions> = {
	[K in keyof TTables]: EnhancedTableType<
		ColumnDefsToSQLiteTable<K & string, TTables[K]>
	>;
};

/**
 * Constraint for plugin methods - must be functions
 */
type PluginMethodsConstraint = Record<string, (...args: any[]) => any>;

/**
 * Extract a specific plugin from dependencies by ID
 */
type GetPluginById<
	TDeps extends readonly AnyPlugin[],
	TId extends string,
> = TDeps extends readonly [...infer Rest, infer Last]
	? Last extends AnyPlugin
		? Last['id'] extends TId
			? Last
			: GetPluginById<
					Rest extends readonly AnyPlugin[] ? Rest : readonly [],
					TId
				>
		: never
	: never;

/**
 * Extract the complete plugin namespace (tables + methods) for a single plugin
 */
type ExtractPluginNamespace<TPlugin extends AnyPlugin> = ExtractDrizzleTables<
	TPlugin['tables']
> &
	ReturnType<TPlugin['methods']>;

/**
 * Helper type to extract all plugin namespaces from dependencies.
 * Each plugin gets its own namespace with both tables and methods.
 */
type ExtractPluginNamespaces<TDeps extends readonly AnyPlugin[]> = {
	[K in TDeps[number]['id']]: TDeps[number] extends { id: K }
		? ExtractPluginNamespace<TDeps[number]>
		: never;
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
 * @template TTables - The current plugin's table definitions (column builders)
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
	TTables extends TableSchemaDefinitions,
	TDeps extends readonly AnyPlugin[] = readonly [],
> = ExtractPluginNamespaces<TDeps> & {
	// The current plugin's tables are added to its namespace
	// These are properly typed with all column information preserved
	[K in TSelfId]: ExtractDrizzleTables<TTables>;
};

/**
 * Base plugin type for dependencies.
 * Used when we don't need specific type information.
 */
export type AnyPlugin = {
	id: string;
	dependencies?: readonly AnyPlugin[];
	tables: TableSchemaDefinitions;
	methods: (vault: any) => PluginMethodsConstraint;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Plugin definition with strongly typed vault context.
 *
 * @template TId - Unique plugin identifier (lowercase, alphanumeric)
 * @template TTables - Table definitions for this plugin
 * @template TMethods - Methods exposed by this plugin (must be functions)
 * @template TDeps - Other plugins this plugin depends on
 *
 * Key features:
 * - **Namespaced access**: Each plugin gets its own namespace in the vault
 * - **Circular dependencies**: Plugins can have circular dependencies
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
	TTables extends TableSchemaDefinitions = TableSchemaDefinitions,
	TMethods extends PluginMethodsConstraint = PluginMethodsConstraint,
	TDeps extends readonly AnyPlugin[] = readonly [],
> = {
	id: TId;
	dependencies?: TDeps;
	tables: TTables;
	methods: (vault: VaultContext<TId, TTables, TDeps>) => TMethods;
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

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
 * ### Circular Dependencies
 * Plugins can have circular dependencies! The vault uses a two-phase
 * initialization that allows plugins to reference each other:
 * 1. First phase: All tables are created
 * 2. Second phase: All methods are initialized with access to all tables
 *
 * @param plugin - The plugin configuration object
 * @returns The same plugin object with validated configuration
 *
 * @example
 * ```typescript
 * // Example: Blog system with circular dependencies
 *
 * // Posts plugin can depend on comments
 * const postsPlugin = definePlugin({
 *   id: 'posts',
 *   dependencies: [commentsPlugin], // OK even if comments also depends on posts!
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
 * // Comments plugin can also depend on posts - circular dependency works!
 * const commentsPlugin = definePlugin({
 *   id: 'comments',
 *   dependencies: [postsPlugin], // Circular dependency is fine!
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
	TTables extends TableSchemaDefinitions,
	TMethods extends PluginMethodsConstraint,
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

