/**
 * Browser-specific epicenter configuration.
 *
 * In browser environments, storageDir is not available since there's no
 * filesystem access. This config type omits storageDir entirely.
 */

import type { AnyWorkspaceConfig } from '../workspace';
import {
	type EpicenterConfigBase,
	validateEpicenterConfig,
} from './config.shared';

/**
 * Browser epicenter configuration
 *
 * This type is identical to EpicenterConfigBase; storageDir is not available
 * in browser environments.
 */
export type EpicenterConfig<
	TWorkspaces extends
		readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
> = EpicenterConfigBase<TWorkspaces>;

/**
 * Define an epicenter configuration (browser version)
 * Validates and returns the epicenter config
 *
 * @param config - Epicenter configuration
 * @returns Validated epicenter configuration
 *
 * @example
 * ```typescript
 * export const epicenter = defineEpicenter({
 *   workspaces: [pages, contentHub],
 * });
 * ```
 */
export function defineEpicenter<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TWorkspaces>): EpicenterConfig<TWorkspaces> {
	validateEpicenterConfig(config);
	return config;
}
