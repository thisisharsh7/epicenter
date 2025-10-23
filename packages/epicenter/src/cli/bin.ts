#!/usr/bin/env bun

import { hideBin } from 'yargs/helpers';
import { loadEpicenterConfig } from './load-config';
import { createCLI } from './cli';

/**
 * CLI entry point
 * Loads the epicenter config and creates the CLI
 */
async function main() {
	try {
		// Load the config from the current directory
		const config = await loadEpicenterConfig();

		// Create and run the CLI
		const cli = await createCLI({ config, argv: hideBin(process.argv) });
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
