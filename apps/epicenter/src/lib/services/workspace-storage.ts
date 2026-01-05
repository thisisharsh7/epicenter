import { appLocalDataDir } from '@tauri-apps/api/path';
import {
	BaseDirectory,
	exists,
	mkdir,
	readDir,
	readTextFile,
	writeTextFile,
} from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { Err, Ok, type Result } from 'wellcrafted/result';

const WORKSPACES_DIR = 'workspaces';

export type WorkspaceFile = {
	id: string;
	name: string;
	tables: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
};

export type WorkspaceStorageError = {
	_tag: 'WorkspaceStorageError';
	message: string;
	cause?: unknown;
};

function WorkspaceStorageError(
	message: string,
	cause?: unknown,
): WorkspaceStorageError {
	return { _tag: 'WorkspaceStorageError', message, cause };
}

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
		return Err(
			WorkspaceStorageError('Failed to create workspaces directory', error),
		);
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
		return Err(WorkspaceStorageError('Failed to list workspaces', error));
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
		return Err(WorkspaceStorageError('Failed to list workspaces', error));
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
		return Err(WorkspaceStorageError(`Failed to read workspace ${id}`, error));
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
		return Err(
			WorkspaceStorageError(`Failed to write workspace ${workspace.id}`, error),
		);
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
		return Err(WorkspaceStorageError(`Failed to check workspace ${id}`, error));
	}
}

export async function openWorkspacesDirectory(): Promise<
	Result<void, WorkspaceStorageError>
> {
	try {
		const initResult = await ensureWorkspacesDirectory();
		if (initResult.error) return initResult;

		const appDataPath = await appLocalDataDir();
		const workspacesPath = `${appDataPath}${WORKSPACES_DIR}`;

		await revealItemInDir(workspacesPath);
		return Ok(undefined);
	} catch (error) {
		return Err(
			WorkspaceStorageError('Failed to open workspaces directory', error),
		);
	}
}

export const workspaceStorage = {
	ensureWorkspacesDirectory,
	listWorkspaceIds,
	listWorkspaces,
	readWorkspace,
	writeWorkspace,
	workspaceExists,
	openWorkspacesDirectory,
};
