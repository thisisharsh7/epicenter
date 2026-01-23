import type * as Y from 'yjs';

import type { KvDefinitionMap, KvValue } from '../schema';

import type { KvHelper } from './kv-helper';
import { createKvHelpers } from './kv-helper';

/** Y.Map storing all KV values, keyed by key name. */
export type KvMap = Y.Map<KvValue>;

export type { KvHelper } from './kv-helper';

/**
 * Callable function type for accessing KV entries.
 *
 * The kv object is a callable function: `kv('theme')` returns a KvHelper.
 * It also has properties for utility methods: `kv.has()`, `kv.names()`, etc.
 *
 * This pattern eliminates collision risk between user-defined key names and
 * utility methods, since user names only appear as function arguments.
 */
export type KvFunction<TKvDefinitionMap extends KvDefinitionMap> = {
	// ════════════════════════════════════════════════════════════════════
	// CALL SIGNATURE
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Get a KV helper by key name.
	 *
	 * @example
	 * ```typescript
	 * kv('theme').set('dark')
	 * kv('theme').get()  // { status: 'valid', value: 'dark' }
	 * ```
	 */
	<K extends keyof TKvDefinitionMap & string>(
		name: K,
	): KvHelper<TKvDefinitionMap[K]['field']>;

	// ════════════════════════════════════════════════════════════════════
	// EXISTENCE & ENUMERATION
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Check if a KV key has a value set in YJS storage.
	 */
	has(name: string): boolean;

	/**
	 * Get all defined KV key names.
	 */
	names(): (keyof TKvDefinitionMap & string)[];

	/**
	 * Get all KV helpers as an array.
	 */
	all(): KvHelper<TKvDefinitionMap[keyof TKvDefinitionMap]['field']>[];

	// ════════════════════════════════════════════════════════════════════
	// BULK OPERATIONS
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Clear all KV values, resetting them to their definition defaults.
	 */
	clear(): void;

	// ════════════════════════════════════════════════════════════════════
	// METADATA
	// ════════════════════════════════════════════════════════════════════

	/**
	 * The raw KV definitions passed to createKv.
	 */
	definitions: TKvDefinitionMap;

	// ════════════════════════════════════════════════════════════════════
	// OBSERVATION
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Observe any KV changes. Callback is notified when any key changes.
	 */
	observe(callback: () => void): () => void;

	// ════════════════════════════════════════════════════════════════════
	// UTILITIES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * Serialize all KV values to a plain JSON object.
	 */
	toJSON(): {
		[K in keyof TKvDefinitionMap]: KvValue<TKvDefinitionMap[K]['field']>;
	};
};

/**
 * Create a KV (key-value) store from definitions.
 *
 * The returned object is a **callable function** that returns KV helpers.
 * Utility methods are properties on the function itself.
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
 * // KV entries are accessed by calling the function
 * settings('theme').set('dark');
 * settings('fontSize').set(16);
 *
 * // With destructuring (unchanged ergonomics)
 * const theme = settings('theme');
 * theme.set('dark');
 * theme.get();
 * ```
 */
export function createKv<TKvDefinitionMap extends KvDefinitionMap>(
	ydoc: Y.Doc,
	definitions: TKvDefinitionMap,
): KvFunction<TKvDefinitionMap> {
	const ykvMap = ydoc.getMap<KvValue>('kv');
	const kvHelpers = createKvHelpers({ ydoc, definitions });

	const definedKeyNames = Object.keys(definitions) as Array<
		keyof TKvDefinitionMap & string
	>;

	// ════════════════════════════════════════════════════════════════════
	// BUILD CALLABLE FUNCTION WITH PROPERTIES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * The main accessor function. Call with a key name to get a helper.
	 */
	const kvAccessor = <K extends keyof TKvDefinitionMap & string>(
		name: K,
	): KvHelper<TKvDefinitionMap[K]['field']> => {
		return kvHelpers[name];
	};

	// Use Object.assign for cleaner property attachment
	return Object.assign(kvAccessor, {
		// ════════════════════════════════════════════════════════════════════
		// EXISTENCE & ENUMERATION
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Check if a KV key has a value set in YJS storage.
		 *
		 * Returns true if a value has been explicitly set (even if it's null).
		 * Returns false if the key has never been set (will use default).
		 *
		 * @example
		 * ```typescript
		 * kv.has('theme')  // false (never set, will use default)
		 * kv('theme').set('dark')
		 * kv.has('theme')  // true
		 * ```
		 */
		has(name: string): boolean {
			return ykvMap.has(name);
		},

		/**
		 * Get all defined KV key names.
		 *
		 * @example
		 * ```typescript
		 * kv.names()  // ['theme', 'fontSize', ...]
		 * ```
		 */
		names(): (keyof TKvDefinitionMap & string)[] {
			return [...definedKeyNames];
		},

		/**
		 * Get all KV helpers as an array.
		 *
		 * Useful for providers and initializers that need to iterate over all keys.
		 *
		 * @example
		 * ```typescript
		 * // Log all current values
		 * for (const helper of kv.all()) {
		 *   const result = helper.get();
		 *   if (result.status === 'valid') {
		 *     console.log(helper.name, result.value);
		 *   }
		 * }
		 *
		 * // Reset all keys to defaults
		 * for (const helper of kv.all()) {
		 *   helper.reset();
		 * }
		 * ```
		 */
		all(): KvHelper<TKvDefinitionMap[keyof TKvDefinitionMap]['field']>[] {
			return Object.values(kvHelpers) as KvHelper<
				TKvDefinitionMap[keyof TKvDefinitionMap]['field']
			>[];
		},

		// ════════════════════════════════════════════════════════════════════
		// BULK OPERATIONS
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Clear all KV values, resetting them to their definition defaults.
		 *
		 * Deletes all keys from the underlying Y.Map. After clearing,
		 * `get()` will return defaults (if defined), `null` (if nullable),
		 * or `not_found` status.
		 *
		 * @example
		 * ```typescript
		 * kv('theme').set('dark');
		 * kv('fontSize').set(20);
		 *
		 * kv.clear();
		 *
		 * kv('theme').get();    // { status: 'valid', value: 'light' } (default)
		 * kv('fontSize').get(); // { status: 'valid', value: 14 } (default)
		 * ```
		 */
		clear(): void {
			for (const keyName of Object.keys(definitions)) {
				ykvMap.delete(keyName);
			}
		},

		// ════════════════════════════════════════════════════════════════════
		// METADATA & ESCAPE HATCHES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * The raw KV definitions passed to createKv.
		 *
		 * Provides access to the full definition including metadata (name, icon, description)
		 * and the field schema. Useful for introspection, UI generation, or MCP/OpenAPI export.
		 *
		 * @example
		 * ```typescript
		 * // Access definition metadata
		 * console.log(kv.definitions.theme.name);        // 'Theme'
		 * console.log(kv.definitions.theme.icon);        // { type: 'emoji', value: '🎨' }
		 * console.log(kv.definitions.theme.description); // 'Application color theme'
		 *
		 * // Access the field schema
		 * console.log(kv.definitions.theme.field.type);    // 'select'
		 * console.log(kv.definitions.theme.field.options); // ['light', 'dark']
		 *
		 * // Iterate over all definitions
		 * for (const [key, def] of Object.entries(kv.definitions)) {
		 *   console.log(`${def.name} (${key}): ${def.field.type}`);
		 * }
		 * ```
		 */
		definitions,

		// ════════════════════════════════════════════════════════════════════
		// OBSERVATION
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Observe any KV changes. Callback is notified when any key changes.
		 *
		 * The observer just notifies that something changed. To get the current
		 * state, call `toJSON()` inside your callback or use individual key getters.
		 *
		 * @returns Unsubscribe function to stop observing
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.observe(() => {
		 *   // Something changed - fetch current state if needed
		 *   const snapshot = kv.toJSON();
		 *   saveToFile(snapshot);
		 * });
		 *
		 * // Later, stop observing
		 * unsubscribe();
		 * ```
		 */
		observe(callback: () => void): () => void {
			ykvMap.observeDeep(callback);
			return () => ykvMap.unobserveDeep(callback);
		},

		// ════════════════════════════════════════════════════════════════════
		// UTILITIES
		// ════════════════════════════════════════════════════════════════════

		/**
		 * Serialize all KV values to a plain JSON object.
		 *
		 * Returns the raw Y.Map contents. Keys may be missing if never set,
		 * and values may not match the schema (no validation performed).
		 * Useful for debugging, persistence, or API responses.
		 *
		 * @example
		 * ```typescript
		 * kv('theme').set('dark');
		 * kv('fontSize').set(16);
		 *
		 * const json = kv.toJSON();
		 * // { theme: 'dark', fontSize: 16 }
		 *
		 * // Save to localStorage
		 * localStorage.setItem('settings', JSON.stringify(kv.toJSON()));
		 * ```
		 */
		toJSON(): {
			[K in keyof TKvDefinitionMap]: KvValue<TKvDefinitionMap[K]['field']>;
		} {
			return ykvMap.toJSON() as {
				[K in keyof TKvDefinitionMap]: KvValue<TKvDefinitionMap[K]['field']>;
			};
		},
	}) as KvFunction<TKvDefinitionMap>;
}

/**
 * Type alias for the return type of createKv.
 * Useful for typing function parameters that accept a KV instance.
 */
export type Kv<TKvDefinitionMap extends KvDefinitionMap> = ReturnType<
	typeof createKv<TKvDefinitionMap>
>;
