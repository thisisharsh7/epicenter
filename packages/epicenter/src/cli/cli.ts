import yargs from 'yargs';
import type { Actions, Action } from '../core/actions';
import { isAction } from '../core/actions';
import type { StandardJSONSchemaV1 } from '../core/schema';
import type { BoundWorkspaceClient } from '../core/workspace/contract';
import { createServer, DEFAULT_PORT } from '../server/server';
import { standardJsonSchemaToYargs } from './standard-json-schema-to-yargs';

type AnyWorkspaceClient = BoundWorkspaceClient<string, any, any, any, Actions>;

type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: Action;
	handler: (input: unknown) => Promise<unknown>;
};

function extractActions(
	actions: Actions,
	workspaceId: string,
	path: string[] = [],
): ActionInfo[] {
	const result: ActionInfo[] = [];

	for (const [key, actionOrNamespace] of Object.entries(actions)) {
		const actionPath = [...path, key];

		if (isAction(actionOrNamespace)) {
			result.push({
				workspaceId,
				actionPath,
				action: actionOrNamespace,
				handler: actionOrNamespace as unknown as (
					input: unknown,
				) => Promise<unknown>,
			});
		} else {
			result.push(
				...extractActions(
					actionOrNamespace as Actions,
					workspaceId,
					actionPath,
				),
			);
		}
	}

	return result;
}

export function createCLI(clients: AnyWorkspaceClient | AnyWorkspaceClient[]) {
	const clientArray = Array.isArray(clients) ? clients : [clients];

	const workspaces: Record<string, AnyWorkspaceClient> = {};
	const allActions: ActionInfo[] = [];

	for (const client of clientArray) {
		const workspaceId = client.id;
		workspaces[workspaceId] = client;

		allActions.push(...extractActions(client.actions as Actions, workspaceId));
	}

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
			createServer(clientArray, { port: argv.port }).start();
		},
	);

	for (const [workspaceId] of Object.entries(workspaces)) {
		const workspaceActions = allActions.filter(
			(a) => a.workspaceId === workspaceId,
		);

		cli = cli.command(
			workspaceId,
			`Commands for ${workspaceId} workspace`,
			(yargs) => {
				let workspaceCli = yargs
					.usage(`Usage: $0 ${workspaceId} <action> [options]`)
					.demandCommand(1, 'You must specify an action')
					.strict();

				for (const { actionPath, action, handler } of workspaceActions) {
					const actionName = actionPath.join('_');
					workspaceCli = workspaceCli.command(
						actionName,
						action.description || `Execute ${actionName} ${action.type}`,
						(yargs) => {
							if ('input' in action && action.input) {
								return standardJsonSchemaToYargs(
									action.input as StandardJSONSchemaV1,
									yargs,
								);
							}
							return yargs;
						},
						async (argv) => {
							const input = action.input ? argv : undefined;
							const result = await handler(input);
							console.log(JSON.stringify(result, null, 2));
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
