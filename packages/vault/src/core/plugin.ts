import type { Result } from 'wellcrafted/result';
import type { VaultOperationError } from './errors';
import type { PluginMethodMap } from './methods';
import type { TableSchema } from './column-schemas';
import type { IndexMap, IndexesDefinition } from './indexes';

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * ## Workspace Structure
 *
 * Each workspace is a self-contained module with:
 * - **tables**: Column schemas (pure JSON, no Drizzle)
 * - **indexes**: Synchronized snapshots for querying (SQLite, markdown, vector, etc.)
 * - **methods**: Business logic with access to tables and indexes
 *
 * ## Data Flow
 *
 * **Writes**: Go to YJS document → auto-sync to all indexes
 * ```typescript
 * await tables.posts.upsert({ id: '1', title: 'Hello' });
 * // YJS updated → SQLite synced → Markdown synced → Vector synced
 * ```
 *
 * **Reads**: Query indexes directly
 * ```typescript
 * await indexes.sqlite.posts.select().where(...).all();
 * await indexes.vector.search('semantic query');
 * ```
 *
 * @example
 * ```typescript
 * const blogWorkspace = defineWorkspace({
 *   id: 'blog-uuid',
 *
 *   tables: {
 *     posts: {
 *       id: id(),
 *       title: text(),
 *       content: richText({ nullable: true }),
 *       category: select({ options: ['tech', 'personal'] as const }),
 *       views: integer({ default: 0 }),
 *     }
 *   },
 *
 *   indexes: ({ ydoc, tableSchemas }) => ({
 *     sqlite: createSQLiteIndex({ ydoc, tableSchemas }),
 *     markdown: createMarkdownIndex({ ydoc, tableSchemas, path: './data' }),
 *   }),
 *
 *   methods: ({ tables, indexes }) => ({
 *     getPublishedPosts: defineQuery({
 *       input: z.void(),
 *       handler: async () => {
 *         return indexes.sqlite.posts
 *           .select()
 *           .where(isNotNull(indexes.sqlite.posts.publishedAt))
 *           .all();
 *       }
 *     }),
 *
 *     createPost: defineMutation({
 *       input: z.object({ title: z.string() }),
 *       handler: async ({ title }) => {
 *         return tables.posts.upsert({
 *           id: generateId(),
 *           title,
 *           content: null,
 *           category: 'tech',
 *           views: 0,
 *         });
 *       }
 *     })
 *   })
 * });
 * ```
 */
export function defineWorkspace<
	TId extends string,
	TTableSchemas extends Record<string, TableSchema>,
	TMethodMap extends PluginMethodMap,
	TDeps extends readonly Plugin[] = readonly [],
>(
	plugin: Plugin<TId, TTableSchemas, TMethodMap, TDeps>,
): Plugin<TId, TTableSchemas, TMethodMap, TDeps> {
	// Validate workspace ID
	if (!plugin.id || typeof plugin.id !== 'string') {
		throw new Error(
			`Invalid workspace ID "${plugin.id}". Workspace IDs must be non-empty strings.`,
		);
	}

	// Validate dependencies
	if (plugin.dependencies) {
		for (const dep of plugin.dependencies) {
			if (!dep || typeof dep !== 'object' || !dep.id) {
				throw new Error(
					`Invalid dependency in workspace "${plugin.id}": dependencies must be workspace objects`,
				);
			}
		}
	}

	return plugin;
}

/**
 * @deprecated Use `defineWorkspace` instead. This alias exists for backwards compatibility.
 */
export const definePlugin = defineWorkspace;

/**
 * Plugin/Workspace definition
 */
export type Plugin<
	TId extends string = string,
	TTableSchemas extends Record<string, TableSchema> = Record<
		string,
		TableSchema
	>,
	TMethodMap extends PluginMethodMap = PluginMethodMap,
	TDeps extends readonly Plugin[] = readonly [],
> = {
	/**
	 * Globally unique workspace ID
	 * Used as YJS document GUID
	 */
	id: TId;

	/**
	 * Other workspaces this workspace depends on
	 */
	dependencies?: TDeps;

	/**
	 * Table schemas (column definitions as JSON)
	 */
	tables: TTableSchemas;

	/**
	 * Indexes definition - creates synchronized snapshots for querying
	 * @param context - YJS document, table schemas, and workspace ID
	 * @returns Map of index name → Index instance
	 *
	 * @example
	 * ```typescript
	 * indexes: ({ ydoc, tableSchemas }) => ({
	 *   sqlite: createSQLiteIndex({ ydoc, tableSchemas }),
	 *   markdown: createMarkdownIndex({ ydoc, tableSchemas, path: './data' }),
	 * })
	 * ```
	 */
	indexes: IndexesDefinition;

	/**
	 * Workspace methods - business logic with access to tables and indexes
	 * @param context - Tables (write), indexes (read), and dependency plugins
	 * @returns Map of method name → method implementation
	 *
	 * @example
	 * ```typescript
	 * methods: ({ tables, indexes, plugins }) => ({
	 *   createPost: defineMutation({
	 *     input: z.object({ title: z.string() }),
	 *     handler: async ({ title }) => {
	 *       return tables.posts.upsert({ ... });
	 *     }
	 *   }),
	 *   getPublishedPosts: defineQuery({
	 *     input: z.void(),
	 *     handler: async () => {
	 *       return indexes.sqlite.posts.select().where(...).all();
	 *     }
	 *   })
	 * })
	 * ```
	 */
	methods: (context: PluginMethodContext<TDeps, TTableSchemas>) => TMethodMap;

	/**
	 * Lifecycle hooks (optional)
	 */
	hooks?: {
		beforeInit?: () => Promise<void>;
		afterInit?: () => Promise<void>;
	};
};

/**
 * Context passed to the methods function
 */
export type PluginMethodContext<
	TDeps extends readonly Plugin[] = readonly [],
	TTableSchemas extends Record<string, TableSchema> = Record<
		string,
		TableSchema
	>,
> = {
	/**
	 * Dependency workspaces
	 * Access methods from other workspaces
	 */
	plugins: DependencyPluginsAPI<TDeps>;

	/**
	 * Table helpers for this workspace
	 * Write operations only (upsert, deleteById, etc.)
	 */
	tables: WorkspaceTablesAPI<TTableSchemas>;

	/**
	 * Indexes for this workspace
	 * Read operations (select, search, etc.)
	 */
	indexes: IndexMap;
};

/**
 * Table helper API - write operations to YJS
 */
export type WorkspaceTablesAPI<TTableSchemas extends Record<string, TableSchema>> = {
	[TableName in keyof TTableSchemas]: {
		upsert(
			data: Record<string, any>,
		): Promise<Result<Record<string, any>, VaultOperationError>>;
		deleteById(id: string): Promise<Result<boolean, VaultOperationError>>;
		deleteByIds(ids: string[]): Promise<Result<number, VaultOperationError>>;
	};
};

/**
 * Dependency plugins API - methods from dependency workspaces
 */
type DependencyPluginsAPI<TDeps extends readonly Plugin[]> = {
	[K in TDeps[number]['id']]: TDeps[number] extends Plugin<K>
		? ExtractHandlers<ReturnType<TDeps[number]['methods']>>
		: never;
};

/**
 * Extract handler functions from method map
 */
type ExtractHandlers<T extends PluginMethodMap> = {
	[K in keyof T]: T[K]['handler'];
};
