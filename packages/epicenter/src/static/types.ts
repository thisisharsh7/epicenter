/**
 * Shared types for the Static Workspace API.
 *
 * This module contains all type definitions for versioned tables and KV stores.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

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

/** Result of deleting multiple rows */
export type DeleteManyResult =
	| { status: 'all_deleted'; deleted: string[] }
	| {
			status: 'partially_deleted';
			deleted: string[];
			notFoundLocally: string[];
	  }
	| { status: 'none_deleted'; notFoundLocally: string[] };

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
	readonly schema: StandardSchemaV1<
		unknown,
		StandardSchemaV1.InferOutput<TVersions[number]>
	>;
	readonly migrate: (
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
	readonly schema: StandardSchemaV1<
		unknown,
		StandardSchemaV1.InferOutput<TVersions[number]>
	>;
	readonly migrate: (
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

/** Helper for a single table */
export type TableHelper<TRow extends { id: string }> = {
	// ═══════════════════════════════════════════════════════════════════════
	// WRITE (always writes latest schema shape)
	// ═══════════════════════════════════════════════════════════════════════

	/** Set a row (insert or replace). Always writes full row. */
	set(row: TRow): void;

	/** Set multiple rows. */
	setMany(rows: readonly TRow[]): void;

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

	/** Delete multiple rows. */
	deleteMany(ids: readonly string[]): DeleteManyResult;

	/** Delete all rows (table structure preserved). */
	clear(): void;

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
export type TableDefinitionMap = Record<string, TableDefinition<any>>;

/** Map of KV definitions (uses `any` to allow variance in generic parameters) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KvDefinitionMap = Record<string, KvDefinition<any>>;

/** Tables helper object with all table helpers */
export type TablesHelper<TTables extends TableDefinitionMap> = {
	readonly [K in keyof TTables]: TableHelper<InferTableRow<TTables[K]>>;
};

/** KV helper with dictionary-style access */
export type KvHelper<TKV extends KvDefinitionMap> = {
	/** Get a value by key (validates + migrates). */
	get<K extends keyof TKV & string>(key: K): KvGetResult<InferKvValue<TKV[K]>>;

	/** Set a value by key (always latest schema). */
	set<K extends keyof TKV & string>(key: K, value: InferKvValue<TKV[K]>): void;

	/** Delete a value by key. */
	delete<K extends keyof TKV & string>(key: K): void;

	/** Watch for changes to a key. Returns unsubscribe function. */
	observe<K extends keyof TKV & string>(
		key: K,
		callback: (
			change: KvChange<InferKvValue<TKV[K]>>,
			transaction: unknown,
		) => void,
	): () => void;
};

/** Workspace definition created by defineWorkspace() */
export type WorkspaceDefinition<
	TId extends string,
	TTables extends TableDefinitionMap,
	TKV extends KvDefinitionMap,
> = {
	readonly id: TId;
	readonly tableDefinitions: TTables;
	readonly kvDefinitions: TKV;

	/** Create a workspace client. Synchronous - returns immediately. */
	create<TCapabilities extends CapabilityMap = {}>(
		capabilities?: TCapabilities,
	): WorkspaceClient<TId, TTables, TKV, TCapabilities>;
};

/** Capability factory function */
export type CapabilityFactory<TExports = unknown> = (context: {
	ydoc: unknown;
	tables: unknown;
	kv: unknown;
}) => TExports;

/** Map of capability factories */
export type CapabilityMap = Record<string, CapabilityFactory>;

/** Infer exports from a capability map */
export type InferCapabilityExports<TCapabilities extends CapabilityMap> = {
	readonly [K in keyof TCapabilities]: ReturnType<TCapabilities[K]>;
};

/** The workspace client returned by workspace.create() */
export type WorkspaceClient<
	TId extends string,
	TTables extends TableDefinitionMap,
	TKV extends KvDefinitionMap,
	TCapabilities extends CapabilityMap,
> = {
	readonly id: TId;
	readonly ydoc: unknown;
	readonly tables: TablesHelper<TTables>;
	readonly kv: KvHelper<TKV>;
	readonly capabilities: InferCapabilityExports<TCapabilities>;

	/** Cleanup all resources */
	destroy(): Promise<void>;

	/** Async dispose support */
	[Symbol.asyncDispose](): Promise<void>;
};
