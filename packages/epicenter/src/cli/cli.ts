import type { TaggedError } from 'wellcrafted/error';
import { isResult, type Result } from 'wellcrafted/result';
import yargs from 'yargs';
import { walkActions } from '../core/actions';
import type { AnyWorkspaceConfig } from '../core/workspace';
import {
	createClient,
	type CreateClientOptions,
	type WorkspaceClient,
} from '../core/workspace/client.node';
import { DEFAULT_PORT, startServer } from './server';
import { standardJsonSchemaToYargs } from './standard-json-schema-to-yargs';

export type CreateCLIOptions = CreateClientOptions;

/**
 * Create and run CLI from workspace configurations.
 *
 * This function:
 * 1. Initializes workspaces (with persistence, sync providers)
 * 2. Generates yargs command hierarchy (workspace → action)
 * 3. Parses arguments and executes the matched command
 * 4. Cleans up workspaces after command execution (including on Ctrl+C)
 *
 * The client lifecycle is managed internally to ensure persistence providers
 * remain active throughout command execution.
 *
 * @param workspaces - Array of workspace configurations
 * @param argv - Array of command-line arguments to parse
 * @param options - Optional client options (e.g., storageDir)
 *
 * @example
 * ```typescript
 * // In production (bin.ts)
 * import { hideBin } from 'yargs/helpers';
 * await createCLI({ workspaces, argv: hideBin(process.argv) });
 *
 * // In tests
 * await createCLI({ workspaces, argv: ['posts', 'createPost', '--title', 'Test'] });
 * ```
 */
export async function createCLI<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>({
	workspaces,
	argv,
	options,
}: {
	workspaces: TWorkspaces;
	argv: string[];
	options?: CreateCLIOptions;
}): Promise<void> {
	const client = await createClient(workspaces, options);

	const cleanup = async () => {
		await client.destroy();
		process.exit(0);
	};
	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);

	let cli = yargs(argv)
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
		async (argv) => {
			await startServer(workspaces, { ...options, port: argv.port });
		},
	);

	for (const workspaceConfig of workspaces) {
		const workspaceId = workspaceConfig.id;
		// Cast to indexed access since we know workspaceId exists (client was created from workspaces)
		const workspaceClient = (client as Record<string, WorkspaceClient<any>>)[
			workspaceId
		]!;

		const {
			destroy: _,
			[Symbol.asyncDispose]: __,
			...workspaceExports
		} = workspaceClient;

		cli = cli.command(
			workspaceId,
			`Commands for ${workspaceId} workspace`,
			(yargs) => {
				let workspaceCli = yargs
					.usage(`Usage: $0 ${workspaceId} <action> [options]`)
					.demandCommand(1, 'You must specify an action')
					.strict();

				for (const { path, action } of walkActions(workspaceExports)) {
					const actionName = path.join('_');
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

	try {
		await cli.parse();
	} finally {
		process.off('SIGINT', cleanup);
		process.off('SIGTERM', cleanup);
		await client.destroy();
	}
}
