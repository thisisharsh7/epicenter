import { Elysia } from 'elysia';
import { Ok } from 'wellcrafted/result';
import type { Actions } from '../core/actions';
import type { WorkspaceClient } from '../core/workspace';

/**
 * Creates an Elysia plugin that exposes KV store endpoints.
 *
 * Endpoints:
 * - GET /workspaces/{workspaceId}/kv - List all KV pairs as JSON
 * - GET /workspaces/{workspaceId}/kv/{key} - Get single value
 * - PUT /workspaces/{workspaceId}/kv/{key} - Set value (body: { value: T })
 * - DELETE /workspaces/{workspaceId}/kv/{key} - Reset to default
 */
export function createKvPlugin(
	workspaceClients: Record<string, WorkspaceClient<Actions>>,
) {
	const app = new Elysia();

	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		const kv = workspaceClient.$kv;
		const kvHelpers = kv.$all();
		const basePath = `/workspaces/${workspaceId}/kv`;
		const tags = [workspaceId, 'kv'];

		app.get(
			basePath,
			() => {
				return Ok(kv.$toJSON());
			},
			{
				detail: { description: `List all KV pairs for ${workspaceId}`, tags },
			},
		);

		for (const helper of kvHelpers) {
			const keyPath = `${basePath}/${helper.name}` as const;

			app.get(
				keyPath,
				() => {
					const value = helper.get();
					return Ok(value);
				},
				{
					detail: { description: `Get ${helper.name} value`, tags },
				},
			);

			app.put(
				keyPath,
				({ body }) => {
					const { value } = body as { value: unknown };
					helper.set({ value });
					return Ok({ success: true });
				},
				{
					detail: { description: `Set ${helper.name} value`, tags },
				},
			);

			app.delete(
				keyPath,
				() => {
					helper.reset();
					return Ok({ success: true });
				},
				{
					detail: { description: `Reset ${helper.name} to default`, tags },
				},
			);
		}
	}

	return app;
}
