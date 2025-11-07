#!/usr/bin/env bun

import { Ok, tryAsync } from 'wellcrafted/result';
import { hideBin } from 'yargs/helpers';
import { createCLI } from './cli';
import { loadEpicenterConfig } from './load-config';

/**
 * Auto-enable watch mode for hot reloading
 *
 * When users run `epicenter`, automatically spawn with `bun --watch`
 * to enable hot reloading of config and all imported files.
 *
 * This ensures config changes (and workspace/action changes) are
 * picked up automatically without manual restart.
 */
async function enableWatchMode() {
	// Check if already running under watch mode
	if (process.env.EPICENTER_WATCH_MODE) {
		return; // Already in watch mode, proceed normally
	}

	// Spawn ourselves with bun --watch
	const proc = Bun.spawn(
		[
			'bun',
			'--watch',
			process.argv[1], // path to this bin.ts file
			...process.argv.slice(2), // preserve CLI args
		],
		{
			env: {
				...process.env,
				EPICENTER_WATCH_MODE: '1', // prevent infinite loop
			},
			stdio: ['inherit', 'inherit', 'inherit'],
		},
	);

	// Wait for child process and exit with its code
	await proc.exited;
	process.exit(proc.exitCode ?? 0);
}

/**
 * CLI entry point
 * Loads the epicenter config and creates the CLI
 */
async function main() {
	// Enable automatic watch mode
	await enableWatchMode();

	// Normal execution (running under bun --watch)
	await tryAsync({
		try: async () => {
			const { config } = await loadEpicenterConfig(process.cwd());

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
