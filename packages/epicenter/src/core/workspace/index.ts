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
	isKvDefinition,
	isTableDefinition,
	normalizeIcon,
	normalizeKv,
} from './normalize';

export type {
	NormalizedKv,
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
	WorkspaceInput,
} from './workspace';
export { createClient, defineWorkspace } from './workspace';
