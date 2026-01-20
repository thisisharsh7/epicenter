import type { WorkspaceDefinition } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';

/**
 * Read a workspace definition from the epoch folder.
 *
 * The definition file is stored at:
 * `{appLocalDataDir}/workspaces/{workspaceId}/{epoch}/definition.json`
 *
 * This is the canonical location for definitions in the unified persistence
 * architecture. The file is written by `tauriWorkspacePersistence` whenever
 * the Y.Map('definition') changes.
 *
 * @param workspaceId - The workspace ID (folder name)
 * @param epoch - The epoch number (determines which folder to read from)
 * @returns The parsed WorkspaceDefinition, or null if file doesn't exist
 *
 * @example
 * ```typescript
 * const head = createHead(workspaceId);
 * await head.whenSynced;
 * const epoch = head.getEpoch();
 *
 * const definition = await readDefinition(workspaceId, epoch);
 * if (definition) {
 *   console.log(definition.name); // "Whispering"
 * }
 * ```
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
