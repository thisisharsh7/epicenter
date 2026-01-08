import type { CommandModule } from 'yargs';
import type { Action, Actions } from '../core/actions';
import { iterateActions } from '../core/actions';
import { generateJsonSchema } from '../core/schema/standard/to-json-schema';
import { jsonSchemaToYargsOptions } from './json-schema-to-yargs';

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

function createActionHandler(action: Action<any, any>) {
	return async (argv: Record<string, unknown>) => {
		const input = extractInputFromArgv(argv, action.input);

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
	};
}

/**
 * Build yargs command configurations from an actions tree.
 *
 * Iterates over all actions and creates CommandModule configs that can be
 * registered with yargs. Separates the concern of building command configs
 * from registering them, enabling cleaner CLI construction.
 *
 * @example
 * ```typescript
 * const actions = { posts: { create: defineAction({ ... }) } };
 * const commands = buildActionCommands(actions);
 * for (const cmd of commands) {
 *   cli = cli.command(cmd);
 * }
 * ```
 */
export function buildActionCommands(actions: Actions): CommandModule[] {
	return [...iterateActions(actions)].map(([action, path]) => {
		const commandPath = path.join(' ');
		const description =
			action.description ??
			`${action.type === 'query' ? 'Query' : 'Mutation'}: ${path.join('.')}`;

		const builder = action.input
			? jsonSchemaToYargsOptions(
					generateJsonSchema(action.input) as Record<string, unknown>,
				)
			: {};

		return {
			command: commandPath,
			describe: description,
			builder,
			handler: createActionHandler(action),
		};
	});
}
