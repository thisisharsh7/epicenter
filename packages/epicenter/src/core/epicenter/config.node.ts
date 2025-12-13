/**
 * Node.js-specific epicenter configuration.
 *
 * In Node.js environments, storageDir is available for filesystem-based
 * persistence.
 */

import type { AnyWorkspaceConfig } from '../workspace';
import {
	type EpicenterConfigBase,
	validateEpicenterConfig,
} from './config.shared';

/**
 * Node.js epicenter configuration
 *
 * Extends base config with storageDir for filesystem-based storage.
 */
export type EpicenterConfig<
	TId extends string = string,
	TWorkspaces extends
		readonly AnyWorkspaceConfig[] = readonly AnyWorkspaceConfig[],
> = EpicenterConfigBase<TId, TWorkspaces> & {
	/**
	 * Base directory for all Epicenter storage (databases, markdown files, persistence)
	 *
	 * - Defaults to process.cwd() in Node.js (where epicenter commands are run)
	 * - Can be overridden per-index/provider if needed
	 *
	 * @example
	 * ```typescript
	 * // Store everything in /data/epicenter
	 * export default defineEpicenter({
	 *   storageDir: '/data/epicenter',
	 *   workspaces: [...]
	 * });
	 *
	 * // Use environment variable
	 * export default defineEpicenter({
	 *   storageDir: process.env.EPICENTER_STORAGE_DIR,
	 *   workspaces: [...]
	 * });
	 * ```
	 */
	storageDir?: string;
};

/**
 * Define an epicenter configuration (Node.js version)
 * Validates and returns the epicenter config
 *
 * @param config - Epicenter configuration
 * @returns Validated epicenter configuration
 *
 * @example
 * ```typescript
 * export const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   storageDir: './data',
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
