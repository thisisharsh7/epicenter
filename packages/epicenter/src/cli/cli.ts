import yargs from 'yargs';
import type { AnyWorkspaceConfig, EpicenterClient } from '../core/workspace';
import type { WorkspaceClientInternals } from '../core/workspace/client.shared';
import { createServer, DEFAULT_PORT } from '../server/server';
import { standardJsonSchemaToYargs } from './standard-json-schema-to-yargs';

export function createCLI<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(client: EpicenterClient<TWorkspaces>) {
	let cli = yargs()
		.scriptName('epicenter')
		.usage('Usage: $0 [command] [options]')
		.help()
		.version()
		.strict();

	cli = cli.command(
		'$0',
		'Start HTTP server with REST and MCP endpoints',
		(yargs) => {
			return yargs.option('port', {
				type: 'number',
				description: 'Port to run the server on',
				default: DEFAULT_PORT,
			});
		},
		(argv) => {
			createServer(client).start({ port: argv.port });
		},
	);

	for (const [workspaceId, workspaceClient] of Object.entries(
		client.$workspaces,
	)) {
		const typedClient = workspaceClient as WorkspaceClientInternals;

		cli = cli.command(
			workspaceId,
			`Commands for ${workspaceId} workspace`,
			(yargs) => {
				let workspaceCli = yargs
					.usage(`Usage: $0 ${workspaceId} <action> [options]`)
					.demandCommand(1, 'You must specify an action')
					.strict();

				for (const { actionPath, action } of typedClient.$actions) {
					const actionName = actionPath.join('_');
					workspaceCli = workspaceCli.command(
						actionName,
						action.description || `Execute ${actionName} ${action.type}`,
						(yargs) => {
							if ('input' in action && action.input) {
								return standardJsonSchemaToYargs(action.input, yargs);
							}
							return yargs;
						},
						async () => {
							console.error(`❌ Action execution not available: ${actionName}`);
							console.error(
								'   Handlers are bound via .withHandlers() which is not yet implemented.',
							);
							console.error(
								'   See: specs/20260101T014845-contract-handler-separation.md',
							);
							process.exit(1);
						},
					);
				}

				return workspaceCli;
			},
		);
	}

	return {
		async run(argv: string[]) {
			const cleanup = async () => {
				await client.destroy();
				process.exit(0);
			};
			process.on('SIGINT', cleanup);
			process.on('SIGTERM', cleanup);

			try {
				await cli.parse(argv);
			} finally {
				process.off('SIGINT', cleanup);
				process.off('SIGTERM', cleanup);
				await client.destroy();
			}
		},
	};
}
