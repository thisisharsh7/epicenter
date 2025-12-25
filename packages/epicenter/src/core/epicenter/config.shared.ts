/**
 * Shared epicenter configuration types and validation logic.
 *
 * Platform-specific entry points (config.browser.ts, config.node.ts) extend
 * these base types with platform-appropriate properties.
 */

import type { AnyWorkspaceConfig } from '../workspace';

/**
 * Base epicenter configuration shared across all platforms
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   workspaces: [pages, contentHub, auth],
 * });
 *
 * const client = await createEpicenterClient(epicenter);
 *
 * // Access workspace actions by workspace id
 * await client.pages.createPage({ title: 'Hello' });
 * await client.contentHub.createYouTubePost({ pageId: '1', ... });
 * await client.auth.login({ email: 'user@example.com' });
 * ```
 */
export type EpicenterConfigBase<
	TWorkspaces extends
		readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
> = {
	/**
	 * Array of workspace configurations to compose
	 * Each workspace will be initialized and made available in the client
	 * Workspaces are accessed by their name property
	 *
	 * @example
	 * ```typescript
	 * workspaces: [
	 *   pages,      // name: 'pages'
	 *   contentHub, // name: 'content-hub'
	 *   auth,       // name: 'auth'
	 * ]
	 * ```
	 */
	workspaces: TWorkspaces;
};

/**
 * Validates an epicenter configuration
 * Throws descriptive errors for invalid configurations
 *
 * @param config - Epicenter configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateEpicenterConfig(
	config: EpicenterConfigBase<readonly AnyWorkspaceConfig[]>,
): void {
	// Validate workspaces array
	if (!Array.isArray(config.workspaces)) {
		throw new Error('Workspaces must be an array of workspace configs');
	}

	if (config.workspaces.length === 0) {
		throw new Error('Epicenter must have at least one workspace');
	}

	// Validate each workspace
	for (const workspace of config.workspaces) {
		if (!workspace || typeof workspace !== 'object' || !workspace.id) {
			throw new Error(
				'Invalid workspace: workspaces must be workspace configs with id, schema, indexes, and actions',
			);
		}
	}

	// Check for duplicate workspace IDs
	const ids = config.workspaces.map((ws) => ws.id);
	const uniqueIds = new Set(ids);
	if (uniqueIds.size !== ids.length) {
		const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
		throw new Error(
			`Duplicate workspace IDs detected: ${duplicates.join(', ')}. ` +
				`Each workspace must have a unique ID.`,
		);
	}
}
