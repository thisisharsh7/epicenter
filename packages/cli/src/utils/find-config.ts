import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Finds the epicenter.config.ts file in the current working directory
 */
export function findConfig(): string | null {
	const cwd = process.cwd();
	const possiblePaths = [
		resolve(cwd, 'epicenter.config.ts'),
		resolve(cwd, 'epicenter.config.js'),
		resolve(cwd, 'epicenter.config.mjs'),
	];

	for (const path of possiblePaths) {
		if (existsSync(path)) {
			return path;
		}
	}

	return null;
}
