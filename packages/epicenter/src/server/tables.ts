import { Elysia } from 'elysia';
import type { Actions } from '../core/actions';
import type { WorkspaceClient } from '../core/workspace';


export function createTablesPlugin(workspaceClients: Record<string, WorkspaceClient<Actions>>) {
	const app = new Elysia();

	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		const tableHelpers = workspaceClient.$tables.$tables();

		for (const tableHelper of tableHelpers) {
			const tableName = tableHelper.name;
			const basePath = `/workspaces/${workspaceId}/tables/${tableName}`;
			const tags = [workspaceId, 'tables'];

			app.get(
				basePath,
				() => {
					const rows = tableHelper.getAllValid();
					return rows.map((row) => row.toJSON());
				},
				{
					detail: { description: `List all ${tableName}`, tags },
				},
			);

			app.get(
				`${basePath}/:id`,
				({ params, status }) => {
					const result = tableHelper.get({ id: params.id });

					switch (result.status) {
						case 'valid':
							return result.row.toJSON();
						case 'invalid':
							return status(422, { error: result.error.message });
						case 'not_found':
							return status(404, { error: 'Not found' });
					}
				},
				{
					detail: { description: `Get ${tableName} by ID`, tags },
				},
			);

			app.post(
				basePath,
				({ body }) => {
					tableHelper.upsert(body as Record<string, unknown>);
					return { success: true };
				},
				{
					body: tableHelper.validators.toStandardSchema(),
					detail: { description: `Create or update ${tableName}`, tags },
				},
			);

			app.put(
				`${basePath}/:id`,
				({ params, body }) => {
					const result = tableHelper.update({
						id: params.id,
						...(body as Record<string, unknown>),
					});
					return result;
				},
				{
					body: tableHelper.validators.toPartialStandardSchema(),
					detail: { description: `Update ${tableName} by ID`, tags },
				},
			);

			app.delete(
				`${basePath}/:id`,
				({ params }) => {
					const result = tableHelper.delete({ id: params.id });
					return result;
				},
				{
					detail: { description: `Delete ${tableName} by ID`, tags },
				},
			);
		}
	}

	return app;
}
