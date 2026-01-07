import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import { Ok, type Result } from 'wellcrafted/result';
import type * as Y from 'yjs';

import type { KvFieldSchema, KvSchema, KvValue } from '../schema';
import { fieldSchemaToYjsArktype, isNullableFieldSchema } from '../schema';
import { YKeyValue, type YKeyValueChangeHandler } from '../utils/y-keyvalue';

/**
 * Context for KV validation errors
 */
type KvValidationContext = {
	key: string;
	errors: ArkErrors;
	summary: string;
};

/**
 * Error thrown when a KV value fails schema validation
 */
export const { KvValidationError, KvValidationErr } =
	createTaggedError('KvValidationError').withContext<KvValidationContext>();

export type KvValidationError = ReturnType<typeof KvValidationError>;

/**
 * Result of getting a KV value.
 * Uses a status-based discriminated union for explicit handling of all cases.
 */
export type KvGetResult<TValue> =
	| { status: 'valid'; value: TValue }
	| { status: 'invalid'; key: string; error: KvValidationError };

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

	const getCurrentValue = (): TValue => {
		const value = ykv.get(keyName);

		if (value === undefined) {
			if (schema.default !== undefined) {
				return schema.default as TValue;
			}
			if (nullable) {
				return null as TValue;
			}
		}

		return value as TValue;
	};

	const validator = fieldSchemaToYjsArktype(schema);

	return {
		/** The name of this KV key */
		name: keyName,

		/** The schema definition for this KV field */
		schema,

		/**
		 * Get the current value for this KV key.
		 *
		 * Returns a discriminated union with validation status:
		 * - `{ status: 'valid', value }` if value exists and passes validation
		 * - `{ status: 'invalid', key, error }` if value exists but fails validation
		 *
		 * For unset values: returns default if defined, null if nullable.
		 *
		 * @example
		 * ```typescript
		 * const result = kv.theme.get();
		 * if (result.status === 'valid') {
		 *   console.log(result.value); // 'dark' | 'light'
		 * } else {
		 *   console.error(result.error.context.summary);
		 * }
		 * ```
		 */
		get(): KvGetResult<TValue> {
			const value = getCurrentValue();
			const validationResult = validator(value);

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

			return { status: 'valid', value };
		},

		/**
		 * Set the value for this KV key.
		 *
		 * All field types (text, select, boolean, integer, real, date, richtext, tags)
		 * accept plain JavaScript values. The value is stored directly in YJS.
		 *
		 * For richtext fields, pass the rich content ID (string). The actual
		 * collaborative content lives in a separate Y.Doc referenced by this ID.
		 *
		 * @param value - The value to set
		 *
		 * @example
		 * ```typescript
		 * // Primitive types
		 * kv.theme.set('dark');
		 * kv.count.set(42);
		 * kv.enabled.set(true);
		 *
		 * // Tags (plain array)
		 * kv.categories.set(['tech', 'blog']);
		 *
		 * // Rich text (ID reference)
		 * kv.notes.set('rtxt_abc123');
		 * ```
		 */
		set(value: TValue): void {
			ykv.set(keyName, value as KvValue);
		},

		/**
		 * Watch for changes to this KV value.
		 *
		 * The callback fires whenever this specific key changes, whether from
		 * local updates or sync from other peers. Receives a Result type that
		 * may contain validation errors if the value doesn't match the schema.
		 *
		 * @param callback - Function called with Result on each change
		 * @returns Unsubscribe function to stop watching
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.theme.observe((result) => {
		 *   if (result.error) {
		 *     console.error('Invalid value:', result.error);
		 *     return;
		 *   }
		 *   document.body.className = result.data;
		 * });
		 *
		 * // Later: stop watching
		 * unsubscribe();
		 * ```
		 */
		observe(
			callback: (result: Result<TValue, KvValidationError>) => void,
		): () => void {
			const handler: YKeyValueChangeHandler<unknown> = (changes) => {
				if (changes.has(keyName)) {
					const value = getCurrentValue();
					const validationResult = validator(value);

					if (validationResult instanceof type.errors) {
						callback(
							KvValidationErr({
								message: `KV key '${keyName}' failed validation`,
								context: {
									key: keyName,
									errors: validationResult,
									summary: validationResult.summary,
								},
							}),
						);
					} else {
						callback(Ok(value));
					}
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
		 * Otherwise, deletes the key entirely.
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
		 * Use this to extract the type returned by `.get()`.
		 *
		 * Alternative: `ReturnType<typeof kv.fieldName.get>`
		 *
		 * @example
		 * ```typescript
		 * type Theme = typeof kv.theme.$inferValue; // 'dark' | 'light'
		 * type Notes = typeof kv.notes.$inferValue; // string (rich content ID)
		 * ```
		 */
		$inferValue: null as unknown as TValue,

		/**
		 * Type inference helper for the input value type.
		 *
		 * Use this to extract the type accepted by `.set()`.
		 * Same as `$inferValue` since KvValue is now JSON-serializable.
		 *
		 * @example
		 * ```typescript
		 * type ThemeInput = typeof kv.theme.$inferInputValue; // 'dark' | 'light'
		 * type NotesInput = typeof kv.notes.$inferInputValue; // string
		 * ```
		 */
		$inferInputValue: null as unknown as TValue,
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
