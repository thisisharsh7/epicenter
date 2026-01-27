/**
 * defineKV() builder for creating versioned KV definitions.
 *
 * @example
 * ```typescript
 * import { defineKV } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * const theme = defineKV()
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
 * Creates a KV definition builder.
 *
 * Chain `.version()` calls to add schema versions, then call `.migrate()`
 * to provide a migration function that normalizes any version to latest.
 *
 * @example
 * ```typescript
 * // Single version (no migration needed)
 * const sidebar = defineKV()
 *   .version(type({ collapsed: 'boolean', width: 'number' }))
 *   .migrate((v) => v);
 *
 * // Multiple versions with migration
 * const theme = defineKV()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .version(type({ mode: "'light' | 'dark' | 'system'", fontSize: 'number' }))
 *   .migrate((v) => {
 *     if (!('fontSize' in v)) return { ...v, fontSize: 14 };
 *     return v;
 *   });
 * ```
 */
export function defineKV(): KVBuilder<[], never> {
	const versions: StandardSchemaV1[] = [];

	const builder: KVBuilder<StandardSchemaV1[], unknown> = {
		version(schema) {
			versions.push(schema);
			return builder as KVBuilder<StandardSchemaV1[], unknown>;
		},

		migrate(fn) {
			if (versions.length === 0) {
				throw new Error('defineKV() requires at least one .version() call');
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
