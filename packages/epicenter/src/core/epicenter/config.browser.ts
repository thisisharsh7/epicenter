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
	TId extends string = string,
	TWorkspaces extends
		readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
> = EpicenterConfigBase<TId, TWorkspaces>;

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
 *   id: 'my-app',
 *   workspaces: [pages, contentHub],
 * });
 * ```
 */
export function defineEpicenter<
	const TId extends string,
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): EpicenterConfig<TId, TWorkspaces> {
	validateEpicenterConfig(config);
	return config;
}
