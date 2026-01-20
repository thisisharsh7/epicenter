import type { WorkspaceDefinition } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';

/**
 * Read a workspace definition from the epoch folder.
 *
 * @deprecated Use the fluent API instead:
 * ```typescript
 * const client = registry.head(workspaceId).client();
 * await client.whenSynced;
 * const definition = client.getDefinition();
 * ```
 *
 * This function reads from definition.json on disk, which creates a
 * chicken-and-egg problem: the file is written by persistence, but
 * persistence only runs after createClient(). The fluent API reads
 * directly from the Y.Doc, eliminating this dependency.
 *
 * The definition file is stored at:
 * `{appLocalDataDir}/workspaces/{workspaceId}/{epoch}/definition.json`
 *
 * @param workspaceId - The workspace ID (folder name)
 * @param epoch - The epoch number (determines which folder to read from)
 * @returns The parsed WorkspaceDefinition, or null if file doesn't exist
 */
export async function readDefinition(
	workspaceId: string,
	epoch: number,
): Promise<WorkspaceDefinition | null> {
	try {
		const baseDir = await appLocalDataDir();
		const filePath = await join(
			baseDir,
			'workspaces',
			workspaceId,
			epoch.toString(),
			'definition.json',
		);
		const content = await readFile(filePath);
		const json = new TextDecoder().decode(content);

		// The unified persistence writes WorkspaceDefinitionMap (from Y.Doc),
		// which has the same shape as WorkspaceDefinition but without the id field.
		// We need to add the id back.
		const parsed = JSON.parse(json) as Omit<WorkspaceDefinition, 'id'>;
		return {
			id: workspaceId,
			...parsed,
		} as WorkspaceDefinition;
	} catch {
		// File doesn't exist or couldn't be read
		return null;
	}
}

/**
 * Check if a definition.json file exists for a workspace at a specific epoch.
 *
 * @deprecated Use the fluent API to check if a workspace can be loaded.
 * This function is no longer needed with the Y.Doc-first architecture.
 *
 * @param workspaceId - The workspace ID (folder name)
 * @param epoch - The epoch number
 * @returns true if the file exists, false otherwise
 */
export async function hasDefinition(
	workspaceId: string,
	epoch: number,
): Promise<boolean> {
	const definition = await readDefinition(workspaceId, epoch);
	return definition !== null;
}
