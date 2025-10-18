import type { EpicenterConfig } from '../core/epicenter';
import type { WorkspaceConfig, AnyWorkspaceConfig } from '../core/workspace/config';
import type { Query, Mutation } from '../core/actions';
import { createMockContext } from './mock-context';

/**
 * Metadata extracted from an action definition.
 */
export type ActionMetadata = {
	name: string;
	type: 'query' | 'mutation';
	inputSchema?: any; // StandardSchemaV1
	description?: string;
};

/**
 * Metadata extracted from a workspace.
 */
export type WorkspaceMetadata = {
	name: string;
	actions: ActionMetadata[];
};

/**
 * Extract metadata from all workspaces in the config.
 * Uses mock context to avoid expensive YJS initialization.
 *
 * This allows CLI introspection without loading YJS docs from disk,
 * making help commands fast (~10-20ms instead of ~100ms+).
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Array of workspace metadata with action details
 *
 * @example
 * ```typescript
 * const metadata = extractWorkspaceMetadata(config);
 *
 * for (const workspace of metadata) {
 *   console.log(`Workspace: ${workspace.name}`);
 *   for (const action of workspace.actions) {
 *     console.log(`  ${action.name} (${action.type})`);
 *   }
 * }
 * ```
 */
export function extractWorkspaceMetadata(config: EpicenterConfig): WorkspaceMetadata[] {
	const metadata: WorkspaceMetadata[] = [];

	for (const workspace of config.workspaces) {
		metadata.push(extractWorkspaceMetadataForWorkspace(workspace));
	}

	return metadata;
}

/**
 * Extract metadata for a single workspace.
 * Uses mock context to avoid expensive initialization.
 *
 * @param workspace - Workspace configuration
 * @returns Workspace metadata with action details
 *
 * @example
 * ```typescript
 * const metadata = extractWorkspaceMetadataForWorkspace(blogWorkspace);
 *
 * console.log(metadata.name); // 'blog'
 * console.log(metadata.actions); // [{ name: 'createPost', type: 'mutation', ... }]
 * ```
 */
export function extractWorkspaceMetadataForWorkspace(
	workspace: AnyWorkspaceConfig,
): WorkspaceMetadata {
	// Create mock context (fast, no YJS loading)
	const mockContext = createMockContext(workspace.schema);

	// Call actions factory with mock context
	const actionMap = workspace.actions(mockContext);

	// Extract metadata from each action
	const actions: ActionMetadata[] = [];
	for (const [name, action] of Object.entries(actionMap)) {
		actions.push({
			name,
			type: action.type,
			inputSchema: action.input,
			description: action.description,
		});
	}

	return {
		name: workspace.name,
		actions,
	};
}
