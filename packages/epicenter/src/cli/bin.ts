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

/**
 * Auto-enable watch mode for hot reloading
 *
 * Automatically wraps the epicenter binary with `bun --watch` to enable
 * hot reloading of configuration and all imported dependencies.
 *
 * ## How It Works
 *
 * 1. **First execution**: When the user runs `epicenter`, this function checks
 *    if the `EPICENTER_WATCH_MODE` environment variable is set.
 *
 * 2. **Not in watch mode**: If the env var is not set, the function spawns
 *    a new child process running the same command with `bun --watch`, passing:
 *    - The same CLI arguments (preserved via `process.argv.slice(2)`)
 *    - All environment variables plus `EPICENTER_WATCH_MODE=1`
 *    - Inherited stdio streams (stdin, stdout, stderr)
 *
 * 3. **Child process**: The spawned child runs with `bun --watch`, which:
 *    - Monitors all imported files (config, workspaces, actions, schemas)
 *    - Automatically restarts the process when any watched file changes
 *    - Uses native OS file watchers (kqueue/inotify) for performance
 *
 * 4. **Parent process**: The original parent process waits for the child
 *    to exit and then exits with the same code.
 *
 * 5. **Already in watch mode**: If `EPICENTER_WATCH_MODE` is set, the function
 *    returns immediately, allowing normal execution to continue.
 *
 * ## Why Environment Variable?
 *
 * Using `process.env.EPICENTER_WATCH_MODE` prevents infinite recursion:
 * - Without it, the child would spawn another child, infinitely
 * - The env var acts as a flag: "I'm already running under watch mode"
 * - Simple, reliable, and standard practice for process spawning
 *
 * Environment variables are the simplest and most portable solution for
 * inter-process communication in this use case.
 *
 * @example
 * ```bash
 * # User runs:
 * epicenter
 *
 * # Internally becomes:
 * EPICENTER_WATCH_MODE=1 bun --watch /path/to/bin.ts
 *
 * # Changes to config → Bun restarts → Fresh execution
 * ```
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

main();
