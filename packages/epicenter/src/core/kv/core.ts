import { regex } from 'arkregex';
import type * as Y from 'yjs';

import type { KvDefinitionMap, KvFieldDefinition, KvValue } from '../schema';

import type { KvHelper } from './kv-helper';
import { createKvHelpers } from './kv-helper';

const KV_KEY_PATTERN = regex('^[a-z][a-z0-9_]*$');

export type { KvHelper } from './kv-helper';

/**
 * Create a KV (key-value) store from definitions.
 *
 * Conceptually, a KV store is like a single table row where each key is a column.
 * While tables have multiple rows with IDs, KV stores have one "row" of settings/state.
 *
 * @param ydoc - The Y.Doc to store KV data in
 * @param definitions - Map of key names to their definitions (metadata + field schema)
 *
 * @example
 * ```typescript
 * import { createKv, kv, icon, select, integer } from '@epicenter/hq';
 *
 * const settings = createKv(ydoc, {
 *   theme: kv({
 *     name: 'Theme',
 *     icon: icon.emoji('🎨'),
 *     field: select({ options: ['light', 'dark'], default: 'light' }),
 *     description: 'Application color theme',
 *   }),
 *   fontSize: kv({
 *     name: 'Font Size',
 *     icon: icon.emoji('🔤'),
 *     field: integer({ default: 14 }),
 *     description: 'Editor font size in pixels',
 *   }),
 * });
 *
 * settings.theme.set('dark');
 * settings.fontSize.set(16);
 * ```
 */
export function createKv<TKvDefinitionMap extends KvDefinitionMap>(
	ydoc: Y.Doc,
	definitions: TKvDefinitionMap,
) {
	for (const keyName of Object.keys(definitions)) {
		if (keyName.startsWith('$')) {
			throw new Error(
				`KV key "${keyName}" is invalid: cannot start with "$" (reserved for utilities)`,
			);
		}
		if (!KV_KEY_PATTERN.test(keyName)) {
			throw new Error(
				`KV key "${keyName}" is invalid: must start with a lowercase letter and contain only lowercase letters, numbers, and underscores (e.g., "theme", "last_sync", "count2")`,
			);
		}
	}

	const ykvMap = ydoc.getMap<KvValue>('kv');
	const kvHelpers = createKvHelpers({ ydoc, definitions });

	// Type helper to extract field schema from definition
	type FieldOf<K extends keyof TKvDefinitionMap> = TKvDefinitionMap[K]['field'];

	return {
		...kvHelpers,

		/**
		 * The raw KV definitions passed to createKv.
		 *
		 * Provides access to the full definition including metadata (name, icon, description)
		 * and the field schema. Useful for introspection, UI generation, or MCP/OpenAPI export.
		 *
		 * @example
		 * ```typescript
		 * // Access definition metadata
		 * console.log(kv.$definitions.theme.name);        // 'Theme'
		 * console.log(kv.$definitions.theme.icon);        // { type: 'emoji', value: '🎨' }
		 * console.log(kv.$definitions.theme.description); // 'Application color theme'
		 *
		 * // Access the field schema
		 * console.log(kv.$definitions.theme.field.type);    // 'select'
		 * console.log(kv.$definitions.theme.field.options); // ['light', 'dark']
		 *
		 * // Iterate over all definitions
		 * for (const [key, def] of Object.entries(kv.$definitions)) {
		 *   console.log(`${def.name} (${key}): ${def.field.type}`);
		 * }
		 * ```
		 */
		$definitions: definitions,

		/**
		 * Get all KV helpers as an array.
		 *
		 * Useful for providers and initializers that need to iterate over all keys.
		 * Returns only the KV helpers, excluding utility methods like `clearAll`.
		 *
		 * @example
		 * ```typescript
		 * // Log all current values
		 * for (const helper of kv.$all()) {
		 *   const result = helper.get();
		 *   if (result.status === 'valid') {
		 *     console.log(helper.name, result.value);
		 *   }
		 * }
		 *
		 * // Reset all keys to defaults
		 * for (const helper of kv.$all()) {
		 *   helper.reset();
		 * }
		 * ```
		 */
		$all() {
			return Object.values(kvHelpers) as KvHelper<
				FieldOf<keyof TKvDefinitionMap>
			>[];
		},

		/**
		 * Serialize all KV values to a plain JSON object.
		 *
		 * Returns the current value for each key. If a key is invalid or not found,
		 * returns `null` for that key. Useful for debugging, persistence, or API responses.
		 *
		 * @example
		 * ```typescript
		 * kv.theme.set('dark');
		 * kv.fontSize.set(16);
		 *
		 * const json = kv.$toJSON();
		 * // { theme: 'dark', fontSize: 16 }
		 *
		 * // Save to localStorage
		 * localStorage.setItem('settings', JSON.stringify(kv.$toJSON()));
		 * ```
		 */
		$toJSON() {
			const result: Record<string, unknown> = {};
			for (const keyName of Object.keys(definitions)) {
				const helper = kvHelpers[keyName as keyof typeof kvHelpers];
				const getResult = helper.get();
				if (getResult.status === 'valid') {
					result[keyName] = getResult.value;
				} else {
					result[keyName] = null;
				}
			}
			return result as {
				[K in keyof TKvDefinitionMap]: KvValue<FieldOf<K>>;
			};
		},

		/**
		 * Clear all KV values, resetting them to their schema defaults.
		 *
		 * Deletes all keys from the underlying Y.Map. After clearing,
		 * `get()` will return defaults (if defined), `null` (if nullable),
		 * or `not_found` status.
		 *
		 * @example
		 * ```typescript
		 * kv.theme.set('dark');
		 * kv.fontSize.set(20);
		 *
		 * kv.clearAll();
		 *
		 * kv.theme.get();    // { status: 'valid', value: 'light' } (default)
		 * kv.fontSize.get(); // { status: 'valid', value: 14 } (default)
		 * ```
		 */
		clearAll(): void {
			for (const keyName of Object.keys(definitions)) {
				ykvMap.delete(keyName);
			}
		},
	};
}

/**
 * Type alias for the return type of createKv.
 * Useful for typing function parameters that accept a KV instance.
 */
export type Kv<TKvDefinitionMap extends KvDefinitionMap> = ReturnType<
	typeof createKv<TKvDefinitionMap>
>;
