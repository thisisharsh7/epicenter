import type { WorkspaceActionMap } from '../actions';
import type { AnyWorkspaceConfig } from './config';

/**
 * Workspace client instance returned from createWorkspaceClient
 * Contains callable actions and lifecycle management
 */
export type WorkspaceClient<TActionMap extends WorkspaceActionMap> = TActionMap & {
	/**
	 * Cleanup method for resource management
	 * - Destroys all indexes
	 * - Destroys the YJS document
	 */
	destroy: () => void;
};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace name.
 *
 * @example
 * ```typescript
 * // Given configs:
 * const workspaceA = defineWorkspace({ name: 'workspaceA', actions: () => ({ foo: ... }) })
 * const workspaceB = defineWorkspace({ name: 'workspaceB', actions: () => ({ bar: ... }) })
 *
 * // WorkspacesToClients<[typeof workspaceA, typeof workspaceB]> produces:
 * {
 *   workspaceA: WorkspaceClient<{ foo: ... }>,
 *   workspaceB: WorkspaceClient<{ bar: ... }>
 * }
 * ```
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { name: infer TName extends string }
		? TName
		: never]: W extends {
		actions: (context: any) => infer TActionMap extends WorkspaceActionMap;
	}
		? WorkspaceClient<TActionMap>
		: never;
};

/**
 * Maps an array of workspace configs to an object of ActionMaps keyed by workspace name.
 * 
 * Takes an array of workspace dependencies and merges them into a single object where:
 * - Each key is a dependency name
 * - Each value is the action map exported from that dependency
 *
 * This allows accessing dependency actions as `workspaces.dependencyName.actionName()`.
 *
 * @example
 * ```typescript
 * // Given dependency configs:
 * const authWorkspace = defineWorkspace({ name: 'auth', actions: () => ({ login: ..., logout: ... }) })
 * const storageWorkspace = defineWorkspace({ name: 'storage', actions: () => ({ upload: ..., download: ... }) })
 *
 * // WorkspacesToActionMaps<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: { login: ..., logout: ... },
 *   storage: { upload: ..., download: ... }
 * }
 * ```
 */
export type WorkspacesToActionMaps<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { name: infer TName extends string }
		? TName
		: never]: W extends {
		actions: (context: any) => infer TActionMap extends WorkspaceActionMap;
	}
		? TActionMap
		: never;
};