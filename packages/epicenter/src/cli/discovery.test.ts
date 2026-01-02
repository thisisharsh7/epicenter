import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectDir } from '../core/types';
import { findProjectDir, loadWorkspaces } from './discovery';

describe('findProjectDir', () => {
	const BASE_TEST_DIR = path.join(tmpdir(), 'epicenter-discovery-test');
	let testDir: string;

	beforeEach(async () => {
		testDir = path.join(
			BASE_TEST_DIR,
			`test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		if (existsSync(testDir)) {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	afterAll(async () => {
		if (existsSync(BASE_TEST_DIR)) {
			await rm(BASE_TEST_DIR, { recursive: true, force: true });
		}
	});

	test('returns null when no .epicenter folder found', async () => {
		const result = await findProjectDir(testDir);
		expect(result).toBe(null);
	});

	test('finds .epicenter in current directory', async () => {
		await mkdir(path.join(testDir, '.epicenter'));

		const result = await findProjectDir(testDir);
		expect(result).toBe(testDir as ProjectDir);
	});

	test('walks up to find .epicenter in parent', async () => {
		const subDir = path.join(testDir, 'nested', 'deep', 'folder');
		await mkdir(subDir, { recursive: true });
		await mkdir(path.join(testDir, '.epicenter'));

		const result = await findProjectDir(subDir);
		expect(result).toBe(testDir as ProjectDir);
	});

	test('finds closest .epicenter when nested', async () => {
		const nestedProject = path.join(testDir, 'projects', 'sub-project');
		await mkdir(path.join(testDir, '.epicenter'));
		await mkdir(path.join(nestedProject, '.epicenter'), { recursive: true });

		const result = await findProjectDir(nestedProject);
		expect(result).toBe(nestedProject as ProjectDir);
	});
});

describe('loadWorkspaces', () => {
	const BASE_TEST_DIR = path.join(tmpdir(), 'epicenter-load-workspaces-test');
	let testDir: string;

	beforeEach(async () => {
		testDir = path.join(
			BASE_TEST_DIR,
			`test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(path.join(testDir, '.epicenter', 'workspaces'), {
			recursive: true,
		});
	});

	afterEach(async () => {
		if (existsSync(testDir)) {
			await rm(testDir, { recursive: true, force: true });
		}
	});

	afterAll(async () => {
		if (existsSync(BASE_TEST_DIR)) {
			await rm(BASE_TEST_DIR, { recursive: true, force: true });
		}
	});

	test('throws error when workspaces directory does not exist', async () => {
		const emptyDir = path.join(testDir, 'empty');
		await mkdir(path.join(emptyDir, '.epicenter'), { recursive: true });

		await expect(loadWorkspaces(emptyDir as ProjectDir)).rejects.toThrow(
			/No workspaces directory found/,
		);
	});

	test('throws error when no workspace files found', async () => {
		await expect(loadWorkspaces(testDir as ProjectDir)).rejects.toThrow(
			/No workspace files found/,
		);
	});

	test('throws error for invalid workspace export', async () => {
		const workspacePath = path.join(
			testDir,
			'.epicenter',
			'workspaces',
			'invalid.workspace.ts',
		);
		await writeFile(workspacePath, `export default { notAWorkspace: true };`);

		await expect(loadWorkspaces(testDir as ProjectDir)).rejects.toThrow(
			/Invalid workspace file/,
		);
	});

	test('loads valid workspace from .workspace.ts file', async () => {
		const workspacePath = path.join(
			testDir,
			'.epicenter',
			'workspaces',
			'pages.workspace.ts',
		);
		await writeFile(
			workspacePath,
			`export default { id: 'pages', tables: {}, actions: () => ({}) };`,
		);

		const result = await loadWorkspaces(testDir as ProjectDir);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe('pages');
	});

	test('loads multiple workspace files', async () => {
		const workspacesDir = path.join(testDir, '.epicenter', 'workspaces');
		await writeFile(
			path.join(workspacesDir, 'pages.workspace.ts'),
			`export default { id: 'pages', tables: {}, actions: () => ({}) };`,
		);
		await writeFile(
			path.join(workspacesDir, 'auth.workspace.ts'),
			`export default { id: 'auth', tables: {}, actions: () => ({}) };`,
		);

		const result = await loadWorkspaces(testDir as ProjectDir);
		expect(result).toHaveLength(2);
		const ids = result.map((w) => w.id).sort();
		expect(ids).toEqual(['auth', 'pages']);
	});

	test('ignores non-.workspace.ts files', async () => {
		const workspacesDir = path.join(testDir, '.epicenter', 'workspaces');
		await writeFile(
			path.join(workspacesDir, 'pages.workspace.ts'),
			`export default { id: 'pages', tables: {}, actions: () => ({}) };`,
		);
		await writeFile(
			path.join(workspacesDir, 'utils.ts'),
			`export const helper = () => {};`,
		);
		await writeFile(path.join(workspacesDir, 'README.md'), `# Workspaces`);

		const result = await loadWorkspaces(testDir as ProjectDir);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe('pages');
	});
});
