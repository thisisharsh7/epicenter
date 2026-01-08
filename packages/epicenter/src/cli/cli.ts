import yargs, { type Argv } from 'yargs';
import type { Actions } from '../core/actions';
import { iterateActions } from '../core/actions';
import { generateJsonSchema } from '../core/schema/standard/to-json-schema';
import type { WorkspaceClient } from '../core/workspace/contract';
import { createServer, DEFAULT_PORT } from '../server/server';

type AnyWorkspaceClient = WorkspaceClient<string, any, any, any>;

type CLIOptions = {
	actions?: Actions;
};

export function createCLI(
	clients: AnyWorkspaceClient | AnyWorkspaceClient[],
	options?: CLIOptions,
) {
	const clientArray = Array.isArray(clients) ? clients : [clients];

	const baseCli = yargs()
		.scriptName('epicenter')
		.usage('Usage: $0 <command> [options]')
		.help()
		.version()
		.strict()
		.option('port', {
			type: 'number',
			description: 'Port to run the server on',
			default: DEFAULT_PORT,
		})
		.command(
			'serve',
			'Start HTTP server with REST and WebSocket sync endpoints',
			() => {},
			(argv) => {
				createServer(clientArray, {
					port: argv.port,
					actions: options?.actions,
				}).start();
			},
		);

	const cli = options?.actions
		? registerActionCommands(baseCli, options.actions)
		: baseCli;

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

function registerActionCommands<T>(cli: Argv<T>, actions: Actions): Argv<T> {
	let result = cli;

	for (const [action, path] of iterateActions(actions)) {
		const commandPath = path.join(' ');
		const description =
			action.description ??
			`${action.type === 'query' ? 'Query' : 'Mutation'}: ${path.join('.')}`;

		result = result.command(
			commandPath,
			description,
			(yargs) => {
				if (action.input) {
					const jsonSchema = generateJsonSchema(action.input) as Record<
						string,
						unknown
					>;
					return addOptionsFromJsonSchema(yargs, jsonSchema);
				}
				return yargs;
			},
			async (argv) => {
				const input = extractInputFromArgv(
					argv as Record<string, unknown>,
					action.input,
				);

				if (action.input) {
					const result = await action.input['~standard'].validate(input);
					if (result.issues) {
						console.error('Validation failed:');
						for (const issue of result.issues) {
							console.error(
								`  - ${issue.path?.join('.') ?? 'input'}: ${issue.message}`,
							);
						}
						process.exit(1);
					}
					const output = await action.handler(result.value);
					console.log(JSON.stringify(output, null, 2));
				} else {
					const output = await (action.handler as () => unknown)();
					console.log(JSON.stringify(output, null, 2));
				}
			},
		) as Argv<T>;
	}

	return result;
}

function addOptionsFromJsonSchema<T>(
	yargs: Argv<T>,
	schema: Record<string, unknown>,
): Argv<T> {
	if (schema.type !== 'object' || !schema.properties) {
		return yargs;
	}

	const properties = schema.properties as Record<
		string,
		Record<string, unknown>
	>;
	const required = (schema.required as string[]) ?? [];

	let result = yargs;

	for (const [key, propSchema] of Object.entries(properties)) {
		const isRequired = required.includes(key);
		const yargsType = jsonSchemaTypeToYargsType(propSchema.type as string);

		result = result.option(key, {
			type: yargsType,
			description: propSchema.description as string | undefined,
			demandOption: isRequired,
		}) as Argv<T>;
	}

	return result;
}

function jsonSchemaTypeToYargsType(
	type: string,
): 'string' | 'number' | 'boolean' | 'array' {
	switch (type) {
		case 'string':
			return 'string';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'array':
			return 'array';
		default:
			return 'string';
	}
}

function extractInputFromArgv(
	argv: Record<string, unknown>,
	inputSchema: unknown,
): Record<string, unknown> {
	if (!inputSchema) return {};

	const schema = inputSchema as {
		'~standard': {
			jsonSchema: {
				input: (opts: { target: string }) => Record<string, unknown>;
			};
		};
	};
	const jsonSchema = schema['~standard'].jsonSchema.input({
		target: 'draft-2020-12',
	});

	if (jsonSchema.type !== 'object' || !jsonSchema.properties) {
		return {};
	}

	const properties = jsonSchema.properties as Record<string, unknown>;
	const input: Record<string, unknown> = {};

	for (const key of Object.keys(properties)) {
		if (key in argv && argv[key] !== undefined) {
			input[key] = argv[key];
		}
	}

	return input;
}
