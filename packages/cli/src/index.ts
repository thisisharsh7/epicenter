#!/usr/bin/env bun

import { loadEpicenterConfig, generateCLI } from '@epicenter/hq/cli';

/**
 * Epicenter CLI entry point
 * Loads config and generates CLI with serve and workspace action commands
 */
async function main() {
	try {
		// Load epicenter.config.ts from current directory
		const config = await loadEpicenterConfig();

		// Generate and run CLI
		const cli = generateCLI(config);
		await cli.parse();
	} catch (error) {
		if (error instanceof Error) {
			console.error('❌ Error:', error.message);
		} else {
			console.error('❌ Unknown error:', error);
		}
		process.exit(1);
	}
}

main();
