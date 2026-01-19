/**
 * Workspace Persistence Capability
 *
 * Unified persistence for workspace Y.Docs that materializes:
 * - `workspace.yjs` - Full Y.Doc binary (sync source of truth)
 * - `definition.json` - Schema from Y.Map('definition')
 * - `kv.json` - Settings from Y.Map('kv')
 * - `tables.sqlite` - Table data from Y.Map('tables')
 *
 * All files are stored in epoch folders:
 * ```
 * {baseDir}/{workspaceId}/{epoch}/
 * ├── workspace.yjs
 * ├── definition.json
 * ├── kv.json
 * ├── tables.sqlite
 * └── snapshots/
 *     └── {unix-ms}.ysnap
 * ```
 *
 * @example
 * ```typescript
 * import { defineWorkspace, createClient } from '@epicenter/hq';
 *
 * const definition = defineWorkspace({
 *   id: 'blog',
 *   tables: { ... },
 *   kv: {},
 * });
 *
 * const client = createClient(definition, {
 *   epoch: 0,
 *   capabilities: {
 *     persistence: (ctx) => workspacePersistence(ctx, {
 *       baseDir: '/path/to/workspaces',
 *       epoch: 0,
 *     }),
 *   },
 * });
 * ```
 *
 * @module
 */

export {
	type WorkspacePersistenceConfig,
	workspacePersistence,
} from './persistence';
