import * as Y from 'yjs';

import type { KvFieldSchema, KvSchema, KvValue } from '../schema';
import { isNullableFieldSchema } from '../schema';

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

	const nullable = isNullableFieldSchema(schema);

	const getCurrentValue = (): TValue => {
		const value = ykvMap.get(keyName);

		if (value === undefined) {
			if ('default' in schema && schema.default !== undefined) {
				return schema.default as TValue;
			}
			if (nullable) {
				return null as TValue;
			}
		}

		return value as TValue;
	};

	const setValueFromSerialized = (input: TValue): void => {
		ydoc.transact(() => {
			if (input === null) {
				ykvMap.set(keyName, null);
				return;
			}

			ykvMap.set(keyName, input as KvValue);
		});
	};

	return {
		/** The name of this KV key */
		name: keyName,

		/** The schema definition for this KV field */
		schema,

		/**
		 * Get the current value for this KV key.
		 *
		 * Returns the stored value, or the default value if not set,
		 * or null if nullable and no default exists.
		 *
		 * @returns The current value
		 *
		 * @example
		 * ```typescript
		 * const theme = kv.theme.get(); // 'dark' | 'light'
		 * ```
		 */
		get(): TValue {
			return getCurrentValue();
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
			setValueFromSerialized(value);
		},

		/**
		 * Watch for changes to this KV value.
		 *
		 * The callback fires whenever this specific key changes, whether from
		 * local updates or sync from other peers.
		 *
		 * @param callback - Function called with the new value on each change
		 * @returns Unsubscribe function to stop watching
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.theme.observe((value) => {
		 *   document.body.className = value;
		 * });
		 *
		 * // Later: stop watching
		 * unsubscribe();
		 * ```
		 */
		observe(callback: (value: TValue) => void) {
			const handler = (event: Y.YMapEvent<KvValue>) => {
				if (event.keysChanged.has(keyName)) {
					callback(getCurrentValue());
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
					const defaultValue = schema.default as TValue;
					setValueFromSerialized(defaultValue);
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
