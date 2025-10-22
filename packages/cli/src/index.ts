#!/usr/bin/env bun

import { serve } from './commands/serve';

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args: string[]): {
	port?: number;
	dev?: boolean;
	help?: boolean;
} {
	const options: { port?: number; dev?: boolean; help?: boolean } = {};

	for (const arg of args) {
		if (arg.startsWith('--port=')) {
			options.port = Number.parseInt(arg.split('=')[1]);
		} else if (arg === '--dev') {
			options.dev = true;
		} else if (arg === '--prod' || arg === '--production') {
			options.dev = false;
		} else if (arg === '--help' || arg === '-h') {
			options.help = true;
		}
	}

	return options;
}

function showHelp() {
	console.log(`
Epicenter CLI

USAGE:
  epicenter [command] [options]

COMMANDS:
  serve              Start the HTTP server (default command)

OPTIONS:
  --port=<number>    Port to run the server on (default: 3000)
  --dev              Run in development mode (default)
  --prod             Run in production mode
  --help, -h         Show this help message

EXAMPLES:
  epicenter serve
  epicenter serve --port=8080
  epicenter serve --prod
  bunx @epicenter/cli serve
`);
}

async function main() {
	const options = parseArgs(args);

	if (options.help) {
		showHelp();
		process.exit(0);
	}

	if (!command || command === 'serve') {
		await serve(options);
	} else {
		console.error(`❌ Unknown command: ${command}`);
		console.error('   Run "epicenter --help" for usage information');
		process.exit(1);
	}
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
