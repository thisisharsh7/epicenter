import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import { Ok, type Result } from 'wellcrafted/result';
import * as Y from 'yjs';

import type {
	KvFieldSchema,
	KvSchema,
	KvValue,
	SerializedKvValue,
} from '../schema';
import {
	fieldSchemaToYjsArktype,
	isDateWithTimezone,
	isDateWithTimezoneString,
	isNullableFieldSchema,
} from '../schema';
import { updateYArrayFromArray, updateYTextFromString } from '../utils/yjs';

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

export type YKvMap = Y.Map<KvValue>;

/**
 * Creates a collection of typed KV helpers for all keys in a schema.
 *
 * Each key in the schema gets its own helper with get/set operations
 * that handle YJS synchronization and type validation.
 */
export function createKvHelpers<TKvSchema extends KvSchema>({
	ydoc,
	schema,
	ykvMap,
}: {
	ydoc: Y.Doc;
	schema: TKvSchema;
	ykvMap: YKvMap;
}) {
	return Object.fromEntries(
		Object.entries(schema).map(([keyName, columnSchema]) => [
			keyName,
			createKvHelper({
				ydoc,
				keyName,
				ykvMap,
				schema: columnSchema,
			}),
		]),
	) as {
		[K in keyof TKvSchema]: KvHelper<TKvSchema[K]>;
	};
}

export function createKvHelper<TFieldSchema extends KvFieldSchema>({
	ydoc,
	keyName,
	ykvMap,
	schema,
}: {
	ydoc: Y.Doc;
	keyName: string;
	ykvMap: YKvMap;
	schema: TFieldSchema;
}) {
	type TValue = KvValue<TFieldSchema>;
	type TSerializedValue = SerializedKvValue<TFieldSchema>;

	const nullable = isNullableFieldSchema(schema);

	const getOrCreateYjsValue = (): TValue => {
		const existing = ykvMap.get(keyName);
		if (existing !== undefined) {
			return existing as TValue;
		}

		if (schema['x-component'] === 'ytext') {
			const ytext = new Y.Text();
			ykvMap.set(keyName, ytext);
			return ytext as TValue;
		}

		if (schema['x-component'] === 'tags') {
			const yarray = new Y.Array<string>();
			ykvMap.set(keyName, yarray);
			return yarray as TValue;
		}

		return undefined as unknown as TValue;
	};

	const getCurrentValue = (): TValue => {
		const value = ykvMap.get(keyName);

		if (value === undefined) {
			if ('default' in schema && schema.default !== undefined) {
				const defaultVal = schema.default;
				if (isDateWithTimezone(defaultVal)) {
					return defaultVal.toJSON() as TValue;
				}
				return defaultVal as TValue;
			}
			if (nullable) {
				return null as TValue;
			}
		}

		if (schema['x-component'] === 'ytext' || schema['x-component'] === 'tags') {
			return getOrCreateYjsValue();
		}

		return value as TValue;
	};

	const setValueFromSerialized = (input: TSerializedValue): void => {
		ydoc.transact(() => {
			if (input === null) {
				ykvMap.set(keyName, null);
				return;
			}

			if (schema['x-component'] === 'ytext' && typeof input === 'string') {
				const ytext = getOrCreateYjsValue() as Y.Text;
				updateYTextFromString(ytext, input);
				return;
			}

			if (schema['x-component'] === 'tags' && Array.isArray(input)) {
				const yarray = getOrCreateYjsValue() as Y.Array<string>;
				updateYArrayFromArray(yarray, input);
				return;
			}

			if (schema['x-component'] === 'date' && isDateWithTimezoneString(input)) {
				ykvMap.set(keyName, input);
				return;
			}

			ykvMap.set(keyName, input as KvValue);
		});
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
		 * Set the value for this KV key from a serialized (plain JS) value.
		 *
		 * For primitive types (text, select, boolean, integer, real, date),
		 * use this to update the value directly.
		 *
		 * For Y.js-backed types (ytext, tags), you typically bind `.get()` to
		 * your UI component (text editor, tag input) and let Y.js handle edits
		 * directly. This `.set()` method is primarily used by providers when
		 * loading serialized data from storage (markdown files, SQLite, etc.).
		 *
		 * @param value - The serialized value to set
		 *
		 * @example
		 * ```typescript
		 * // Primitive types: use set() directly
		 * kv.theme.set('dark');
		 * kv.count.set(42);
		 *
		 * // Y.js types: typically bind get() to UI, not set()
		 * const ytext = kv.notes.get(); // Y.Text instance
		 * bindToEditor(ytext);          // Editor handles edits via Y.Text API
		 * ```
		 */
		set(value: TSerializedValue): void {
			setValueFromSerialized(value);
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
			const handler = (event: Y.YMapEvent<KvValue>) => {
				if (event.keysChanged.has(keyName)) {
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
			ykvMap.observe(handler);
			return () => ykvMap.unobserve(handler);
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
			ydoc.transact(() => {
				if ('default' in schema && schema.default !== undefined) {
					const defaultVal = schema.default;
					const serializedDefault = isDateWithTimezone(defaultVal)
						? (defaultVal.toJSON() as TSerializedValue)
						: (defaultVal as TSerializedValue);
					setValueFromSerialized(serializedDefault);
				} else if (nullable) {
					ykvMap.set(keyName, null);
				} else {
					ykvMap.delete(keyName);
				}
			});
		},

		/**
		 * Type inference helper for the runtime value type.
		 *
		 * Use this to extract the type returned by `.get()`. For Y.js-backed
		 * fields (ytext, tags), this is the Y.js type (Y.Text, Y.Array).
		 *
		 * Alternative: `ReturnType<typeof kv.fieldName.get>`
		 *
		 * @example
		 * ```typescript
		 * type Theme = typeof kv.theme.$inferValue; // 'dark' | 'light'
		 * type Notes = typeof kv.notes.$inferValue; // Y.Text
		 * ```
		 */
		$inferValue: null as unknown as TValue,

		/**
		 * Type inference helper for the serialized value type.
		 *
		 * Use this to extract the type accepted by `.set()`. For Y.js-backed
		 * fields (ytext, tags), this is the plain JS type (string, string[]).
		 *
		 * @example
		 * ```typescript
		 * type ThemeSerialized = typeof kv.theme.$inferSerializedValue; // 'dark' | 'light'
		 * type NotesSerialized = typeof kv.notes.$inferSerializedValue; // string
		 * ```
		 */
		$inferSerializedValue: null as unknown as TSerializedValue,

		toJSON(): TSerializedValue | null {
			const value = getCurrentValue();
			if (value === undefined) {
				return null;
			}
			if (value instanceof Y.Text) {
				return value.toString() as TSerializedValue;
			}
			if (value instanceof Y.Array) {
				return value.toArray() as TSerializedValue;
			}
			return value as TSerializedValue;
		},
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
