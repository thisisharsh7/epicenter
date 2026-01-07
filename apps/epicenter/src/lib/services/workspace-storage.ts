import type { WorkspaceSchema } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import {
	BaseDirectory,
	exists,
	mkdir,
	readDir,
	readTextFile,
	remove,
	writeTextFile,
} from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync } from 'wellcrafted/result';

const WORKSPACES_DIR = 'workspaces';

/**
 * A workspace file stored on disk.
 * Uses the same shape as `WorkspaceSchema` from @epicenter/hq so it can be
 * passed directly to `defineWorkspace()`.
 */
export type WorkspaceFile = WorkspaceSchema;

export const { WorkspaceStorageError, WorkspaceStorageErr } = createTaggedError(
	'WorkspaceStorageError',
);
export type WorkspaceStorageError = ReturnType<typeof WorkspaceStorageError>;

export function ensureWorkspacesDirectory(): Promise<
	Result<void, WorkspaceStorageError>
> {
	return tryAsync({
		try: async () => {
			const dirExists = await exists(WORKSPACES_DIR, {
				baseDir: BaseDirectory.AppLocalData,
			});

			if (!dirExists) {
				await mkdir(WORKSPACES_DIR, {
					baseDir: BaseDirectory.AppLocalData,
					recursive: true,
				});
			}
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to create workspaces directory: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function listWorkspaceIds(): Promise<
	Result<string[], WorkspaceStorageError>
> {
	const initResult = await ensureWorkspacesDirectory();
	if (initResult.error) return initResult;

	return tryAsync({
		try: async () => {
			const entries = await readDir(WORKSPACES_DIR, {
				baseDir: BaseDirectory.AppLocalData,
			});

			return entries
				.filter((entry) => !entry.isDirectory && entry.name.endsWith('.json'))
				.map((entry) => entry.name.replace('.json', ''));
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to list workspaces: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function listWorkspaces(): Promise<
	Result<WorkspaceFile[], WorkspaceStorageError>
> {
	const idsResult = await listWorkspaceIds();
	if (idsResult.error) return idsResult;

	const workspaces: WorkspaceFile[] = [];
	for (const id of idsResult.data) {
		const workspaceResult = await readWorkspace(id);
		if (workspaceResult.error) continue; // Skip corrupted workspaces
		workspaces.push(workspaceResult.data);
	}

	return Ok(workspaces);
}

export async function readWorkspace(
	id: string,
): Promise<Result<WorkspaceFile, WorkspaceStorageError>> {
	return tryAsync({
		try: async () => {
			const filename = await join(WORKSPACES_DIR, `${id}.json`);
			const contents = await readTextFile(filename, {
				baseDir: BaseDirectory.AppLocalData,
			});
			return JSON.parse(contents) as WorkspaceFile;
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to read workspace ${id}: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function writeWorkspace(
	workspace: WorkspaceFile,
): Promise<Result<void, WorkspaceStorageError>> {
	const initResult = await ensureWorkspacesDirectory();
	if (initResult.error) return initResult;

	return tryAsync({
		try: async () => {
			const filename = await join(WORKSPACES_DIR, `${workspace.id}.json`);
			await writeTextFile(filename, JSON.stringify(workspace, null, 2), {
				baseDir: BaseDirectory.AppLocalData,
			});
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to write workspace ${workspace.id}: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function workspaceExists(
	id: string,
): Promise<Result<boolean, WorkspaceStorageError>> {
	return tryAsync({
		try: async () => {
			const filename = await join(WORKSPACES_DIR, `${id}.json`);
			return exists(filename, {
				baseDir: BaseDirectory.AppLocalData,
			});
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to check workspace ${id}: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function deleteWorkspace(
	id: string,
): Promise<Result<void, WorkspaceStorageError>> {
	return tryAsync({
		try: async () => {
			const filename = await join(WORKSPACES_DIR, `${id}.json`);
			await remove(filename, {
				baseDir: BaseDirectory.AppLocalData,
			});
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to delete workspace ${id}: ${extractErrorMessage(error)}`,
			}),
	});
}

export async function openWorkspacesDirectory(): Promise<
	Result<void, WorkspaceStorageError>
> {
	const initResult = await ensureWorkspacesDirectory();
	if (initResult.error) return initResult;

	return tryAsync({
		try: async () => {
			const appDataPath = await appLocalDataDir();
			const workspacesPath = await join(appDataPath, WORKSPACES_DIR);
			await revealItemInDir(workspacesPath);
		},
		catch: (error) =>
			WorkspaceStorageErr({
				message: `Failed to open workspaces directory: ${extractErrorMessage(error)}`,
			}),
	});
}

export const workspaceStorage = {
	ensureWorkspacesDirectory,
	listWorkspaceIds,
	listWorkspaces,
	readWorkspace,
	writeWorkspace,
	workspaceExists,
	deleteWorkspace,
	openWorkspacesDirectory,
};
