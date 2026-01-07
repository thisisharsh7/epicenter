import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import type * as Y from 'yjs';

import type { KvFieldSchema, KvSchema, KvValue } from '../schema';
import { fieldSchemaToYjsArktype, isNullableFieldSchema } from '../schema';
import { YKeyValue, type YKeyValueChangeHandler } from '../utils/y-keyvalue';

type KvValidationContext = {
	key: string;
	errors: ArkErrors;
	summary: string;
};

export const { KvValidationError } =
	createTaggedError('KvValidationError').withContext<KvValidationContext>();

export type KvValidationError = ReturnType<typeof KvValidationError>;

/**
 * Result of getting a KV value.
 * Uses a status-based discriminated union for explicit handling of all cases.
 */
export type KvGetResult<TValue> =
	| { status: 'valid'; value: TValue }
	| { status: 'invalid'; key: string; error: KvValidationError }
	| { status: 'not_found'; key: string };

/**
 * Creates a collection of typed KV helpers for all keys in a schema.
 *
 * Uses YKeyValue internally for efficient storage. KV data is stored as
 * `{key, val}` pairs in a Y.Array, avoiding Y.Map's tombstone accumulation.
 */
export function createKvHelpers<TKvSchema extends KvSchema>({
	ydoc,
	schema,
}: {
	ydoc: Y.Doc;
	schema: TKvSchema;
}) {
	const ykvArray = ydoc.getArray<{ key: string; val: KvValue }>('kv');
	const ykv = new YKeyValue(ykvArray);

	return Object.fromEntries(
		Object.entries(schema).map(([keyName, columnSchema]) => [
			keyName,
			createKvHelper({
				keyName,
				ykv,
				schema: columnSchema,
			}),
		]),
	) as {
		[K in keyof TKvSchema]: KvHelper<TKvSchema[K]>;
	};
}

export function createKvHelper<TFieldSchema extends KvFieldSchema>({
	keyName,
	ykv,
	schema,
}: {
	keyName: string;
	ykv: YKeyValue<KvValue>;
	schema: TFieldSchema;
}) {
	type TValue = KvValue<TFieldSchema>;

	const nullable = isNullableFieldSchema(schema);
	const validator = fieldSchemaToYjsArktype(schema);

	return {
		/** The name of this KV key */
		name: keyName,

		/** The schema definition for this KV field */
		schema,

		/**
		 * Get the current value for this KV key.
		 *
		 * Returns a discriminated union with status:
		 * - `{ status: 'valid', value }` if value exists and passes validation
		 * - `{ status: 'invalid', key, error }` if value exists but fails validation
		 * - `{ status: 'not_found', key }` if value is unset (no default, not nullable)
		 *
		 * For unset values: returns default if defined, null if nullable.
		 *
		 * @example
		 * ```typescript
		 * const result = kv.theme.get();
		 * if (result.status === 'valid') {
		 *   console.log(result.value); // 'dark' | 'light'
		 * } else if (result.status === 'invalid') {
		 *   console.error(result.error.context.summary);
		 * } else {
		 *   console.log('Key not set:', result.key);
		 * }
		 * ```
		 */
		get(): KvGetResult<TValue> {
			const rawValue = ykv.get(keyName);

			// Handle undefined: default → null → not_found
			if (rawValue === undefined) {
				if (schema.default !== undefined) {
					return { status: 'valid', value: schema.default as TValue };
				}
				if (nullable) {
					return { status: 'valid', value: null as TValue };
				}
				return { status: 'not_found', key: keyName };
			}

			// Validate existing value
			const validationResult = validator(rawValue);
			if (validationResult instanceof type.errors) {
				return {
					status: 'invalid',
					key: keyName,
					error: KvValidationError({
						message: `KV key '${keyName}' failed validation`,
						context: {
							key: keyName,
							errors: validationResult,
							summary: validationResult.summary,
						},
					}),
				};
			}

			return { status: 'valid', value: rawValue as TValue };
		},

		/**
		 * Set the value for this KV key.
		 *
		 * All field types (text, select, boolean, integer, real, date, richtext, tags)
		 * accept plain JavaScript values. The value is stored directly in YJS.
		 *
		 * @param value - The value to set
		 *
		 * @example
		 * ```typescript
		 * kv.theme.set('dark');
		 * kv.count.set(42);
		 * kv.categories.set(['tech', 'blog']);
		 * ```
		 */
		set(value: TValue): void {
			ykv.set(keyName, value as KvValue);
		},

		/**
		 * Watch for changes to this KV value.
		 *
		 * The callback fires whenever this specific key changes, whether from
		 * local updates or sync from other peers. Receives the same `KvGetResult`
		 * discriminated union as `get()`.
		 *
		 * @param callback - Function called with KvGetResult on each change
		 * @returns Unsubscribe function to stop watching
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.theme.observe((result) => {
		 *   if (result.status === 'valid') {
		 *     document.body.className = result.value;
		 *   } else if (result.status === 'invalid') {
		 *     console.error('Invalid:', result.error.context.summary);
		 *   }
		 * });
		 * unsubscribe(); // Stop watching
		 * ```
		 */
		observe(callback: (result: KvGetResult<TValue>) => void): () => void {
			const handler: YKeyValueChangeHandler<unknown> = (changes) => {
				if (changes.has(keyName)) {
					callback(this.get());
				}
			};
			ykv.on('change', handler);
			return () => ykv.off('change', handler);
		},

		/**
		 * Reset this KV key to its default value.
		 *
		 * If a default is defined in the schema, sets to that value.
		 * If nullable with no default, sets to null.
		 * Otherwise, deletes the key entirely (subsequent `get()` returns `not_found`).
		 *
		 * @example
		 * ```typescript
		 * kv.theme.reset(); // Back to schema default
		 * ```
		 */
		reset(): void {
			if (schema.default !== undefined) {
				this.set(schema.default as TValue);
			} else if (nullable) {
				this.set(null as TValue);
			} else {
				ykv.delete(keyName);
			}
		},

		/**
		 * Type inference helper for the runtime value type.
		 *
		 * @example
		 * ```typescript
		 * type Theme = typeof kv.theme.$inferValue; // 'dark' | 'light'
		 * ```
		 */
		$inferValue: null as unknown as TValue,

		/**
		 * Type inference helper for the input value type.
		 *
		 * @example
		 * ```typescript
		 * type ThemeInput = typeof kv.theme.$inferInputValue; // 'dark' | 'light'
		 * ```
		 */
		$inferInputValue: null as unknown as TValue,
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
