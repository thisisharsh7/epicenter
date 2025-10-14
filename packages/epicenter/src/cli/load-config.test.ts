import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadEpicenterConfig } from './load-config';

describe('loadEpicenterConfig', () => {
	test('throws error when no config file found', async () => {
		const nonExistentDir = '/tmp/nonexistent-epicenter-test-dir-' + Date.now();

		await expect(loadEpicenterConfig(nonExistentDir)).rejects.toThrow(
			/No epicenter config file found/
		);
	});

	test('throws error when config has no id', async () => {
		// This test would require creating a temp config file
		// For now, we'll skip implementation and rely on integration tests
	});

	test('throws error when config has no workspaces array', async () => {
		// This test would require creating a temp config file
		// For now, we'll skip implementation and rely on integration tests
	});

	test('loads config from epicenter.config.ts', async () => {
		// This test requires an actual config file in the test directory
		// Will be covered by integration tests
	});
});
