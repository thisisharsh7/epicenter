import { stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { Glob } from 'bun';
import type { AbsolutePath, ProjectDir } from '../core/types';
import type { AnyWorkspaceConfig } from '../core/workspace';

/**
 * Walks up the directory tree from `startDir` to find a `.epicenter/` folder.
 * Returns the parent directory of `.epicenter/` (the project root), or null if not found.
 *
 * @param startDir - Directory to start searching from (defaults to `process.cwd()`)
 * @returns The project directory containing `.epicenter/`, or null if none found
 *
 * @example
 * ```
 * // Given: ~/projects/blog/.epicenter/workspaces/
 * // Running from: ~/projects/blog/vault/posts/
 *
 * const projectDir = await findProjectDir();
 * // Returns: ~/projects/blog
 * ```
 */
export async function findProjectDir(
	startDir: string = process.cwd(),
): Promise<ProjectDir | null> {
	let current = resolve(startDir);
	const root = parse(current).root;

	while (current !== root) {
		const epicenterPath = join(current, '.epicenter');

		if (await directoryExists(epicenterPath)) {
			return current as ProjectDir;
		}

		current = dirname(current);
	}

	return null;
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		const stats = await stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Loads all workspace configurations from `.epicenter/workspaces/*.workspace.ts`.
 * Dynamically imports each file and validates it exports a valid workspace config.
 *
 * @param projectDir - The project root directory (parent of `.epicenter/`)
 * @returns Array of workspace configurations
 * @throws Error if workspaces directory doesn't exist, no workspace files found, or invalid exports
 *
 * @example
 * ```
 * const projectDir = await findProjectDir();
 * if (!projectDir) throw new Error('No .epicenter folder found');
 *
 * const workspaces = await loadWorkspaces(projectDir);
 * // Returns: [{ id: 'pages', tables: {...}, ... }, { id: 'blog', ... }]
 * ```
 */
export async function loadWorkspaces(
	projectDir: ProjectDir,
): Promise<AnyWorkspaceConfig[]> {
	const workspacesDir = join(
		projectDir,
		'.epicenter',
		'workspaces',
	) as AbsolutePath;

	if (!(await directoryExists(workspacesDir))) {
		throw new Error(
			`No workspaces directory found at ${workspacesDir}\n` +
				`Create workspace files at .epicenter/workspaces/*.workspace.ts`,
		);
	}

	const glob = new Glob('*.workspace.ts');
	const workspaces: AnyWorkspaceConfig[] = [];

	for await (const file of glob.scan({ cwd: workspacesDir, absolute: true })) {
		const module = await import(file);
		const workspace = module.default ?? module;

		if (!isWorkspaceConfig(workspace)) {
			throw new Error(
				`Invalid workspace file: ${file}\n` +
					`Expected default export to be a workspace config (from defineWorkspace())`,
			);
		}

		workspaces.push(workspace);
	}

	if (workspaces.length === 0) {
		throw new Error(
			`No workspace files found in ${workspacesDir}\n` +
				`Expected files matching *.workspace.ts`,
		);
	}

	return workspaces;
}

/**
 * Type guard to validate an unknown value is a workspace configuration.
 * Checks for required properties: `id` (string) and `tables` (object).
 */
function isWorkspaceConfig(value: unknown): value is AnyWorkspaceConfig {
	return (
		typeof value === 'object' &&
		value !== null &&
		'id' in value &&
		'tables' in value &&
		typeof (value as Record<string, unknown>).id === 'string'
	);
}
