import type { TaggedError } from 'wellcrafted/error';
import { type Result, isResult } from 'wellcrafted/result';
import yargs from 'yargs';
import type { Argv } from 'yargs';
import { type WorkspaceExports, walkActions } from '../core/actions';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { WorkspaceClient } from '../core/workspace';
import { DEFAULT_PORT, startServer } from './server';
import { standardSchemaToYargs } from './standardschema-to-yargs';

/**
 * Create CLI from Epicenter config.
 * Returns a yargs instance with all workspace and action commands.
 *
 * This function:
 * 1. Initializes workspaces to introspect available actions
 * 2. Generates yargs command hierarchy (workspace → action)
 * 3. Sets up handlers that execute actions using the workspace client
 *
 * @param config - Epicenter configuration
 * @param argv - Array of command-line arguments to parse
 * @returns Yargs instance ready to parse arguments
 *
 * @example
 * ```typescript
 * // In production (bin.ts)
 * import { hideBin } from 'yargs/helpers';
 * const cli = await createCLI({ config, argv: hideBin(process.argv) });
 * await cli.parse();
 *
 * // In tests
 * const cli = await createCLI({ config, argv: ['posts', 'createPost', '--title', 'Test'] });
 * await cli.parse();
 * ```
 */
export async function createCLI({
	config,
	argv,
}: {
	config: EpicenterConfig;
	argv: string[];
}): Promise<Argv> {
	// Create yargs instance
	let cli = yargs(argv)
		.scriptName('epicenter')
		.usage('Usage: $0 [command] [options]')
		.help()
		.version()
		.strict();

	// Default command: start the server
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
			await startServer(config, {
				port: argv.port,
			});
		},
	);

	// Initialize Epicenter client
	await using client = await createEpicenterClient(config);

	// Register each workspace as a command
	for (const workspaceConfig of config.workspaces) {
		const workspaceId = workspaceConfig.id;
		// biome-ignore lint/style/noNonNullAssertion: client was created from config.workspaces, so workspaceId/workspaceConfig.id exists in client
		const workspaceClient = client[workspaceId]! as WorkspaceClient<WorkspaceExports>;

		// Extract exports (exclude cleanup methods)
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

				// Register each action as a subcommand (supports nested namespaces)
				// Nested paths like ['users', 'crud', 'create'] become 'users_crud_create'
				for (const { path, action } of walkActions(workspaceExports)) {
					const actionName = path.join('_');
					workspaceCli = workspaceCli.command(
						actionName,
						action.description || `Execute ${actionName} ${action.type}`,
						async (yargs) => {
							// Convert input schema to yargs options
							if (action.input) {
								return await standardSchemaToYargs(action.input, yargs);
							}
							return yargs;
						},
						async (argv) => {
							// Handler: execute action directly (action reference is captured in closure)
							try {
								// Extract input from args (remove yargs metadata)
								const { _, $0, ...input } = argv;

								// Execute the action (may return Result or raw data)
								const maybeResult = (await action(input)) as
									| Result<unknown, TaggedError>
									| unknown;

								// Extract data and error channels using isResult pattern
								const outputChannel = isResult(maybeResult)
									? maybeResult.data
									: maybeResult;
								const errorChannel = isResult(maybeResult)
									? (maybeResult.error as TaggedError)
									: undefined;

								// Handle error case
								if (errorChannel) {
									console.error('❌ Error:', errorChannel.message);
									process.exit(1);
								}

								// Handle success
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

	return cli;
}
