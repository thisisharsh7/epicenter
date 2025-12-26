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
import path from 'node:path';
import { loadEpicenterConfig } from './load-config';

describe('loadEpicenterConfig', () => {
	const BASE_TEST_DIR = path.join(import.meta.dir, '.data/load-config-test');
	let testDir: string;

	beforeEach(async () => {
		// Create unique test directory for each test
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
		// Clean up the base test directory
		if (existsSync(BASE_TEST_DIR)) {
			await rm(BASE_TEST_DIR, { recursive: true, force: true });
		}
	});

	test('throws error when no config file found', async () => {
		const nonExistentDir = `/tmp/nonexistent-epicenter-test-dir-${Date.now()}`;

		await expect(loadEpicenterConfig(nonExistentDir)).rejects.toThrow(
			/No epicenter config file found/,
		);
	});

	test('throws error when config is not an array', async () => {
		const configPath = path.join(testDir, 'epicenter.config.js');
		await writeFile(configPath, `module.exports = { workspaces: [] };`);

		await expect(loadEpicenterConfig(testDir)).rejects.toThrow(
			/must export an array/,
		);
	});

	test('throws error when config is object instead of array', async () => {
		const configPath = path.join(testDir, 'epicenter.config.js');
		await writeFile(configPath, `module.exports = { id: 'test' };`);

		await expect(loadEpicenterConfig(testDir)).rejects.toThrow(
			/must export an array/,
		);
	});

	test('loads config from epicenter.config.ts', async () => {
		const configPath = path.join(testDir, 'epicenter.config.js');
		await writeFile(
			configPath,
			`module.exports = [{ id: 'test-workspace', exports: () => ({}) }];`,
		);

		const result = await loadEpicenterConfig(testDir);
		expect(Array.isArray(result.workspaces)).toBe(true);
		expect(result.workspaces[0]!.id).toBe('test-workspace');
		expect(result.configPath).toBe(configPath);
	});

	test('loads config with ES module syntax', async () => {
		const configPath = path.join(testDir, 'epicenter.config.mjs');
		await writeFile(
			configPath,
			`export default [{ id: 'esm-workspace', exports: () => ({}) }];`,
		);

		const result = await loadEpicenterConfig(testDir);
		expect(result.workspaces[0]!.id).toBe('esm-workspace');
	});

	test('prefers .ts over other extensions when multiple exist', async () => {
		await writeFile(
			path.join(testDir, 'epicenter.config.ts'),
			`module.exports = [{ id: 'ts-workspace', exports: () => ({}) }];`,
		);
		await writeFile(
			path.join(testDir, 'epicenter.config.js'),
			`module.exports = [{ id: 'js-workspace', exports: () => ({}) }];`,
		);

		const result = await loadEpicenterConfig(testDir);
		expect(result.workspaces[0]!.id).toBe('ts-workspace');
	});
});
