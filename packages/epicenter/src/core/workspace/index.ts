export type {
	CapabilityContext,
	CapabilityExports,
	CapabilityFactory,
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
export { defineCapabilities } from '../capability';

// Normalization helpers (for external use if needed)
export {
	DEFAULT_KV_ICON,
	DEFAULT_TABLE_ICON,
	isKvDefinition,
	isTableDefinition,
	normalizeKv,
	normalizeTable,
} from './normalize';

export type {
	NormalizedKv,
	NormalizedTables,
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
	WorkspaceInput,
} from './workspace';
export { defineWorkspace } from './workspace';
