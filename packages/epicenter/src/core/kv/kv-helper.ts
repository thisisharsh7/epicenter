import * as Y from 'yjs';

import type {
	KvFieldSchema,
	KvSchema,
	KvValue,
	SerializedKvValue,
} from '../schema';
import { isDateWithTimezoneString, isNullableFieldSchema } from '../schema';
import { updateYTextFromString } from '../utils/yjs';

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

		return undefined as unknown as TValue;
	};

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

		if (schema['x-component'] === 'ytext') {
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
				ykvMap.set(keyName, input);
				return;
			}

			if (schema['x-component'] === 'date' && isDateWithTimezoneString(input)) {
				ykvMap.set(keyName, input);
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
					const serializedDefault = schema.default as TSerializedValue;
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
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
