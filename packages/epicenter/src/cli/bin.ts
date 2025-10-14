#!/usr/bin/env bun

import { loadEpicenterConfig } from './load-config';
import { createCLI } from './create-cli';

/**
 * CLI entry point
 * Loads the epicenter config and creates the CLI
 */
async function main() {
	try {
		// Load the config from the current directory
		const config = await loadEpicenterConfig();

		// Create and run the CLI
		const cli = createCLI(config);
		await cli.parse();
	} catch (error) {
		if (error instanceof Error) {
			console.error('Error:', error.message);
		} else {
			console.error('Unknown error:', error);
		}
		process.exit(1);
	}
}

main();
