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
} from './normalize';

export type {
	ClientBuilder,
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
	WorkspaceSchema,
} from './workspace';
export { createClient, defineSchema } from './workspace';
