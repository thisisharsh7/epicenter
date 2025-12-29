import type { TaggedError } from 'wellcrafted/error';
import { isResult, type Result } from 'wellcrafted/result';
import yargs from 'yargs';
import type { Actions } from '../core/actions';
import type { AnyWorkspaceConfig, EpicenterClient } from '../core/workspace';
import type { WorkspaceClient } from '../core/workspace/client.node';
import { createServer, DEFAULT_PORT } from '../server/server';
import { standardJsonSchemaToYargs } from './standard-json-schema-to-yargs';

/**
 * Create a CLI from an initialized Epicenter client.
 *
 * @param client - Initialized Epicenter client from createClient()
 * @returns Object with run method to execute CLI
 *
 * @example
 * ```typescript
 * import { createClient } from '@epicenter/hq';
 * import { createCLI } from '@epicenter/hq/cli';
 * import { hideBin } from 'yargs/helpers';
 *
 * const client = await createClient(workspaces, options);
 * await createCLI(client).run(hideBin(process.argv));
 * ```
 */
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

	const {
		$actions: _actions,
		destroy: _clientDestroy,
		[Symbol.asyncDispose]: _clientDispose,
		...workspaceClients
	} = client;

	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		const typedClient = workspaceClient as WorkspaceClient<Actions>;

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
							if (action.input) {
								return standardJsonSchemaToYargs(action.input, yargs);
							}
							return yargs;
						},
						async (argv) => {
							try {
								const { _, $0, ...input } = argv;
								const maybeResult = (await action(input)) as
									| Result<unknown, TaggedError>
									| unknown;

								const outputChannel = isResult(maybeResult)
									? maybeResult.data
									: maybeResult;
								const errorChannel = isResult(maybeResult)
									? (maybeResult.error as TaggedError)
									: undefined;

								if (errorChannel) {
									console.error('❌ Error:', errorChannel.message);
									process.exit(1);
								}

								console.log('✅ Success:');
								console.log(JSON.stringify(outputChannel, null, 2));
							} catch (error) {
								console.error('❌ Unexpected error:', error);
								process.exit(1);
							}
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
