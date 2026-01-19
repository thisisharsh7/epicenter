/**
 * Revision History Capability
 *
 * Stores Y.Snapshots for time-travel and revision history.
 * Currently only supports local filesystem storage.
 *
 * @example
 * ```typescript
 * import { localRevisionHistory } from '@epicenter/hq/capabilities/revision-history';
 *
 * const client = await workspace.create({
 *   capabilities: {
 *     revisions: (ctx) => localRevisionHistory(ctx, {
 *       directory: './workspaces',
 *       epoch: 0,
 *       maxVersions: 50,
 *     }),
 *   },
 * });
 *
 * // Save manually (bypasses debounce)
 * client.capabilities.revisions.save('Before refactor');
 *
 * // List versions
 * const versions = await client.capabilities.revisions.list();
 *
 * // View historical state (read-only)
 * const oldDoc = await client.capabilities.revisions.view(5);
 *
 * // Restore to a version
 * await client.capabilities.revisions.restore(5);
 * ```
 */
export {
	type LocalRevisionHistoryConfig,
	localRevisionHistory,
	type VersionEntry,
} from './local.js';
