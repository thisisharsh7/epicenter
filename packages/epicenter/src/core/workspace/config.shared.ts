/**
 * Shared workspace configuration types and utilities.
 *
 * Platform-specific entry points (config.browser.ts, config.node.ts) extend
 * these with platform-appropriate provider types.
 */

import type { ActionExports } from '../actions';
import type { WorkspaceBlobs } from '../blobs/types';
import type { Tables } from '../db/core';
import type { InferProviderExports, ProviderExports } from '../provider.shared';
import type { WorkspaceSchema, WorkspaceValidators } from '../schema';
import type { WorkspacePaths } from '../types';

/**
 * Minimal workspace constraint for generic bounds.
 * Use this in `extends` clauses to avoid contravariance issues.
 *
 * @example
 * ```typescript
 * function foo<T extends readonly AnyWorkspaceConfig[]>(configs: T) { ... }
 * ```
 */
export type AnyWorkspaceConfig = {
	id: string;
	actions: (context: any) => ActionExports;
};

/**
 * Maps an array of workspace configs to an object of actions keyed by workspace id.
 *
 * Takes an array of workspace dependencies and merges them into a single object where:
 * - Each key is a dependency id
 * - Each value is the actions object from that dependency (queries, mutations, and utilities)
 *
 * This allows accessing dependency actions as `workspaces.dependencyId.actionName()`.
 *
 * @example
 * ```typescript
 * // Given dependency configs:
 * const authWorkspace = defineWorkspace({ id: 'auth', actions: () => ({ login: ..., logout: ..., validateToken: ... }) })
 * const storageWorkspace = defineWorkspace({ id: 'storage', actions: () => ({ upload: ..., download: ..., MAX_FILE_SIZE: ... }) })
 *
 * // WorkspacesToActions<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: { login: ..., logout: ..., validateToken: ... },
 *   storage: { upload: ..., download: ..., MAX_FILE_SIZE: ... }
 * }
 * ```
 */
export type WorkspacesToActions<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		actions: (context: any) => infer TActions extends ActionExports;
	}
		? TActions
		: never;
};

/**
 * Context passed to the workspace exports factory function.
 *
 * @typeParam TWorkspaceSchema - The workspace's table schema
 * @typeParam TDeps - Array of dependency workspace configs
 * @typeParam TProviders - Record of provider functions
 */
export type ActionsContext<
	TWorkspaceSchema extends WorkspaceSchema,
	TDeps extends readonly AnyWorkspaceConfig[],
	TProviders extends Record<
		string,
		(context: any) => ProviderExports | void | Promise<ProviderExports | void>
	>,
> = {
	tables: Tables<TWorkspaceSchema>;
	schema: TWorkspaceSchema;
	validators: WorkspaceValidators<TWorkspaceSchema>;
	workspaces: WorkspacesToActions<TDeps>;
	providers: { [K in keyof TProviders]: InferProviderExports<TProviders[K]> };
	blobs: WorkspaceBlobs<TWorkspaceSchema>;
	paths: WorkspacePaths | undefined;
};

/**
 * Validates a workspace configuration at runtime.
 *
 * @throws Error if workspace ID is invalid or dependencies are malformed
 */
export function validateWorkspaceConfig(workspace: {
	id: unknown;
	dependencies?: unknown;
}) {
	// Validate workspace ID
	if (!workspace.id || typeof workspace.id !== 'string') {
		throw new Error('Workspace must have a valid string ID');
	}

	// Validate dependencies
	if (workspace.dependencies) {
		if (!Array.isArray(workspace.dependencies)) {
			throw new Error('Dependencies must be an array of workspace configs');
		}

		for (const dep of workspace.dependencies) {
			if (!dep || typeof dep !== 'object' || !('id' in dep)) {
				throw new Error(
					'Invalid dependency: dependencies must be workspace configs with id',
				);
			}
		}
	}
}
