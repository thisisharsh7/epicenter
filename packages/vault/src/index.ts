// Core exports
export { definePlugin } from './core/plugin';

// Method helpers
export {
	defineQuery,
	defineMutation,
	isQuery,
	isMutation,
} from './core/method-helpers';
export type {
	QueryMethod,
	MutationMethod,
	PluginMethod,
	InferMethodInput,
	InferMethodOutput,
} from './core/method-helpers';

// Runtime for plugin execution
export { runPlugin } from './core/runtime';
export type { RuntimeConfig, RuntimeContext } from './core/runtime';

// Column helpers
export {
	id,
	text,
	integer,
	real,
	boolean,
	date,
	json,
	blob,
} from './core/columns';

// Column types
export type { Id } from './core/columns';

// Plugin types
export type { Plugin } from './core/plugin';

// Error types
export type { VaultOperationError } from './core/errors';

// Re-export commonly used Drizzle utilities for convenience
export {
	eq,
	ne,
	gt,
	gte,
	lt,
	lte,
	and,
	or,
	not,
	like,
	inArray,
	sql,
	desc,
	asc,
} from 'drizzle-orm';
