/**
 * Revision History Extension
 *
 * Stores Y.Snapshots for time-travel and revision history.
 * Currently only supports local filesystem storage.
 *
 * @example
 * ```typescript
 * import { defineWorkspace, createClient } from '@epicenter/hq';
 * import { localRevisionHistory } from '@epicenter/hq/extensions/revision-history';
 *
 * const definition = defineWorkspace({
 *   tables: { ... },
 *   kv: {},
 * });
 *
 * const client = createClient('blog', { epoch })
 *   .withDefinition(definition)
 *   .withExtensions({
 *     revisions: (ctx) => localRevisionHistory(ctx, {
 *       directory: './workspaces',
 *       epoch: 0,
 *       maxVersions: 50,
 *     }),
 *   });
 *
 * // Save manually (bypasses debounce)
 * client.extensions.revisions.save('Before refactor');
 *
 * // List versions
 * const versions = await client.extensions.revisions.list();
 *
 * // View historical state (read-only)
 * const oldDoc = await client.extensions.revisions.view(5);
 *
 * // Restore to a version
 * await client.extensions.revisions.restore(5);
 * ```
 */
export {
	type LocalRevisionHistoryConfig,
	localRevisionHistory,
	type VersionEntry,
} from './local.js';
