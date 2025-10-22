import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { Argv } from 'yargs';
import type { EpicenterConfig } from '../core/epicenter';
import { createWorkspaceClient } from '../core/workspace/client';
import { typeboxToYargs } from './typebox-to-yargs';
import { createMockContext } from './mock-context';
import { serveCommand } from './commands/serve';

/**
 * Options for generating the CLI
 */
export type GenerateCLIOptions = {
	/**
	 * Custom argv to parse (useful for testing)
	 * Defaults to process.argv
	 */
	argv?: string[];
};

/**
 * Generate CLI from Epicenter config.
 * Returns a yargs instance with all workspace and action commands.
 *
 * This function:
 * 1. Uses mock context to introspect actions (fast, no YJS loading)
 * 2. Generates yargs command hierarchy (workspace → action)
 * 3. Sets up handlers that initialize real workspaces on execution
 *
 * @param config - Epicenter configuration
 * @param options - CLI generation options
 * @returns Yargs instance ready to parse arguments
 *
 * @example
 * ```typescript
 * const cli = generateCLI(config);
 * await cli.parse();
 * ```
 */
export function generateCLI(
	config: EpicenterConfig,
	options: GenerateCLIOptions = {},
): Argv {
	const { argv = process.argv } = options;

	// Create yargs instance
	let cli = yargs(hideBin(argv))
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
					default: 3000,
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
			workspaceConfig.name,
			`Commands for ${workspaceConfig.name} workspace`,
			(yargs) => {
				let workspaceCli = yargs
					.usage(`Usage: $0 ${workspaceConfig.name} <action> [options]`)
					.demandCommand(1, 'You must specify an action')
					.strict();

				// Register each action as a subcommand
				for (const [actionName, action] of Object.entries(actionMap)) {
					workspaceCli = workspaceCli.command(
						actionName,
						action.description || `Execute ${actionName} ${action.type}`,
						(yargs) => {
							// Convert input schema to yargs options
							if (action.input) {
								return typeboxToYargs(action.input, yargs);
							}
							return yargs;
						},
						async (argv) => {
							// Handler: initialize real workspace and execute action
							await executeAction(
								config,
								workspaceConfig.name,
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
 * @param workspaceName - Name of the workspace to execute action in
 * @param actionName - Name of the action to execute
 * @param args - Command-line arguments (parsed by yargs)
 */
async function executeAction(
	config: EpicenterConfig,
	workspaceName: string,
	actionName: string,
	args: any,
) {
	// Find workspace config
	const workspaceConfig = config.workspaces.find(
		(ws) => ws.name === workspaceName,
	);

	if (!workspaceConfig) {
		console.error(`❌ Workspace "${workspaceName}" not found`);
		process.exit(1);
	}

	// Initialize real workspace (with YJS docs, indexes, etc.)
	const client = await createWorkspaceClient(workspaceConfig);

	try {
		// Get the action handler
		const handler = (client as any)[actionName];

		if (!handler) {
			console.error(
				`❌ Action "${actionName}" not found in workspace "${workspaceName}"`,
			);
			process.exit(1);
		}

		// Extract input from args (remove yargs metadata)
		const { _, $0, ...input } = args;

		// Execute the action
		const result = await handler(input);

		// Handle Result type
		if (result && typeof result === 'object' && 'error' in result) {
			if (result.error) {
				console.error('❌ Error:', result.error.message);
				if (result.error.description) {
					console.error('  ', result.error.description);
				}
				process.exit(1);
			}

			// Success with data
			console.log('✅ Success:');
			console.log(JSON.stringify(result.data, null, 2));
		} else {
			// Non-Result return value
			console.log('✅ Success:');
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (error) {
		console.error('❌ Unexpected error:', error);
		process.exit(1);
	} finally {
		// Cleanup workspace resources
		client.destroy();
	}
}
