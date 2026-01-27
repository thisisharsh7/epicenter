/**
 * defineKv() builder for creating versioned KV definitions.
 *
 * @example
 * ```typescript
 * import { defineKv } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * // Shorthand for single version
 * const sidebar = defineKv(type({ collapsed: 'boolean', width: 'number' }));
 *
 * // Builder pattern for multiple versions
 * const theme = defineKv()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .version(type({ mode: "'light' | 'dark' | 'system'", fontSize: 'number' }))
 *   .migrate((v) => {
 *     if (!('fontSize' in v)) return { ...v, fontSize: 14 };
 *     return v;
 *   });
 * ```
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createUnionSchema } from './schema-union.js';
import type { KvDefinition } from './types.js';

/**
 * Builder for defining KV schemas with versioning support.
 *
 * @typeParam TVersions - Tuple of schema types added via .version()
 * @typeParam TLatest - Output type of the most recent version
 */
type KvBuilder<TVersions extends StandardSchemaV1[], TLatest> = {
	/**
	 * Add a schema version.
	 * The last version added becomes the "latest" schema shape.
	 */
	version<TSchema extends StandardSchemaV1>(
		schema: TSchema,
	): KvBuilder<[...TVersions, TSchema], StandardSchemaV1.InferOutput<TSchema>>;

	/**
	 * Provide a migration function that normalizes any version to the latest.
	 * This completes the KV definition.
	 *
	 * @returns KvDefinition with TVersionUnion (union of all version outputs) and TLatest (migrated type)
	 */
	migrate(
		fn: (value: StandardSchemaV1.InferOutput<TVersions[number]>) => TLatest,
	): KvDefinition<StandardSchemaV1.InferOutput<TVersions[number]>, TLatest>;
};

/**
 * Creates a KV definition with a single schema version.
 *
 * For single-version definitions, TVersionUnion and TValue are the same type.
 *
 * @example
 * ```typescript
 * const sidebar = defineKv(type({ collapsed: 'boolean', width: 'number' }));
 * ```
 */
export function defineKv<TSchema extends StandardSchemaV1>(
	schema: TSchema,
): KvDefinition<
	StandardSchemaV1.InferOutput<TSchema>,
	StandardSchemaV1.InferOutput<TSchema>
>;

/**
 * Creates a KV definition builder for multiple versions with migrations.
 *
 * @example
 * ```typescript
 * const theme = defineKv()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .version(type({ mode: "'light' | 'dark' | 'system'", fontSize: 'number' }))
 *   .migrate((v) => {
 *     if (!('fontSize' in v)) return { ...v, fontSize: 14 };
 *     return v;
 *   });
 * ```
 */
export function defineKv(): KvBuilder<[], never>;

export function defineKv<TSchema extends StandardSchemaV1>(
	schema?: TSchema,
):
	| KvDefinition<
			StandardSchemaV1.InferOutput<TSchema>,
			StandardSchemaV1.InferOutput<TSchema>
	  >
	| KvBuilder<[], never> {
	if (schema) {
		return {
			schema,
			migrate: (v: unknown) => v,
			_valueType: undefined as never,
		} as KvDefinition<
			StandardSchemaV1.InferOutput<TSchema>,
			StandardSchemaV1.InferOutput<TSchema>
		>;
	}

	const versions: StandardSchemaV1[] = [];

	const builder = {
		version(versionSchema: StandardSchemaV1) {
			versions.push(versionSchema);
			return builder;
		},

		migrate(fn: (value: unknown) => unknown) {
			if (versions.length === 0) {
				throw new Error('defineKv() requires at least one .version() call');
			}

			const unionSchema = createUnionSchema(versions);

			return {
				schema: unionSchema,
				migrate: fn,
				_valueType: undefined as never,
			};
		},
	};

	return builder as unknown as KvBuilder<[], never>;
}
