// Core exports
export { definePlugin, definePluginFactory } from './core/plugin';
export { defineVault } from './core/define-vault';
export { createVault } from './core/vault';

// Column helpers
export {
	id,
	text,
	integer,
	real,
	boolean,
	date,
	date as timestamp, // timestamp is an alias for date
	json,
	blob,
} from './core/columns';

// Column types
export type { Id } from './core/columns';

// Dependency resolution
export {
	resolvePluginDependencies,
	CircularDependencyError,
	MissingDependencyError,
} from './core/dependency-resolver';

// Types
export type {
	Plugin,
	AnyPlugin,
	TableContext,
	VaultContext,
	WriteResult,
	ParseError,
	SyncResult,
} from './types/plugin';

export type { VaultConfig } from './core/vault';

export type {
	EnhancedTable,
	EnhancedTableMethods,
} from './types/enhanced-table';

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
