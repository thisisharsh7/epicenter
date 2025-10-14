import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { EpicenterConfig, AnyWorkspaceConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import { applySchemaConverters, type SchemaConverter } from './schema-converters';
import { createZodConverter, createArktypeConverter } from './converters';

/**
 * Options for creating the CLI
 */
export type CreateCLIOptions = {
	/**
	 * Schema converters to use for generating CLI flags
	 * Defaults to Zod and Arktype converters
	 */
	schemaConverters?: SchemaConverter[];

	/**
	 * Custom argv to parse (useful for testing)
	 * Defaults to process.argv
	 */
	argv?: string[];
};

/**
 * Create a CLI from an epicenter configuration
 * Generates yargs commands for each workspace action
 *
 * @param config - Epicenter configuration
 * @param options - CLI creation options
 * @returns Configured yargs instance
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [reddit, blog],
 * });
 *
 * const cli = createCLI(epicenter);
 * await cli.parse();
 * ```
 *
 * @example
 * Usage: epicenter <workspace> <action> [flags]
 * ```bash
 * epicenter reddit import --url "https://reddit.com/r/typescript" --count 10
 * epicenter blog createPost --title "Hello World" --tags tech,typescript
 * ```
 */
export function createCLI(
	config: EpicenterConfig<string, readonly AnyWorkspaceConfig[]>,
	options: CreateCLIOptions = {},
): ReturnType<typeof yargs> {
	const {
		schemaConverters = [createZodConverter(), createArktypeConverter()],
		argv = process.argv,
	} = options;

	const cli = yargs(hideBin(argv))
		.scriptName('epicenter')
		.usage('Usage: $0 <workspace> <action> [options]')
		.help()
		.version()
		.strictCommands(false)
		.strictOptions(false);

	// Add a command that handles all workspace/action combinations
	cli.command(
		'$0 <workspace> <action>',
		'Execute a workspace action',
		(yargs) => {
			return yargs
				.positional('workspace', {
					type: 'string',
					describe: 'The workspace name',
					demandOption: true,
				})
				.positional('action', {
					type: 'string',
					describe: 'The action to execute',
					demandOption: true,
				})
				.strictOptions(false);
		},
		async (argv) => {
			const workspaceName = argv.workspace as string;
			const actionName = argv.action as string;

			// Find the workspace in the config
			const workspace = config.workspaces.find((ws) => ws.name === workspaceName);

			if (!workspace) {
				console.error(`Error: Workspace "${workspaceName}" not found`);
				console.error(
					`\nAvailable workspaces: ${config.workspaces.map((ws) => ws.name).join(', ')}`,
				);
				process.exit(1);
			}

			// Get the action map from the workspace
			// We need to initialize the workspace to get actions, but that's expensive
			// For now, we'll do a simpler approach: just validate the action exists
			// by checking if it's defined in the actions factory

			try {
				// Create the epicenter client
				const client = await createEpicenterClient(config);

				// Access the workspace client
				const workspaceClient = (client as any)[workspaceName];

				if (!workspaceClient) {
					console.error(`Error: Failed to initialize workspace "${workspaceName}"`);
					process.exit(1);
				}

				// Check if the action exists
				const action = workspaceClient[actionName];

				if (typeof action !== 'function') {
					console.error(`Error: Action "${actionName}" not found in workspace "${workspaceName}"`);
					console.error(
						`\nAvailable actions: ${Object.keys(workspaceClient)
							.filter((key) => typeof workspaceClient[key] === 'function' && !key.startsWith('_'))
							.join(', ')}`,
					);
					process.exit(1);
				}

				// Extract the arguments for the action (everything except workspace, action, and yargs defaults)
				const actionArgs: Record<string, any> = {};
				for (const [key, value] of Object.entries(argv)) {
					if (
						key !== 'workspace' &&
						key !== 'action' &&
						key !== '_' &&
						key !== '$0' &&
						!key.startsWith('$')
					) {
						actionArgs[key] = value;
					}
				}

				// Execute the action
				console.log(`Executing ${workspaceName}.${actionName}...`);
				const result = await action(actionArgs);

				// Handle the result (assuming Result type from wellcrafted)
				if (result && typeof result === 'object' && 'data' in result && 'error' in result) {
					if (result.error) {
						console.error('Error:', result.error);
						await client.destroy();
						process.exit(1);
					} else {
						// If data is a Promise (from queries), await it
						const data = result.data instanceof Promise ? await result.data : result.data;
						console.log('Success:', data);
					}
				} else {
					// If it's not a Result type, just log it
					console.log('Result:', result);
				}

				// HACK: Give observers time to process YJS changes
				// TODO: Make observers awaitable to eliminate this race condition
				await new Promise(resolve => setTimeout(resolve, 100));

				// Cleanup and exit
				await client.destroy();
				process.exit(0);
			} catch (error) {
				console.error('Error executing action:', error);
				process.exit(1);
			}
		},
	);

	// Add examples showing how to use the CLI
	cli.example('$0 reddit import --url https://reddit.com/r/typescript', 'Import from Reddit');
	cli.example('$0 blog createPost --title "Hello World"', 'Create a blog post');

	return cli;
}

/**
 * Generate yargs options for a specific action
 * This is a helper function that can be used to introspect an action's schema
 * and generate the appropriate CLI flags
 *
 * Note: This function requires access to the action's input schema, which is not
 * easily accessible from the workspace config without initializing the workspace.
 * For now, this is a placeholder that would need to be enhanced with proper
 * schema introspection from the action definitions.
 */
function generateOptionsForAction(
	actionSchema: any,
	schemaConverters: SchemaConverter[],
	yargs: ReturnType<typeof import('yargs').default>,
): ReturnType<typeof import('yargs').default> {
	if (actionSchema && actionSchema.input) {
		return applySchemaConverters(actionSchema.input, yargs, schemaConverters);
	}
	return yargs;
}
