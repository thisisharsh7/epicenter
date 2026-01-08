import { Elysia, t, type TSchema } from 'elysia';
import type { Action, Actions } from '../core/actions';
import { iterateActions } from '../core/actions';
import { generateJsonSchema } from '../core/schema/standard/to-json-schema';

type ActionsPluginOptions = {
	actions: Actions;
	basePath?: string;
};

export function createActionsPlugin(options: ActionsPluginOptions) {
	const { actions, basePath = '/actions' } = options;

	const plugin = new Elysia({ prefix: basePath });

	for (const [action, path] of iterateActions(actions)) {
		const routePath = '/' + path.join('/');
		const handler = createActionHandler(action);
		const tags: string[] = path.length > 1 ? [path[0] as string] : [];

		if (action.type === 'query') {
			plugin.get(routePath, handler, {
				detail: {
					summary: path.join('.'),
					description: action.description,
					tags,
				},
			});
		} else {
			const bodySchema = action.input
				? jsonSchemaToElysia(
						generateJsonSchema(action.input) as Record<string, unknown>,
					)
				: t.Any();

			plugin.post(routePath, handler, {
				body: bodySchema,
				detail: {
					summary: path.join('.'),
					description: action.description,
					tags,
				},
			});
		}
	}

	return plugin;
}

function createActionHandler(action: Action<any, any>) {
	return async ({ body, query }: { body?: unknown; query?: unknown }) => {
		const rawInput = action.type === 'query' ? query : body;

		if (action.input) {
			const result = await action.input['~standard'].validate(rawInput);
			if (result.issues) {
				return {
					error: {
						message: 'Validation failed',
						issues: result.issues,
					},
				};
			}
			const output = await action.handler(result.value);
			return { data: output };
		}

		const output = await (action.handler as () => unknown)();
		return { data: output };
	};
}

function jsonSchemaToElysia(schema: Record<string, unknown>): TSchema {
	if (schema.type === 'object' && schema.properties) {
		const properties = schema.properties as Record<
			string,
			Record<string, unknown>
		>;
		const required = (schema.required as string[]) ?? [];
		const shape: Record<string, TSchema> = {};

		for (const [key, propSchema] of Object.entries(properties)) {
			const isRequired = required.includes(key);
			shape[key] = jsonSchemaPropertyToElysia(propSchema, isRequired);
		}

		return t.Object(shape);
	}

	return t.Any();
}

function jsonSchemaPropertyToElysia(
	schema: Record<string, unknown>,
	isRequired: boolean,
): TSchema {
	let elysiaType: TSchema;

	switch (schema.type) {
		case 'string':
			elysiaType = t.String();
			break;
		case 'number':
		case 'integer':
			elysiaType = t.Number();
			break;
		case 'boolean':
			elysiaType = t.Boolean();
			break;
		case 'array':
			elysiaType = t.Array(t.Any());
			break;
		case 'object':
			elysiaType = jsonSchemaToElysia(schema);
			break;
		default:
			elysiaType = t.Any();
	}

	return isRequired ? elysiaType : t.Optional(elysiaType);
}

export function collectActionPaths(actions: Actions): string[] {
	return [...iterateActions(actions)].map(([_, path]) => path.join('/'));
}
