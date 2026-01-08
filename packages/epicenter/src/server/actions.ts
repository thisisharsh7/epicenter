import { Elysia } from 'elysia';
import type { Action, Actions } from '../core/actions';
import { iterateActions } from '../core/actions';

type ActionsRouterOptions = {
	actions: Actions;
	basePath?: string;
};

export function createActionsRouter(options: ActionsRouterOptions) {
	const { actions, basePath = '/actions' } = options;
	const router = new Elysia({ prefix: basePath });

	for (const [action, path] of iterateActions(actions)) {
		const routePath = `/${path.join('/')}`;
		const handler = createActionHandler(action);
		const namespaceTags = path.length > 1 ? [path[0] as string] : [];
		const tags = [...namespaceTags, action.type];

		const detail = {
			summary: path.join('.'),
			description: action.description,
			tags,
		};

		switch (action.type) {
			case 'query':
				router.get(routePath, handler, { query: action.input, detail });
				break;
			case 'mutation':
				router.post(routePath, handler, { body: action.input, detail });
				break;
			default: {
				const _exhaustive: never = action.type;
				throw new Error(`Unknown action type: ${_exhaustive}`);
			}
		}
	}

	return router;
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

export function collectActionPaths(actions: Actions): string[] {
	return [...iterateActions(actions)].map(([, path]) => path.join('/'));
}
