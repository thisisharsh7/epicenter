/**
 * Node/Bun-specific workspace configuration.
 *
 * Uses Node Provider type which includes required filesystem paths.
 */

import type { WorkspaceExports } from '../actions';
import type { Provider } from '../provider.node';
import type { WorkspaceSchema } from '../schema';
import {
	type AnyWorkspaceConfig,
	validateWorkspaceConfig,
	type WorkspaceExportsContext,
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
 * const epicenter = await createWorkspaceClient(blogWorkspace);
 *
 * // Each workspace is accessible by its id:
 * epicenter.createPost(...)  // blogWorkspace exports
 * ```
 *
 * ## Node/Bun-Specific Notes
 *
 * In Node/Bun environments, providers have access to filesystem paths:
 * - `storageDir`: Absolute path to the storage directory
 * - `epicenterDir`: Absolute path to `.epicenter` directory for provider data
 *
 * @see defineWorkspace in config.browser.ts for browser-specific version
 */
export function defineWorkspace<
	const TDeps extends readonly AnyWorkspaceConfig[],
	const TId extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	const TProviders extends Record<string, Provider<TWorkspaceSchema>>,
	TExports extends WorkspaceExports,
>(
	workspace: WorkspaceConfig<
		TDeps,
		TId,
		TWorkspaceSchema,
		TProviders,
		TExports
	>,
): WorkspaceConfig<TDeps, TId, TWorkspaceSchema, TProviders, TExports> {
	validateWorkspaceConfig(workspace);
	return workspace;
}

/**
 * Node/Bun workspace configuration.
 *
 * Uses Node Provider type - providers have access to filesystem paths:
 * - `storageDir`: Required storage directory path
 * - `epicenterDir`: Required `.epicenter` directory path
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
	 * @param context.storageDir - Storage directory path (Node/Bun only)
	 * @param context.epicenterDir - `.epicenter` directory path (Node/Bun only)
	 */
	exports: (
		context: WorkspaceExportsContext<TWorkspaceSchema, TDeps, TProviders>,
	) => TExports;
};
