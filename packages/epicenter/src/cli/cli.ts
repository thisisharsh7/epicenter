import yargs from 'yargs';
import type { Argv } from 'yargs';
import type { EpicenterConfig } from '../core/epicenter';
import { createWorkspaceClient } from '../core/workspace/client';
import { standardSchemaToYargs } from './standardschema-to-yargs';
import { createMockContext } from './mock-context';
import { serveCommand, DEFAULT_PORT } from './commands/serve';

/**
 * Create CLI from Epicenter config.
 * Returns a yargs instance with all workspace and action commands.
 *
 * This function:
 * 1. Uses mock context to introspect actions (fast, no YJS loading)
 * 2. Generates yargs command hierarchy (workspace → action)
 * 3. Sets up handlers that initialize real workspaces on execution
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
		.usage('Usage: $0 <command> [options]')
		.help()
		.version()
		.demandCommand(1, 'You must specify a command')
		.strict();

	// Add serve command
	cli = cli.command(
		'serve',
		'Start HTTP server with REST and MCP endpoints',
		(yargs) => {
			return yargs
				.option('port', {
					type: 'number',
					description: 'Port to run the server on',
					default: DEFAULT_PORT,
				})
				.option('dev', {
					type: 'boolean',
					description: 'Run in development mode',
					default: true,
				})
				.option('prod', {
					type: 'boolean',
					description: 'Run in production mode',
					default: false,
				});
		},
		async (argv) => {
			await serveCommand(config, {
				port: argv.port,
				dev: argv.prod ? false : argv.dev,
			});
		},
	);

	// Register each workspace as a command
	for (const workspaceConfig of config.workspaces) {
		// Create mock context to introspect actions (fast, no YJS loading)
		const mockContext = createMockContext(workspaceConfig.schema);
		const actionMap = workspaceConfig.actions(mockContext);

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
							// Handler: initialize real workspace and execute action
							await executeAction(
								config,
								workspaceConfig.id,
								actionName,
								argv,
							);
						},
					);
				}

				return workspaceCli;
			},
		);
	}

	return cli;
}

/**
 * Execute an action with real workspace initialization.
 * Called when user runs a CLI command.
 *
 * This function:
 * 1. Finds the workspace config
 * 2. Initializes the workspace (loads YJS docs, creates indexes, etc.)
 * 3. Executes the action handler
 * 4. Handles results and errors
 * 5. Cleans up resources
 *
 * @param config - Epicenter configuration
 * @param workspaceId - ID of the workspace to execute action in
 * @param actionName - Name of the action to execute
 * @param args - Command-line arguments (parsed by yargs)
 */
async function executeAction(
	config: EpicenterConfig,
	workspaceId: string,
	actionName: string,
	args: any,
) {
	// Find workspace config
	const workspaceConfig = config.workspaces.find(
		(ws) => ws.id === workspaceId,
	);

	if (!workspaceConfig) {
		console.error(`❌ Workspace "${workspaceId}" not found`);
		process.exit(1);
	}

	// Initialize real workspace (with YJS docs, indexes, etc.)
	const client = await createWorkspaceClient(workspaceConfig);

	try {
		// Get the action handler
		const handler = client[actionName];

		if (!handler) {
			console.error(
				`❌ Action "${actionName}" not found in workspace "${workspaceId}"`,
			);
			process.exit(1);
		}

		// Extract input from args (remove yargs metadata)
		const { _, $0, ...input } = args;

		// Execute the action
		const result = await handler(input);

		// Handle errors
		if (result.error) {
			console.error('❌ Error:', result.error.message);
			process.exit(1);
		}

		// Handle success
		console.log('✅ Success:');
		const output = result?.data ?? result;
		console.log(JSON.stringify(output, null, 2));
	} catch (error) {
		console.error('❌ Unexpected error:', error);
		process.exit(1);
	} finally {
		// Cleanup workspace resources
		client.destroy();
	}
}
