export type {
	ExtensionContext,
	ExtensionExports,
	ExtensionFactory,
	ExtensionFactoryMap,
	InferExtensionExports,
} from '../extension';
export { defineExports } from '../extension';

// Normalization helpers (for external use if needed)
export {
	DEFAULT_KV_ICON,
	isKvDefinition,
	isTableDefinition,
	normalizeIcon,
	normalizeKv,
} from './normalize';

export type {
	ClientBuilder,
	NormalizedKv,
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
	WorkspaceInput,
	WorkspaceSchema,
} from './workspace';
export { createClient, defineWorkspace } from './workspace';
