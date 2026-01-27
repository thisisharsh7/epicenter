/**
 * defineTable() builder for creating versioned table definitions.
 *
 * @example
 * ```typescript
 * import { defineTable } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * // Shorthand for single version
 * const users = defineTable(type({ id: 'string', email: 'string' }));
 *
 * // Builder pattern for multiple versions
 * const posts = defineTable()
 *   .version(type({ id: 'string', title: 'string', _v: '"1"' }))
 *   .version(type({ id: 'string', title: 'string', views: 'number', _v: '"2"' }))
 *   .migrate((row) => {
 *     if (row._v === '1') return { ...row, views: 0, _v: '2' as const };
 *     return row;
 *   });
 * ```
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createUnionSchema } from './schema-union.js';
import type { TableDefinition } from './types.js';

/**
 * Builder for defining table schemas with versioning support.
 */
type TableBuilder<TVersions extends StandardSchemaV1[], TLatest> = {
	/**
	 * Add a schema version. Schema must include `{ id: string }`.
	 * The last version added becomes the "latest" schema shape.
	 */
	version<TSchema extends StandardSchemaV1>(
		schema: StandardSchemaV1.InferOutput<TSchema> extends { id: string }
			? TSchema
			: never,
	): TableBuilder<[...TVersions, TSchema], StandardSchemaV1.InferOutput<TSchema>>;

	/**
	 * Provide a migration function that normalizes any version to the latest.
	 * This completes the table definition.
	 */
	migrate(
		fn: (row: StandardSchemaV1.InferOutput<TVersions[number]>) => TLatest,
	): TableDefinition<TLatest & { id: string }>;
};

/**
 * Creates a table definition with a single schema version.
 * Schema must include `{ id: string }`.
 *
 * @example
 * ```typescript
 * const users = defineTable(type({ id: 'string', email: 'string' }));
 * ```
 */
export function defineTable<TSchema extends StandardSchemaV1>(
	schema: StandardSchemaV1.InferOutput<TSchema> extends { id: string }
		? TSchema
		: never,
): TableDefinition<StandardSchemaV1.InferOutput<TSchema> & { id: string }>;

/**
 * Creates a table definition builder for multiple versions with migrations.
 *
 * @example
 * ```typescript
 * const posts = defineTable()
 *   .version(type({ id: 'string', title: 'string' }))
 *   .version(type({ id: 'string', title: 'string', views: 'number' }))
 *   .migrate((row) => {
 *     if (!('views' in row)) return { ...row, views: 0 };
 *     return row;
 *   });
 * ```
 */
export function defineTable(): TableBuilder<[], never>;

export function defineTable<TSchema extends StandardSchemaV1>(
	schema?: TSchema,
): TableDefinition<StandardSchemaV1.InferOutput<TSchema> & { id: string }> | TableBuilder<[], never> {
	if (schema) {
		return {
			versions: [schema],
			unionSchema: schema,
			migrate: (row: unknown) => row as { id: string },
			_rowType: undefined as never,
		};
	}

	const versions: StandardSchemaV1[] = [];

	const builder: TableBuilder<StandardSchemaV1[], unknown> = {
		version(schema) {
			versions.push(schema);
			return builder as TableBuilder<StandardSchemaV1[], unknown>;
		},

		migrate(fn) {
			if (versions.length === 0) {
				throw new Error('defineTable() requires at least one .version() call');
			}

			const unionSchema = createUnionSchema(versions);

			return {
				versions,
				unionSchema,
				migrate: fn as (row: unknown) => { id: string },
				_rowType: undefined as never,
			};
		},
	};

	return builder as TableBuilder<[], never>;
}
