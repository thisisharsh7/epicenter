// Definition (config side)
export { defineEpicenter } from './config';
export type {
	EpicenterConfig,
	EpicenterConfigInput,
	WorkspaceActionsMap,
	AnyEpicenterConfig,
} from './config';

// Runtime (client side)
export { createEpicenterClient } from './client';
export type { EpicenterClient, WorkspaceNamespace } from './client';
