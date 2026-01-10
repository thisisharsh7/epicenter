import { type } from 'arktype';
import { Elysia } from 'elysia';
import { Ok } from 'wellcrafted/result';
import type { Row, TableSchema } from '../core/schema';
import { tableSchemaToArktype } from '../core/schema';
import type { WorkspaceClient } from '../core/workspace/contract';

type AnyWorkspaceClient = WorkspaceClient<any, any, any>;

export function createTablesPlugin(
	workspaceClients: Record<string, AnyWorkspaceClient>,
) {
	const app = new Elysia();

	for (const [workspaceId, workspaceClient] of Object.entries(
		workspaceClients,
	)) {
		for (const tableHelper of workspaceClient.tables.$all()) {
			const tableName = tableHelper.name;
			const basePath = `/workspaces/${workspaceId}/tables/${tableName}`;
			const tags = [workspaceId, 'tables'];

			app.get(basePath, () => tableHelper.getAllValid(), {
				detail: { description: `List all ${tableName}`, tags },
			});

			app.get(
				`${basePath}/:id`,
				({ params, status }) => {
					const result = tableHelper.get(params.id);

					switch (result.status) {
						case 'valid':
							return result.row;
						case 'invalid':
							return status(422, { errors: result.errors });
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
					tableHelper.upsert(body as Row<TableSchema>);
					return Ok({ id: (body as Row<TableSchema>).id });
				},
				{
					body: tableSchemaToArktype(tableHelper.schema),
					detail: { description: `Create or update ${tableName}`, tags },
				},
			);

			app.put(
				`${basePath}/:id`,
				({ params, body }) => {
					const result = tableHelper.update({
						id: params.id,
						...(body as Partial<Row<TableSchema>>),
					});
					return Ok(result);
				},
				{
					body: tableSchemaToArktype(tableHelper.schema)
						.partial()
						.merge({ id: type.string }),
					detail: { description: `Update ${tableName} by ID`, tags },
				},
			);

			app.delete(
				`${basePath}/:id`,
				({ params }) => {
					const result = tableHelper.delete(params.id);
					return Ok(result);
				},
				{
					detail: { description: `Delete ${tableName} by ID`, tags },
				},
			);
		}
	}

	return app;
}
