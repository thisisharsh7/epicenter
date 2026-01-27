/**
 * Shared types for the Static Workspace API.
 *
 * This module contains all type definitions for versioned tables and KV stores.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Lifecycle } from '../core/lifecycle.js';

// ════════════════════════════════════════════════════════════════════════════
// TABLE RESULT TYPES - Building Blocks
// ════════════════════════════════════════════════════════════════════════════

/** A row that passed validation. */
export type ValidRowResult<TRow> = { status: 'valid'; row: TRow };

/** A row that exists but failed validation. */
export type InvalidRowResult = {
	status: 'invalid';
	id: string;
	errors: readonly StandardSchemaV1.Issue[];
	row: unknown;
};

/** A row that was not found. */
export type NotFoundResult = { status: 'not_found'; id: string };

// ════════════════════════════════════════════════════════════════════════════
// TABLE RESULT TYPES - Composed Types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Result of validating a row.
 * The shape after parsing a row from storage - either valid or invalid.
 */
export type RowResult<TRow> = ValidRowResult<TRow> | InvalidRowResult;

/**
 * Result of getting a single row by ID.
 * Includes not_found since the row may not exist.
 */
export type GetResult<TRow> = RowResult<TRow> | NotFoundResult;

/** Result of deleting a single row */
export type DeleteResult =
	| { status: 'deleted' }
	| { status: 'not_found_locally' };

// ════════════════════════════════════════════════════════════════════════════
// KV RESULT TYPES
// ════════════════════════════════════════════════════════════════════════════

/** Result of getting a KV value */
export type KvGetResult<TValue> =
	| { status: 'valid'; value: TValue }
	| {
			status: 'invalid';
			errors: readonly StandardSchemaV1.Issue[];
			value: unknown;
	  }
	| { status: 'not_found' };

/** Change event for KV observation */
export type KvChange<TValue> =
	| { type: 'set'; value: TValue }
	| { type: 'delete' };

// ════════════════════════════════════════════════════════════════════════════
// TABLE DEFINITION TYPES
// ════════════════════════════════════════════════════════════════════════════

/** Extract the last element from a tuple, constrained to StandardSchemaV1 */
export type LastSchema<T extends readonly StandardSchemaV1[]> =
	T extends readonly [...StandardSchemaV1[], infer L extends StandardSchemaV1]
		? L
		: T[number];

/**
 * A table definition created by defineTable().version().migrate()
 *
 * @typeParam TVersions - Tuple of StandardSchemaV1 types representing all versions
 */
export type TableDefinition<TVersions extends readonly StandardSchemaV1[]> = {
	schema: StandardSchemaV1<
		unknown,
		StandardSchemaV1.InferOutput<TVersions[number]>
	>;
	migrate: (
		row: StandardSchemaV1.InferOutput<TVersions[number]>,
	) => StandardSchemaV1.InferOutput<LastSchema<TVersions>> & { id: string };
};

/** Extract the row type from a TableDefinition */
export type InferTableRow<T> =
	T extends TableDefinition<infer V extends readonly StandardSchemaV1[]>
		? StandardSchemaV1.InferOutput<LastSchema<V>> & { id: string }
		: never;

/** Extract the version union type from a TableDefinition */
export type InferTableVersionUnion<T> =
	T extends TableDefinition<infer V extends readonly StandardSchemaV1[]>
		? StandardSchemaV1.InferOutput<V[number]>
		: never;

// ════════════════════════════════════════════════════════════════════════════
// KV DEFINITION TYPES
// ════════════════════════════════════════════════════════════════════════════

/**
 * A KV definition created by defineKv().version().migrate()
 *
 * @typeParam TVersions - Tuple of StandardSchemaV1 types representing all versions
 */
export type KvDefinition<TVersions extends readonly StandardSchemaV1[]> = {
	schema: StandardSchemaV1<
		unknown,
		StandardSchemaV1.InferOutput<TVersions[number]>
	>;
	migrate: (
		value: StandardSchemaV1.InferOutput<TVersions[number]>,
	) => StandardSchemaV1.InferOutput<LastSchema<TVersions>>;
};

/** Extract the value type from a KvDefinition */
export type InferKvValue<T> =
	T extends KvDefinition<infer V extends readonly StandardSchemaV1[]>
		? StandardSchemaV1.InferOutput<LastSchema<V>>
		: never;

/** Extract the version union type from a KvDefinition */
export type InferKvVersionUnion<T> =
	T extends KvDefinition<infer V extends readonly StandardSchemaV1[]>
		? StandardSchemaV1.InferOutput<V[number]>
		: never;

// ════════════════════════════════════════════════════════════════════════════
// HELPER TYPES
// ════════════════════════════════════════════════════════════════════════════

/** Operations available inside a table batch transaction. */
export type TableBatchTransaction<TRow extends { id: string }> = {
	set(row: TRow): void;
	delete(id: string): void;
};

/** Helper for a single table */
export type TableHelper<TRow extends { id: string }> = {
	// ═══════════════════════════════════════════════════════════════════════
	// WRITE (always writes latest schema shape)
	// ═══════════════════════════════════════════════════════════════════════

	/** Set a row (insert or replace). Always writes full row. */
	set(row: TRow): void;

	// ═══════════════════════════════════════════════════════════════════════
	// READ (validates + migrates to latest)
	// ═══════════════════════════════════════════════════════════════════════

	/** Get a row by ID. Returns GetResult (valid | invalid | not_found). */
	get(id: string): GetResult<TRow>;

	/** Get all rows with validation status. */
	getAll(): RowResult<TRow>[];

	/** Get all valid rows (skips invalid). */
	getAllValid(): TRow[];

	/** Get all invalid rows (for debugging/repair). */
	getAllInvalid(): InvalidRowResult[];

	// ═══════════════════════════════════════════════════════════════════════
	// QUERY
	// ═══════════════════════════════════════════════════════════════════════

	/** Filter rows by predicate (only valid rows). */
	filter(predicate: (row: TRow) => boolean): TRow[];

	/** Find first row matching predicate (only valid rows). */
	find(predicate: (row: TRow) => boolean): TRow | undefined;

	// ═══════════════════════════════════════════════════════════════════════
	// DELETE
	// ═══════════════════════════════════════════════════════════════════════

	/** Delete a row by ID. */
	delete(id: string): DeleteResult;

	/** Delete all rows (table structure preserved). */
	clear(): void;

	// ═══════════════════════════════════════════════════════════════════════
	// BATCH (Y.js transaction for atomicity)
	// ═══════════════════════════════════════════════════════════════════════

	/**
	 * Execute multiple operations atomically in a Y.js transaction.
	 * - Single undo/redo step
	 * - Observers fire once (not per-operation)
	 * - All changes applied together
	 */
	batch(fn: (tx: TableBatchTransaction<TRow>) => void): void;

	// ═══════════════════════════════════════════════════════════════════════
	// OBSERVE
	// ═══════════════════════════════════════════════════════════════════════

	/** Watch for row changes. Returns unsubscribe function. */
	observe(
		callback: (changedIds: Set<string>, transaction: unknown) => void,
	): () => void;

	// ═══════════════════════════════════════════════════════════════════════
	// METADATA
	// ═══════════════════════════════════════════════════════════════════════

	/** Number of rows in table. */
	count(): number;

	/** Check if row exists. */
	has(id: string): boolean;
};

// ════════════════════════════════════════════════════════════════════════════
// WORKSPACE TYPES
// ════════════════════════════════════════════════════════════════════════════

/** Map of table definitions (uses `any` to allow variance in generic parameters) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableDefinitions = Record<string, TableDefinition<any>>;

/** Map of KV definitions (uses `any` to allow variance in generic parameters) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KvDefinitions = Record<string, KvDefinition<any>>;

/** Tables helper object with all table helpers */
export type TablesHelper<TTableDefinitions extends TableDefinitions> = {
	[K in keyof TTableDefinitions]: TableHelper<
		InferTableRow<TTableDefinitions[K]>
	>;
};

/** Operations available inside a KV batch transaction. */
export type KvBatchTransaction<TKvDefinitions extends KvDefinitions> = {
	set<K extends keyof TKvDefinitions & string>(
		key: K,
		value: InferKvValue<TKvDefinitions[K]>,
	): void;
	delete<K extends keyof TKvDefinitions & string>(key: K): void;
};

/** KV helper with dictionary-style access */
export type KvHelper<TKvDefinitions extends KvDefinitions> = {
	/** Get a value by key (validates + migrates). */
	get<K extends keyof TKvDefinitions & string>(
		key: K,
	): KvGetResult<InferKvValue<TKvDefinitions[K]>>;

	/** Set a value by key (always latest schema). */
	set<K extends keyof TKvDefinitions & string>(
		key: K,
		value: InferKvValue<TKvDefinitions[K]>,
	): void;

	/** Delete a value by key. */
	delete<K extends keyof TKvDefinitions & string>(key: K): void;

	/**
	 * Execute multiple operations atomically in a Y.js transaction.
	 */
	batch(fn: (tx: KvBatchTransaction<TKvDefinitions>) => void): void;

	/** Watch for changes to a key. Returns unsubscribe function. */
	observe<K extends keyof TKvDefinitions & string>(
		key: K,
		callback: (
			change: KvChange<InferKvValue<TKvDefinitions[K]>>,
			transaction: unknown,
		) => void,
	): () => void;
};

/** Workspace definition created by defineWorkspace() */
export type WorkspaceDefinition<
	TId extends string,
	TTableDefinitions extends TableDefinitions,
	TKvDefinitions extends KvDefinitions,
> = {
	id: TId;
	tableDefinitions: TTableDefinitions;
	kvDefinitions: TKvDefinitions;

	/**
	 * Create a workspace client. Synchronous - returns immediately.
	 *
	 * Capabilities receive typed context with access to the workspace's tables and KV.
	 */
	create<
		TCapabilities extends CapabilityMap<TTableDefinitions, TKvDefinitions> = {},
	>(
		capabilities?: TCapabilities,
	): WorkspaceClient<TId, TTableDefinitions, TKvDefinitions, TCapabilities>;
};

// ════════════════════════════════════════════════════════════════════════════
// CAPABILITY TYPES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Context passed to capability factory functions.
 *
 * Capabilities receive typed access to the workspace's Y.Doc and helpers,
 * allowing them to attach persistence, sync, or other functionality with
 * full type safety.
 *
 * @typeParam TTableDefinitions - Map of table definitions for this workspace
 * @typeParam TKvDefinitions - Map of KV definitions for this workspace
 */
export type CapabilityContext<
	TTableDefinitions extends TableDefinitions = TableDefinitions,
	TKvDefinitions extends KvDefinitions = KvDefinitions,
> = {
	/** The underlying Y.Doc instance */
	ydoc: unknown;
	/** Typed table helpers for the workspace */
	tables: TablesHelper<TTableDefinitions>;
	/** Typed KV helper for the workspace */
	kv: KvHelper<TKvDefinitions>;
};

/**
 * Factory function that creates a capability with lifecycle hooks.
 *
 * All capabilities MUST return an object that satisfies the {@link Lifecycle} protocol:
 * - `whenSynced`: Promise that resolves when the capability is ready
 * - `destroy`: Cleanup function called when the workspace is destroyed
 *
 * Use {@link defineExports} from `core/lifecycle.ts` to easily create compliant exports.
 *
 * @example Simple capability with no async initialization
 * ```typescript
 * const myCapability: CapabilityFactory = ({ ydoc }) => {
 *   return defineExports(); // Provides default whenSynced and destroy
 * };
 * ```
 *
 * @example Capability with typed table access
 * ```typescript
 * // When passed to workspace.create(), tables and kv are fully typed
 * const loggerCapability: CapabilityFactory = ({ tables }) => {
 *   // tables.posts, tables.users, etc. are all typed based on workspace definition
 *   return defineExports();
 * };
 * ```
 *
 * @example Capability with async initialization and cleanup
 * ```typescript
 * const sqliteCapability: CapabilityFactory<
 *   TableDefinitions,
 *   KvDefinitions,
 *   { db: Database } & Lifecycle
 * > = ({ ydoc }) => {
 *   const db = new Database(':memory:');
 *   return defineExports({
 *     db,
 *     whenSynced: db.initialize(),
 *     destroy: () => db.close(),
 *   });
 * };
 * ```
 *
 * @typeParam TTableDefinitions - Map of table definitions (inferred from workspace)
 * @typeParam TKvDefinitions - Map of KV definitions (inferred from workspace)
 * @typeParam TExports - Additional exports beyond the required Lifecycle fields
 */
export type CapabilityFactory<
	TTableDefinitions extends TableDefinitions = TableDefinitions,
	TKvDefinitions extends KvDefinitions = KvDefinitions,
	TExports extends Lifecycle = Lifecycle,
> = (context: CapabilityContext<TTableDefinitions, TKvDefinitions>) => TExports;

/**
 * Map of capability factories for a specific workspace.
 *
 * @typeParam TTableDefinitions - Map of table definitions for this workspace
 * @typeParam TKvDefinitions - Map of KV definitions for this workspace
 */
export type CapabilityMap<
	TTableDefinitions extends TableDefinitions = TableDefinitions,
	TKvDefinitions extends KvDefinitions = KvDefinitions,
> = Record<
	string,
	CapabilityFactory<TTableDefinitions, TKvDefinitions, Lifecycle>
>;

/**
 * Infer exports from a capability map, ensuring Lifecycle is always included.
 *
 * @typeParam TTableDefinitions - Map of table definitions for this workspace
 * @typeParam TKvDefinitions - Map of KV definitions for this workspace
 * @typeParam TCapabilities - The capability map to infer exports from
 */
export type InferCapabilityExports<
	TTableDefinitions extends TableDefinitions,
	TKvDefinitions extends KvDefinitions,
	TCapabilities extends CapabilityMap<TTableDefinitions, TKvDefinitions>,
> = {
	[K in keyof TCapabilities]: ReturnType<TCapabilities[K]>;
};

/** The workspace client returned by workspace.create() */
export type WorkspaceClient<
	TId extends string,
	TTableDefinitions extends TableDefinitions,
	TKvDefinitions extends KvDefinitions,
	TCapabilities extends CapabilityMap<TTableDefinitions, TKvDefinitions>,
> = {
	id: TId;
	ydoc: unknown;
	tables: TablesHelper<TTableDefinitions>;
	kv: KvHelper<TKvDefinitions>;
	capabilities: InferCapabilityExports<
		TTableDefinitions,
		TKvDefinitions,
		TCapabilities
	>;

	/** Cleanup all resources */
	destroy(): Promise<void>;

	/** Async dispose support */
	[Symbol.asyncDispose](): Promise<void>;
};
