export type {
	CapabilityContext,
	CapabilityExports,
	CapabilityFactory,
	CapabilityFactoryMap,
	InferCapabilityExports,
} from '../capability';
export { defineCapabilities } from '../capability';
// Normalization types and functions for minimal input
export type {
	KvInput,
	KvInputMap,
	TableInput,
	WorkspaceInput,
} from './normalize';
export {
	DEFAULT_KV_ICON,
	DEFAULT_TABLE_ICON,
	isKvDefinition,
	isTableDefinition,
	isWorkspaceDefinition,
	normalizeKv,
	normalizeTable,
	normalizeWorkspace,
} from './normalize';
export type {
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
} from './workspace';
export { defineWorkspace } from './workspace';
