import yargs from 'yargs';
import type { WorkspaceClient } from '../core/workspace/contract';
import { createServer, DEFAULT_PORT } from '../server/server';

type AnyWorkspaceClient = WorkspaceClient<string, any, any, any>;

export function createCLI(clients: AnyWorkspaceClient | AnyWorkspaceClient[]) {
	const clientArray = Array.isArray(clients) ? clients : [clients];

	const cli = yargs()
		.scriptName('epicenter')
		.usage('Usage: $0 [options]')
		.help()
		.version()
		.strict()
		.option('port', {
			type: 'number',
			description: 'Port to run the server on',
			default: DEFAULT_PORT,
		})
		.command(
			'$0',
			'Start HTTP server with REST and WebSocket sync endpoints',
			() => {},
			(argv) => {
				createServer(clientArray, { port: argv.port }).start();
			},
		);

	return {
		async run(argv: string[]) {
			const cleanup = async () => {
				for (const client of clientArray) {
					await client.destroy();
				}
				process.exit(0);
			};
			process.on('SIGINT', cleanup);
			process.on('SIGTERM', cleanup);

			try {
				await cli.parse(argv);
			} finally {
				process.off('SIGINT', cleanup);
				process.off('SIGTERM', cleanup);
				for (const client of clientArray) {
					await client.destroy();
				}
			}
		},
	};
}
