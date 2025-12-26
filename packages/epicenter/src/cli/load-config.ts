import { resolve } from 'node:path';
import type { AnyWorkspaceConfig } from '../core/workspace';

/**
 * Load the epicenter configuration from the specified directory.
 * Looks for epicenter.config.ts or epicenter.config.js.
 *
 * The config file should export an array of workspace configurations.
 *
 * @param configDir - Directory containing epicenter.config.ts
 * @returns Object containing workspaces array and config file path
 * @throws Error if no config file is found or if the config is invalid
 */
export async function loadEpicenterConfig(configDir: string): Promise<{
	workspaces: readonly AnyWorkspaceConfig[];
	configPath: string;
}> {
	const configFiles = [
		'epicenter.config.ts',
		'epicenter.config.js',
		'epicenter.config.mjs',
		'epicenter.config.cjs',
	];

	let configPath: string | null = null;
	for (const fileName of configFiles) {
		const filePath = resolve(configDir, fileName);
		const file = Bun.file(filePath);
		if (await file.exists()) {
			configPath = filePath;
			break;
		}
	}

	if (!configPath) {
		throw new Error(
			`No epicenter config file found in ${configDir}.\n` +
				`Expected one of: ${configFiles.join(', ')}`,
		);
	}

	try {
		const configModule = await import(configPath);
		const config = configModule.default || configModule;

		if (!Array.isArray(config)) {
			throw new Error(
				'Epicenter config must export an array of workspace configurations',
			);
		}

		return { workspaces: config, configPath };
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(
				`Failed to load epicenter config from ${configPath}: ${error.message}`,
			);
		}
		throw error;
	}
}
