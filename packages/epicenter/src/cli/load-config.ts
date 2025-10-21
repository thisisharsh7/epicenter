import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EpicenterConfig } from '../core/workspace';

/**
 * Load the epicenter configuration from the current directory
 * Looks for epicenter.config.ts or epicenter.config.js
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @returns The epicenter configuration
 * @throws Error if no config file is found or if the config is invalid
 */
export async function loadEpicenterConfig(
	cwd: string = process.cwd(),
): Promise<EpicenterConfig> {
	// Try different config file extensions
	const configFiles = [
		'epicenter.config.ts',
		'epicenter.config.js',
		'epicenter.config.mjs',
		'epicenter.config.cjs',
	];

	let configPath: string | null = null;
	for (const fileName of configFiles) {
		const filePath = resolve(cwd, fileName);
		if (existsSync(filePath)) {
			configPath = filePath;
			break;
		}
	}

	if (!configPath) {
		throw new Error(
			`No epicenter config file found in ${cwd}.\n` +
				`Expected one of: ${configFiles.join(', ')}`,
		);
	}

	// Dynamically import the config file
	try {
		const configModule = await import(configPath);
		const config = configModule.default || configModule;

		// Validate the config has required properties
		if (!config.id || typeof config.id !== 'string') {
			throw new Error('Epicenter config must have a valid string id');
		}

		if (!Array.isArray(config.workspaces)) {
			throw new Error('Epicenter config must have a workspaces array');
		}

		return config;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to load epicenter config from ${configPath}: ${error.message}`);
		}
		throw error;
	}
}
