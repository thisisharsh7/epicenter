import { defineWorkspace } from '@epicenter/hq';
import * as Y from 'yjs';
import { workspacePersistence } from '$lib/capabilities/tauri-persistence';
import {
	getRegistry,
	getHeadDoc,
	setWorkspaceSchema,
	type AppWorkspaceSchema,
} from './workspace-registry';

/**
 * Whether the app has been bootstrapped.
 */
let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

/**
 * Bootstrap the app by loading the registry and all workspace schemas.
 *
 * This should be called once on app initialization (e.g., in root +layout.ts).
 * Subsequent calls are no-ops.
 *
 * The bootstrap process:
 * 1. Load the registry doc (list of workspace GUIDs)
 * 2. For each workspace GUID, load its schema from the workspace doc
 * 3. Cache all schemas in memory for quick access
 *
 * @example
 * ```typescript
 * // In root +layout.ts
 * export const load: LayoutLoad = async () => {
 *   await bootstrap();
 *   return {};
 * };
 * ```
 */
export async function bootstrap(): Promise<void> {
	if (bootstrapped) return;

	// Avoid race conditions on concurrent calls
	if (!bootstrapPromise) {
		bootstrapPromise = performBootstrap();
	}

	return bootstrapPromise;
}

/**
 * Check if the app has been bootstrapped.
 */
export function isBootstrapped(): boolean {
	return bootstrapped;
}

async function performBootstrap(): Promise<void> {
	console.log('[Bootstrap] Starting...');

	// Step 1: Load the registry
	const registry = await getRegistry();
	const guids = registry.getWorkspaceIds();
	console.log(`[Bootstrap] Found ${guids.length} workspace(s) in registry`);

	// Step 2: Load each workspace's schema
	for (const guid of guids) {
		try {
			await loadWorkspaceSchema(guid);
		} catch (error) {
			console.error(`[Bootstrap] Failed to load workspace ${guid}:`, error);
			// Continue loading other workspaces
		}
	}

	bootstrapped = true;
	console.log('[Bootstrap] Complete');
}

/**
 * Load a workspace's schema from its workspace doc into the cache.
 *
 * This creates a temporary workspace client just to read the schema,
 * then destroys it. The actual client will be created when navigating
 * to the workspace.
 */
async function loadWorkspaceSchema(guid: string): Promise<void> {
	// Get the epoch from head doc
	const head = await getHeadDoc(guid);
	const epoch = head.getEpoch();

	// Create a temporary Y.Doc to load the workspace data
	const docId = `${guid}-${epoch}`;
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Load from persistence
	const persistence = await workspacePersistence(ydoc, guid, epoch);
	await persistence.whenSynced;

	// Read schema from the Y.Doc
	const schema = extractSchemaFromYDoc(ydoc, guid);

	// Cache the schema
	setWorkspaceSchema(guid, schema);
	console.log(`[Bootstrap] Loaded workspace: ${schema.name} (${schema.slug})`);

	// Clean up - we don't need this doc anymore
	persistence.destroy();
	ydoc.destroy();
}

/**
 * Extract a WorkspaceSchema from a Y.Doc.
 *
 * The workspace doc stores metadata and schema in Y.Maps:
 * - `meta`: { name: string, slug: string }
 * - `schema`: { tables: Y.Map, kv: Y.Map }
 */
function extractSchemaFromYDoc(ydoc: Y.Doc, guid: string): AppWorkspaceSchema {
	const metaMap = ydoc.getMap<string>('meta');
	const schemaMap = ydoc.getMap('schema');

	const name = metaMap.get('name') ?? 'Untitled';
	const slug = metaMap.get('slug') ?? guid;

	// Extract tables from schema map
	const tablesYMap = schemaMap.get('tables') as
		| Y.Map<Y.Map<unknown>>
		| undefined;
	const tables: AppWorkspaceSchema['tables'] = {};

	if (tablesYMap) {
		for (const [tableName, tableMap] of tablesYMap.entries()) {
			const fieldsMap = tableMap.get('fields') as Y.Map<unknown> | undefined;
			const fields: Record<string, unknown> = {};

			if (fieldsMap) {
				for (const [fieldName, fieldDef] of fieldsMap.entries()) {
					fields[fieldName] = fieldDef;
				}
			}

			tables[tableName] = {
				name: (tableMap.get('name') as string) ?? tableName,
				icon:
					(tableMap.get(
						'icon',
					) as AppWorkspaceSchema['tables'][string]['icon']) ?? null,
				cover:
					(tableMap.get(
						'cover',
					) as AppWorkspaceSchema['tables'][string]['cover']) ?? null,
				description: (tableMap.get('description') as string) ?? '',
				fields: fields as AppWorkspaceSchema['tables'][string]['fields'],
			};
		}
	}

	// Extract KV from schema map
	const kvYMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: AppWorkspaceSchema['kv'] = {};

	if (kvYMap) {
		for (const [key, value] of kvYMap.entries()) {
			kv[key] = value as AppWorkspaceSchema['kv'][string];
		}
	}

	return {
		id: guid,
		slug,
		name,
		tables,
		kv,
	};
}

/**
 * Add a newly created workspace to the cache.
 *
 * Called after creating a workspace via the query layer. This avoids
 * having to reload from disk.
 */
export function addWorkspaceToCache(schema: AppWorkspaceSchema): void {
	setWorkspaceSchema(schema.id, schema);
}
