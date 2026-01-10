/**
 * Shared lifecycle protocol for providers and capabilities.
 *
 * Both providers (attached to docs) and capabilities (attached to workspaces)
 * follow this protocol for consistent async initialization and cleanup.
 */

/**
 * A value that may be synchronous or wrapped in a Promise.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Required lifecycle exports for providers and capabilities.
 *
 * Both `whenSynced` and `destroy` are required to ensure consistent
 * lifecycle management across the system.
 *
 * - `whenSynced`: Resolves when the provider/capability is fully initialized
 *   and ready for use. UI can await this in a render gate.
 * - `destroy`: Cleans up resources. Called when the parent doc/client is destroyed.
 *
 * @typeParam T - Additional exports merged with lifecycle fields. Defaults to
 *   `Record<string, unknown>` for arbitrary additional properties.
 *
 * @example
 * ```typescript
 * // With specific exports
 * type SqliteExports = LifecycleExports<{ db: Database; query: QueryFn }>;
 * // → { whenSynced, destroy, db, query }
 *
 * // Without type parameter (allows any additional properties)
 * type GenericExports = LifecycleExports;
 * // → { whenSynced, destroy } & Record<string, unknown>
 * ```
 */
export type LifecycleExports<
	T extends Record<string, unknown> = Record<string, unknown>,
> = {
	/**
	 * Resolves when initialization is complete.
	 *
	 * For persistence providers: when initial data is loaded from storage.
	 * For sync providers: when initial server sync is complete.
	 * For SQLite: when the database is ready and indexed.
	 */
	whenSynced: Promise<unknown>;

	/**
	 * Clean up resources.
	 *
	 * Called when the parent doc/client is destroyed.
	 * Should stop observers, close connections, etc.
	 */
	destroy: () => MaybePromise<void>;
} & T;

/**
 * Create lifecycle exports with default values for missing fields.
 *
 * Pass in any exports object. If `whenSynced` or `destroy` are omitted,
 * they'll be filled in with no-op defaults automatically.
 *
 * @example
 * ```typescript
 * // Return from a capability - only include lifecycle fields if needed
 * return LifecycleExports({ db: sqliteDb });
 * // → { db: sqliteDb, whenSynced: Promise.resolve(), destroy: () => {} }
 *
 * // With custom lifecycle
 * return LifecycleExports({
 *   db: sqliteDb,
 *   whenSynced: initPromise,
 *   destroy: () => db.close(),
 * });
 * ```
 */
export function LifecycleExports<
	T extends Record<string, unknown> = Record<string, unknown>,
>(exports?: T): LifecycleExports<T> {
	const {
		whenSynced = Promise.resolve(),
		destroy = () => {},
		...rest
	} = (exports ?? {}) as T & Partial<LifecycleExports<T>>;
	return { ...rest, whenSynced, destroy } as LifecycleExports<T>;
}
