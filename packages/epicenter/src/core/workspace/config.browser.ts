/**
 * Browser-specific workspace configuration.
 *
 * Uses browser Provider type which doesn't include filesystem paths.
 */

import type { WorkspaceExports } from '../actions';
import type { Provider } from '../provider.browser';
import type { WorkspaceSchema } from '../schema';
import {
	type AnyWorkspaceConfig,
	type WorkspaceExportsContext,
	validateWorkspaceConfig,
} from './config.shared';

// Re-export shared types
export type { AnyWorkspaceConfig, WorkspacesToExports } from './config.shared';

/**
 * Define a collaborative workspace with YJS-first architecture.
 *
 * ## What is a Workspace?
 *
 * A workspace is a self-contained domain module that gets composed into an Epicenter.
 * When you create an Epicenter client, each workspace becomes a property on that client:
 *
 * ```typescript
 * const blogWorkspace = defineWorkspace({ id: 'blog', ... });
 * const authWorkspace = defineWorkspace({ id: 'auth', ... });
 *
 * const epicenter = createWorkspaceClient(blogWorkspace);
 *
 * // Each workspace is accessible by its id:
 * epicenter.createPost(...)  // blogWorkspace exports
 * ```
 *
 * ## Browser-Specific Notes
 *
 * In browser environments, providers don't have access to filesystem paths.
 * Use browser-native storage APIs like IndexedDB for persistence.
 *
 * @see defineWorkspace in config.node.ts for Node/Bun-specific version
 */
export function defineWorkspace<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviders extends Record<string, Provider<TWorkspaceSchema>>,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviders, TExports>,
): WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviders, TExports> {
	validateWorkspaceConfig(workspace);
	return workspace;
}

/**
 * Browser workspace configuration.
 *
 * Uses browser Provider type - providers don't have access to filesystem paths.
 *
 * ## Provider Type Inference
 *
 * The `TProviders` type parameter captures the actual provider functions you pass.
 * The `exports` factory receives provider exports derived via `InferProviderExports`:
 * - Provider returns `{ db: Db }` → exports receives `{ db: Db }`
 * - Provider returns `void` → exports receives `Record<string, never>` (empty object)
 * - Provider returns `Promise<{ db: Db }>` → exports receives `{ db: Db }` (unwrapped)
 */
export type WorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
	TId extends string = string,
	TWorkspaceSchema extends WorkspaceSchema = WorkspaceSchema,
	TProviders extends Record<string, Provider<TWorkspaceSchema>> = Record<
		string,
		Provider<TWorkspaceSchema>
	>,
	TExports extends WorkspaceExports = WorkspaceExports,
> = {
	id: TId;
	tables: TWorkspaceSchema;
	dependencies?: TDeps;
	providers: TProviders;
	/**
	 * Factory function that creates workspace exports (actions, utilities, etc.)
	 *
	 * @param context.tables - The workspace tables for direct table operations
	 * @param context.schema - The workspace schema (table definitions)
	 * @param context.validators - Schema validators for runtime validation and arktype composition
	 * @param context.providers - Provider-specific exports (queries, sync operations, etc.)
	 * @param context.workspaces - Exports from dependency workspaces (if any)
	 * @param context.blobs - Blob storage for binary files, namespaced by table
	 */
	exports: (context: WorkspaceExportsContext<TWorkspaceSchema, TDeps, TProviders>) => TExports;
};
