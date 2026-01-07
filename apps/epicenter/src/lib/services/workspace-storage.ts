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
import { Ok, type Result } from 'wellcrafted/result';

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

export async function ensureWorkspacesDirectory(): Promise<
	Result<void, WorkspaceStorageError>
> {
	try {
		const dirExists = await exists(WORKSPACES_DIR, {
			baseDir: BaseDirectory.AppLocalData,
		});

		if (!dirExists) {
			await mkdir(WORKSPACES_DIR, {
				baseDir: BaseDirectory.AppLocalData,
				recursive: true,
			});
		}

		return Ok(undefined);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to create workspaces directory: ${extractErrorMessage(error)}`,
		});
	}
}

export async function listWorkspaceIds(): Promise<
	Result<string[], WorkspaceStorageError>
> {
	try {
		const initResult = await ensureWorkspacesDirectory();
		if (initResult.error) return initResult;

		const entries = await readDir(WORKSPACES_DIR, {
			baseDir: BaseDirectory.AppLocalData,
		});

		const workspaceIds = entries
			.filter((entry) => !entry.isDirectory && entry.name.endsWith('.json'))
			.map((entry) => entry.name.replace('.json', ''));

		return Ok(workspaceIds);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to list workspaces: ${extractErrorMessage(error)}`,
		});
	}
}

export type WorkspaceSummary = {
	id: string;
	name: string;
};

export async function listWorkspaces(): Promise<
	Result<WorkspaceSummary[], WorkspaceStorageError>
> {
	try {
		const idsResult = await listWorkspaceIds();
		if (idsResult.error) return idsResult;

		const workspaces: WorkspaceSummary[] = [];
		for (const id of idsResult.data) {
			const workspaceResult = await readWorkspace(id);
			if (workspaceResult.error) continue; // Skip corrupted workspaces
			workspaces.push({
				id: workspaceResult.data.id,
				name: workspaceResult.data.name,
			});
		}

		return Ok(workspaces);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to list workspaces: ${extractErrorMessage(error)}`,
		});
	}
}

export async function readWorkspace(
	id: string,
): Promise<Result<WorkspaceFile, WorkspaceStorageError>> {
	try {
		const filename = `${WORKSPACES_DIR}/${id}.json`;
		const contents = await readTextFile(filename, {
			baseDir: BaseDirectory.AppLocalData,
		});
		const workspace = JSON.parse(contents) as WorkspaceFile;
		return Ok(workspace);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to read workspace ${id}: ${extractErrorMessage(error)}`,
		});
	}
}

export async function writeWorkspace(
	workspace: WorkspaceFile,
): Promise<Result<void, WorkspaceStorageError>> {
	try {
		const initResult = await ensureWorkspacesDirectory();
		if (initResult.error) return initResult;

		const filename = `${WORKSPACES_DIR}/${workspace.id}.json`;
		await writeTextFile(filename, JSON.stringify(workspace, null, 2), {
			baseDir: BaseDirectory.AppLocalData,
		});
		return Ok(undefined);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to write workspace ${workspace.id}: ${extractErrorMessage(error)}`,
		});
	}
}

export async function workspaceExists(
	id: string,
): Promise<Result<boolean, WorkspaceStorageError>> {
	try {
		const filename = `${WORKSPACES_DIR}/${id}.json`;
		const fileExists = await exists(filename, {
			baseDir: BaseDirectory.AppLocalData,
		});
		return Ok(fileExists);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to check workspace ${id}: ${extractErrorMessage(error)}`,
		});
	}
}

export async function deleteWorkspace(
	id: string,
): Promise<Result<void, WorkspaceStorageError>> {
	try {
		const filename = `${WORKSPACES_DIR}/${id}.json`;
		await remove(filename, {
			baseDir: BaseDirectory.AppLocalData,
		});
		return Ok(undefined);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to delete workspace ${id}: ${extractErrorMessage(error)}`,
		});
	}
}

export async function openWorkspacesDirectory(): Promise<
	Result<void, WorkspaceStorageError>
> {
	try {
		const initResult = await ensureWorkspacesDirectory();
		if (initResult.error) return initResult;

		const appDataPath = await appLocalDataDir();
		const workspacesPath = await join(appDataPath, WORKSPACES_DIR);

		await revealItemInDir(workspacesPath);
		return Ok(undefined);
	} catch (error) {
		return WorkspaceStorageErr({
			message: `Failed to open workspaces directory: ${extractErrorMessage(error)}`,
		});
	}
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
