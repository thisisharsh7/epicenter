#!/usr/bin/env bun

import { Ok, tryAsync } from 'wellcrafted/result';
import { hideBin } from 'yargs/helpers';
import { createCLI } from './cli';
import { loadEpicenterConfig } from './load-config';

/**
 * CLI entry point
 * Loads the epicenter config and creates the CLI
 */
async function main() {
	await tryAsync({
		try: async () => {
			const config = await loadEpicenterConfig(process.cwd());

			// Create and run the CLI
			const cli = await createCLI({ config, argv: hideBin(process.argv) });
			await cli.parse();
		},
		catch: (error) => {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('Unknown error:', error);
			}
			process.exit(1);
			return Ok(undefined);
		},
	});
}

main();
