import type { WorkspaceDefinition } from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';

/**
 * Read a workspace definition from definition.json.
 *
 * The definition file is stored at:
 * `{appLocalDataDir}/workspaces/{workspaceId}/definition.json`
 *
 * @param workspaceId - The workspace ID (folder name)
 * @returns The parsed WorkspaceDefinition, or null if file doesn't exist
 *
 * @example
 * ```typescript
 * const definition = await readDefinition('epicenter.whispering');
 * if (definition) {
 *   console.log(definition.name); // "Whispering"
 * }
 * ```
 */
export async function readDefinition(
	workspaceId: string,
): Promise<WorkspaceDefinition | null> {
	try {
		const baseDir = await appLocalDataDir();
		const filePath = await join(
			baseDir,
			'workspaces',
			workspaceId,
			'definition.json',
		);
		const content = await readFile(filePath);
		const json = new TextDecoder().decode(content);
		return JSON.parse(json) as WorkspaceDefinition;
	} catch {
		// File doesn't exist or couldn't be read
		return null;
	}
}

/**
 * Write a workspace definition to definition.json.
 *
 * Creates the parent directory if it doesn't exist.
 * The file is stored at:
 * `{appLocalDataDir}/workspaces/{workspaceId}/definition.json`
 *
 * @param workspaceId - The workspace ID (folder name)
 * @param definition - The WorkspaceDefinition to save
 *
 * @example
 * ```typescript
 * await writeDefinition('epicenter.whispering', {
 *   id: 'epicenter.whispering',
 *   name: 'Whispering',
 *   tables: { ... },
 *   kv: {},
 * });
 * ```
 */
export async function writeDefinition(
	workspaceId: string,
	definition: WorkspaceDefinition,
): Promise<void> {
	const baseDir = await appLocalDataDir();
	const filePath = await join(
		baseDir,
		'workspaces',
		workspaceId,
		'definition.json',
	);

	// Ensure parent directory exists
	const parentDir = await dirname(filePath);
	await mkdir(parentDir, { recursive: true }).catch(() => {
		// Directory might already exist - that's fine
	});

	// Write definition as pretty-printed JSON
	const content = JSON.stringify(definition, null, '\t');
	await writeFile(filePath, new TextEncoder().encode(content));

	console.log(
		`[Definition] Saved definition.json for workspace "${workspaceId}"`,
	);
}

/**
 * Check if a definition.json file exists for a workspace.
 *
 * @param workspaceId - The workspace ID (folder name)
 * @returns true if the file exists, false otherwise
 */
export async function hasDefinition(workspaceId: string): Promise<boolean> {
	const definition = await readDefinition(workspaceId);
	return definition !== null;
}
