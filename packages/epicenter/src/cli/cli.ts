import yargs from 'yargs';
import type { Argv } from 'yargs';
import type { TaggedError } from 'wellcrafted/error';
import { type Result, isResult } from 'wellcrafted/result';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
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

	// Initialize Epicenter client to get all workspace actions
	using client = await createEpicenterClient(config);

	// Register each workspace as a command
	for (const workspaceConfig of config.workspaces) {
		// Access workspace client directly from Epicenter client
		const workspaceClient = client[workspaceConfig.id]!;

		// Extract action map (all client properties except Symbol.dispose)
		const { [Symbol.dispose]: _, ...actionMap } = workspaceClient;

		cli = cli.command(
			workspaceConfig.id,
			`Commands for ${workspaceConfig.id} workspace`,
			(yargs) => {
				let workspaceCli = yargs
					.usage(`Usage: $0 ${workspaceConfig.id} <action> [options]`)
					.demandCommand(1, 'You must specify an action')
					.strict();

				// Register each action as a subcommand
				for (const [actionName, action] of Object.entries(actionMap)) {
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
							// Handler: execute action using already-initialized workspace
							try {
								// Get the action handler from the workspace client
								const handler = workspaceClient[actionName];

								if (!handler) {
									console.error(
										`❌ Action "${actionName}" not found in workspace "${workspaceConfig.id}"`,
									);
									process.exit(1);
								}

								// Extract input from args (remove yargs metadata)
								const { _, $0, ...input } = argv;

								// Execute the action (may return Result or raw data)
								const maybeResult = (await handler(input)) as
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
