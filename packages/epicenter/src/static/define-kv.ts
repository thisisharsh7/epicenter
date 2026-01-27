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
import type { KVDefinition } from './types.js';

/**
 * Builder for defining KV schemas with versioning support.
 */
type KVBuilder<TVersions extends StandardSchemaV1[], TLatest> = {
	/**
	 * Add a schema version.
	 * The last version added becomes the "latest" schema shape.
	 */
	version<TSchema extends StandardSchemaV1>(
		schema: TSchema,
	): KVBuilder<[...TVersions, TSchema], StandardSchemaV1.InferOutput<TSchema>>;

	/**
	 * Provide a migration function that normalizes any version to the latest.
	 * This completes the KV definition.
	 */
	migrate(
		fn: (value: StandardSchemaV1.InferOutput<TVersions[number]>) => TLatest,
	): KVDefinition<TLatest>;
};

/**
 * Creates a KV definition with a single schema version.
 *
 * @example
 * ```typescript
 * const sidebar = defineKv(type({ collapsed: 'boolean', width: 'number' }));
 * ```
 */
export function defineKv<TSchema extends StandardSchemaV1>(
	schema: TSchema,
): KVDefinition<StandardSchemaV1.InferOutput<TSchema>>;

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
export function defineKv(): KVBuilder<[], never>;

export function defineKv<TSchema extends StandardSchemaV1>(
	schema?: TSchema,
): KVDefinition<StandardSchemaV1.InferOutput<TSchema>> | KVBuilder<[], never> {
	if (schema) {
		return {
			versions: [schema],
			unionSchema: schema,
			migrate: (v: unknown) => v,
			_valueType: undefined as never,
		};
	}

	const versions: StandardSchemaV1[] = [];

	const builder: KVBuilder<StandardSchemaV1[], unknown> = {
		version(schema) {
			versions.push(schema);
			return builder as KVBuilder<StandardSchemaV1[], unknown>;
		},

		migrate(fn) {
			if (versions.length === 0) {
				throw new Error('defineKv() requires at least one .version() call');
			}

			const unionSchema = createUnionSchema(versions);

			return {
				versions,
				unionSchema,
				migrate: fn as (value: unknown) => unknown,
				_valueType: undefined as never,
			};
		},
	};

	return builder as KVBuilder<[], never>;
}
