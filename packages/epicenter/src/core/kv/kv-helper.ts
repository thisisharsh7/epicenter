import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import type * as Y from 'yjs';

import type { KvDefinitionMap, KvFieldSchema, KvValue } from '../schema';
import { fieldSchemaToYjsArktype, isNullableFieldSchema } from '../schema';

/**
 * Change event for a KV value.
 *
 * Matches the same semantics as the old YKeyValue change events:
 * - `add`: Key was set for the first time
 * - `update`: Key's value was changed
 * - `delete`: Key was removed
 */
export type KvChange<T> =
	| { action: 'add'; newValue: T }
	| { action: 'update'; oldValue: T; newValue: T }
	| { action: 'delete'; oldValue: T };

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
 * Creates a collection of typed KV helpers for all keys in a definition map.
 *
 * Uses native Y.Map for efficient storage. KV data is stored directly
 * as key-value pairs in the map.
 */
export function createKvHelpers<TKvDefinitionMap extends KvDefinitionMap>({
	ydoc,
	definitions,
}: {
	ydoc: Y.Doc;
	definitions: TKvDefinitionMap;
}) {
	const ykvMap = ydoc.getMap<KvValue>('kv');

	return Object.fromEntries(
		Object.entries(definitions).map(([keyName, definition]) => [
			keyName,
			createKvHelper({
				keyName,
				ykvMap,
				fieldSchema: definition.field,
			}),
		]),
	) as {
		[K in keyof TKvDefinitionMap]: KvHelper<TKvDefinitionMap[K]['field']>;
	};
}

export function createKvHelper<TFieldSchema extends KvFieldSchema>({
	keyName,
	ykvMap,
	fieldSchema,
}: {
	keyName: string;
	ykvMap: Y.Map<KvValue>;
	fieldSchema: TFieldSchema;
}) {
	type TValue = KvValue<TFieldSchema>;

	const nullable = isNullableFieldSchema(fieldSchema);
	const validator = fieldSchemaToYjsArktype(fieldSchema);

	return {
		/** The name of this KV key */
		name: keyName,

		/**
		 * The field schema for this KV entry.
		 *
		 * Contains the type and constraints (options, default, nullable, etc.)
		 * for this key's value. Consistent with `KvDefinition.field`.
		 *
		 * @example
		 * ```typescript
		 * console.log(kv.theme.field.type);    // 'select'
		 * console.log(kv.theme.field.options); // ['light', 'dark']
		 * console.log(kv.theme.field.default); // 'light'
		 * ```
		 */
		field: fieldSchema,

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
			const rawValue = ykvMap.get(keyName);

			// Handle undefined: default → null → not_found
			if (rawValue === undefined) {
				if ('default' in fieldSchema && fieldSchema.default !== undefined) {
					return { status: 'valid', value: fieldSchema.default as TValue };
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
			ykvMap.set(keyName, value as KvValue);
		},

		/**
		 * Watch for changes to this KV value.
		 *
		 * Callback receives the raw change from YJS with:
		 * - `action`: 'add' | 'update' | 'delete'
		 * - `newValue`: the new value (for add/update)
		 * - `oldValue`: the previous value (for update/delete)
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.theme.observeChanges((change, transaction) => {
		 *   switch (change.action) {
		 *     case 'add':
		 *     case 'update':
		 *       document.body.className = String(change.newValue);
		 *       break;
		 *     case 'delete':
		 *       document.body.className = '';
		 *       break;
		 *   }
		 * });
		 * unsubscribe(); // Stop watching
		 * ```
		 */
		observeChanges(
			callback: (change: KvChange<TValue>, transaction: Y.Transaction) => void,
		): () => void {
			const handler = (
				event: Y.YMapEvent<KvValue>,
				transaction: Y.Transaction,
			) => {
				const keyChange = event.changes.keys.get(keyName);
				if (!keyChange) return;

				const newValue = ykvMap.get(keyName) as TValue;

				if (keyChange.action === 'add') {
					callback({ action: 'add', newValue }, transaction);
				} else if (keyChange.action === 'update') {
					callback(
						{
							action: 'update',
							oldValue: keyChange.oldValue as TValue,
							newValue,
						},
						transaction,
					);
				} else if (keyChange.action === 'delete') {
					callback(
						{ action: 'delete', oldValue: keyChange.oldValue as TValue },
						transaction,
					);
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
		 * Otherwise, deletes the key entirely (subsequent `get()` returns `not_found`).
		 *
		 * @example
		 * ```typescript
		 * kv.theme.reset(); // Back to schema default
		 * ```
		 */
		reset(): void {
			if ('default' in fieldSchema && fieldSchema.default !== undefined) {
				this.set(fieldSchema.default as TValue);
			} else if (nullable) {
				this.set(null as TValue);
			} else {
				ykvMap.delete(keyName);
			}
		},

		/**
		 * Type inference helper for the runtime value type.
		 *
		 * @example
		 * ```typescript
		 * type Theme = typeof kv('theme').inferValue; // 'dark' | 'light'
		 * ```
		 */
		inferValue: null as unknown as TValue,
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
