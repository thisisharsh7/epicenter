import type { StandardSchemaV1, StandardSchemaWithJSONSchema } from './schema';

/**
 * The structure of workspace actions.
 *
 * Contains only action contracts (queries/mutations) or nested namespaces of contracts.
 * Everything defined here is auto-mapped to API endpoints and MCP tools.
 *
 * @example Flat structure
 * ```typescript
 * actions: {
 *   getUser: defineQuery({ input: ..., output: ... }),
 *   createUser: defineMutation({ input: ..., output: ... }),
 * }
 * ```
 *
 * @example Namespaced structure
 * ```typescript
 * actions: {
 *   users: {
 *     getAll: defineQuery({ output: ... }),
 *     create: defineMutation({ input: ..., output: ... }),
 *   },
 * }
 * ```
 */
export type ActionContracts = {
	[key: string]: ActionContract | ActionContracts;
};

/**
 * @deprecated Use `ActionContracts` instead. This alias exists for backwards compatibility.
 */
export type Actions = ActionContracts;

/**
 * Action contract - metadata for cross-boundary invocation.
 *
 * Action contracts define the shape of inputs and outputs without implementations.
 * They are JSON-serializable, enabling:
 * - Browser introspection without executing code
 * - REST API endpoint generation
 * - MCP tool definitions
 * - CLI command generation
 * - OpenAPI documentation
 *
 * Handlers are bound separately via `.withHandlers()` at runtime.
 *
 * Input and output schemas must implement StandardSchemaV1 (validation) and
 * StandardJSONSchemaV1 (JSON Schema) for runtime validation and documentation.
 */
export type ActionContract<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = QueryContract<TInput, TOutput> | MutationContract<TInput, TOutput>;

/**
 * Query contract: read operation with no side effects.
 *
 * Defines the input/output schema for a query without the handler implementation.
 * The handler is bound separately via `.withHandlers()`.
 *
 * When TInput is undefined, the `input` key is omitted entirely from the contract.
 * This allows introspection via `'input' in contract` to determine if input is required.
 */
export type QueryContract<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = {
	type: 'query';
	output: TOutput;
	description?: string;
} & (TInput extends undefined ? Record<string, never> : { input: TInput });

/**
 * Mutation contract: write operation that modifies state.
 *
 * Defines the input/output schema for a mutation without the handler implementation.
 * The handler is bound separately via `.withHandlers()`.
 *
 * When TInput is undefined, the `input` key is omitted entirely from the contract.
 * This allows introspection via `'input' in contract` to determine if input is required.
 */
export type MutationContract<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = {
	type: 'mutation';
	output: TOutput;
	description?: string;
} & (TInput extends undefined ? Record<string, never> : { input: TInput });

/**
 * Define a query contract (read operation with no side effects).
 *
 * Creates a JSON-serializable contract that describes the query's input/output schemas.
 * The actual handler implementation is bound separately via `.withHandlers()`.
 *
 * **With input schema:**
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({
 *   input: type({ id: 'string' }),
 *   output: type({ id: 'string', name: 'string', email: 'string' }),
 *   description: 'Get a user by ID',
 * });
 * ```
 *
 * **Without input schema:**
 *
 * @example
 * ```typescript
 * const getAllUsers = defineQuery({
 *   output: type({ id: 'string', name: 'string' }).array(),
 *   description: 'Get all users',
 * });
 * ```
 *
 * **Input Schema Constraints**
 *
 * Input schemas are converted to JSON Schema for MCP/CLI/OpenAPI. Avoid:
 *
 * - **Transforms**: `.pipe()` (ArkType), `.transform()` (Zod), `transform()` action (Valibot)
 * - **Custom validation**: `.filter()` (ArkType), `.refine()` (Zod), `check()`/`custom()` (Valibot)
 * - **Non-JSON types**: `bigint`, `symbol`, `undefined`, `Date`, `Map`, `Set`
 *
 * Use basic types (`string`, `number`, `boolean`, objects, arrays) and `.matching(regex)` for patterns.
 * For complex validation, validate in the handler instead.
 *
 * Learn more:
 * - Zod: https://zod.dev/json-schema?id=unrepresentable
 * - Valibot: https://www.npmjs.com/package/@valibot/to-json-schema
 * - ArkType: https://arktype.io/docs/configuration#fallback-codes
 */
export function defineQuery<
	TInput extends StandardSchemaWithJSONSchema,
	TOutput extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutput;
	description?: string;
}): QueryContract<TInput, TOutput>;

/**
 * Define a query contract without input (read operation with no side effects).
 *
 * Creates a JSON-serializable contract for queries that take no input.
 * The actual handler implementation is bound separately via `.withHandlers()`.
 */
export function defineQuery<
	TOutput extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutput;
	description?: string;
}): QueryContract<undefined, TOutput>;

export function defineQuery(config: {
	input?: StandardSchemaWithJSONSchema;
	output: StandardSchemaWithJSONSchema;
	description?: string;
}): QueryContract {
	return {
		type: 'query',
		...(config.input && { input: config.input }),
		output: config.output,
		description: config.description,
	};
}

/**
 * Define a mutation contract (write operation that modifies state).
 *
 * Creates a JSON-serializable contract that describes the mutation's input/output schemas.
 * The actual handler implementation is bound separately via `.withHandlers()`.
 *
 * **With input schema:**
 *
 * @example
 * ```typescript
 * const createUser = defineMutation({
 *   input: type({ name: 'string', email: 'string' }),
 *   output: type({ id: 'string', name: 'string', email: 'string' }),
 *   description: 'Create a new user',
 * });
 * ```
 *
 * **Without input schema:**
 *
 * @example
 * ```typescript
 * const resetDatabase = defineMutation({
 *   output: type({ success: 'boolean' }),
 *   description: 'Reset the database to initial state',
 * });
 * ```
 *
 * **Input Schema Constraints**
 *
 * Input schemas are converted to JSON Schema for MCP/CLI/OpenAPI. Avoid:
 *
 * - **Transforms**: `.pipe()` (ArkType), `.transform()` (Zod), `transform()` action (Valibot)
 * - **Custom validation**: `.filter()` (ArkType), `.refine()` (Zod), `check()`/`custom()` (Valibot)
 * - **Non-JSON types**: `bigint`, `symbol`, `undefined`, `Date`, `Map`, `Set`
 *
 * Use basic types (`string`, `number`, `boolean`, objects, arrays) and `.matching(regex)` for patterns.
 * For complex validation, validate in the handler instead.
 *
 * Learn more:
 * - Zod: https://zod.dev/json-schema?id=unrepresentable
 * - Valibot: https://www.npmjs.com/package/@valibot/to-json-schema
 * - ArkType: https://arktype.io/docs/configuration#fallback-codes
 */
export function defineMutation<
	TInput extends StandardSchemaWithJSONSchema,
	TOutput extends StandardSchemaWithJSONSchema,
>(config: {
	input: TInput;
	output: TOutput;
	description?: string;
}): MutationContract<TInput, TOutput>;

/**
 * Define a mutation contract without input (write operation that modifies state).
 *
 * Creates a JSON-serializable contract for mutations that take no input.
 * The actual handler implementation is bound separately via `.withHandlers()`.
 */
export function defineMutation<
	TOutput extends StandardSchemaWithJSONSchema,
>(config: {
	output: TOutput;
	description?: string;
}): MutationContract<undefined, TOutput>;

export function defineMutation(config: {
	input?: StandardSchemaWithJSONSchema;
	output: StandardSchemaWithJSONSchema;
	description?: string;
}): MutationContract {
	return {
		type: 'mutation',
		...(config.input && { input: config.input }),
		output: config.output,
		description: config.description,
	};
}

/**
 * Type guard: Check if a value is an ActionContract (QueryContract or MutationContract).
 *
 * Action contracts are plain objects with a `type` property of 'query' or 'mutation'.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ... });
 * const createUser = defineMutation({ input: ..., output: ... });
 *
 * isActionContract(getUser) // true
 * isActionContract(createUser) // true
 * isActionContract({ foo: 'bar' }) // false
 * ```
 */
export function isActionContract(value: unknown): value is ActionContract {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		(value.type === 'query' || value.type === 'mutation') &&
		'output' in value
	);
}

/**
 * Type guard: Check if a value is a QueryContract.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ... });
 * const createUser = defineMutation({ input: ..., output: ... });
 *
 * isQueryContract(getUser) // true
 * isQueryContract(createUser) // false
 * ```
 */
export function isQueryContract(value: unknown): value is QueryContract {
	return isActionContract(value) && value.type === 'query';
}

/**
 * Type guard: Check if a value is a MutationContract.
 *
 * @example
 * ```typescript
 * const getUser = defineQuery({ output: ... });
 * const createUser = defineMutation({ input: ..., output: ... });
 *
 * isMutationContract(getUser) // false
 * isMutationContract(createUser) // true
 * ```
 */
export function isMutationContract(value: unknown): value is MutationContract {
	return isActionContract(value) && value.type === 'mutation';
}

/**
 * Type guard: Check if a value is a namespace (plain object that might contain action contracts).
 *
 * A namespace is any plain object that is not an action contract itself.
 * This allows us to recursively walk through nested contract structures.
 *
 * @example
 * ```typescript
 * const contracts = {
 *   getUser: defineQuery({ output: ... }),
 *   users: { getAll: defineQuery({ output: ... }) }
 * };
 *
 * isNamespace(contracts.getUser) // false (it's an action contract)
 * isNamespace(contracts.users) // true (it's a namespace containing contracts)
 * isNamespace([1, 2, 3]) // false (arrays are not namespaces)
 * isNamespace("hello") // false (primitives are not namespaces)
 * ```
 */
export function isNamespace(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		!isActionContract(value)
	);
}

/**
 * Recursively walk through action contracts and yield each contract with its path.
 *
 * This generator function traverses a nested action contract structure and yields
 * each contract along with its path from the root. The path is an array of
 * keys that identifies the contract's location in the hierarchy.
 *
 * @param contracts - The workspace action contracts object to walk through
 * @param path - Current path array (used internally for recursion)
 * @yields Objects containing the contract path and the contract itself
 *
 * @example
 * ```typescript
 * const contracts = {
 *   users: {
 *     getAll: defineQuery({ output: ... }),
 *     crud: {
 *       create: defineMutation({ input: ..., output: ... })
 *     }
 *   },
 *   health: defineQuery({ output: ... })
 * };
 *
 * for (const { path, contract } of walkActionContracts(contracts)) {
 *   // First: path = ['users', 'getAll'], contract = QueryContract
 *   // Second: path = ['users', 'crud', 'create'], contract = MutationContract
 *   // Third: path = ['health'], contract = QueryContract
 * }
 * ```
 */
export function* walkActionContracts(
	contracts: unknown,
	path: string[] = [],
): Generator<{ path: string[]; contract: ActionContract }> {
	if (!contracts || typeof contracts !== 'object') return;

	for (const [key, value] of Object.entries(contracts)) {
		if (isActionContract(value)) {
			yield { path: [...path, key], contract: value };
		} else if (isNamespace(value)) {
			yield* walkActionContracts(value, [...path, key]);
		}
	}
}

/**
 * Helper to define workspace action contracts with full type inference.
 *
 * Identity function that provides type safety and better IDE support
 * when defining workspace action contracts.
 *
 * @example
 * ```typescript
 * const contracts = defineActionContracts({
 *   getUser: defineQuery({ input: ..., output: ... }),
 *   createUser: defineMutation({ input: ..., output: ... }),
 * });
 * // Type is fully inferred: {
 * //   getUser: QueryContract<...>,
 * //   createUser: MutationContract<...>,
 * // }
 * ```
 */
export function defineActionContracts<T extends ActionContracts>(
	contracts: T,
): T {
	return contracts;
}

// =============================================================================
// Deprecated exports for backwards compatibility
// =============================================================================

/** @deprecated Use `ActionContract` instead. */
export type Action<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = ActionContract<TInput, TOutput>;

/** @deprecated Use `QueryContract` instead. */
export type Query<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = QueryContract<TInput, TOutput>;

/** @deprecated Use `MutationContract` instead. */
export type Mutation<
	TInput extends StandardSchemaWithJSONSchema | undefined =
		| StandardSchemaWithJSONSchema
		| undefined,
	TOutput extends StandardSchemaWithJSONSchema = StandardSchemaWithJSONSchema,
> = MutationContract<TInput, TOutput>;

/** @deprecated Use `isActionContract` instead. */
export const isAction = isActionContract;

/** @deprecated Use `isQueryContract` instead. */
export const isQuery = isQueryContract;

/** @deprecated Use `isMutationContract` instead. */
export const isMutation = isMutationContract;

/** @deprecated Use `walkActionContracts` instead. */
export const walkActions = walkActionContracts;

/** @deprecated Use `defineActionContracts` instead. */
export const defineActions = defineActionContracts;

// =============================================================================
// Type utilities for handler binding (used by .withHandlers())
// =============================================================================

/**
 * Infer the input type from an action contract.
 *
 * Returns `undefined` if the contract has no input schema.
 */
export type InferContractInput<T extends ActionContract> =
	T extends ActionContract<infer TInput, infer _TOutput>
		? TInput extends StandardSchemaWithJSONSchema
			? StandardSchemaV1.InferOutput<TInput>
			: undefined
		: never;

/**
 * Infer the output type from an action contract.
 */
export type InferContractOutput<T extends ActionContract> =
	T extends ActionContract<infer _TInput, infer TOutput>
		? StandardSchemaV1.InferOutput<TOutput>
		: never;
