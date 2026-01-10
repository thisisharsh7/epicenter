import {
	createRegistryDoc,
	createHeadDoc,
	type RegistryDoc,
	type HeadDoc,
	type WorkspaceSchema,
} from '@epicenter/hq';
import {
	registryPersistence,
	headPersistence,
} from '$lib/capabilities/tauri-persistence';
import type * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────────────────────
// Module State
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY_ID = 'local';

let registryPromise: Promise<RegistryDoc> | null = null;
const headPromises = new Map<string, Promise<HeadDoc>>();

// ─────────────────────────────────────────────────────────────────────────────
// Registry Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the registry doc (singleton, lazy-initialized with persistence).
 *
 * The registry stores which workspace GUIDs exist for this user.
 * It's persisted to `{appLocalDataDir}/registry.yjs`.
 *
 * @example
 * ```typescript
 * const registry = await getRegistry();
 * const workspaceIds = registry.getWorkspaceIds();
 * ```
 */
export async function getRegistry(): Promise<RegistryDoc> {
	if (!registryPromise) {
		registryPromise = (async () => {
			const doc = createRegistryDoc({ registryId: REGISTRY_ID });
			await registryPersistence(doc.ydoc);
			return doc;
		})();
	}
	return registryPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Head Doc Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a head doc for a workspace (cached, lazy-initialized with persistence).
 *
 * The head doc stores the current epoch for a workspace using a CRDT-safe
 * per-client MAX pattern. It's persisted to `{appLocalDataDir}/workspaces/{id}/head.yjs`.
 *
 * @example
 * ```typescript
 * const head = await getHeadDoc('abc123xyz789012');
 * const epoch = head.getEpoch(); // 0, 1, 2, etc.
 * ```
 */
export async function getHeadDoc(workspaceId: string): Promise<HeadDoc> {
	let promise = headPromises.get(workspaceId);
	if (!promise) {
		promise = (async () => {
			const doc = createHeadDoc({ workspaceId });
			await headPersistence(doc.ydoc, workspaceId);
			return doc;
		})();
		headPromises.set(workspaceId, promise);
	}
	return promise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean up a head doc from the cache.
 *
 * Called when deleting a workspace.
 */
export async function removeHeadDoc(workspaceId: string): Promise<void> {
	const promise = headPromises.get(workspaceId);
	if (promise) {
		const head = await promise;
		head.destroy();
		headPromises.delete(workspaceId);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract workspace schema from an already-loaded Y.Doc.
 *
 * This is a pure function with no I/O - it reads directly from the Y.Doc's
 * in-memory state. Use this after persistence has synced.
 *
 * @example
 * ```typescript
 * const client = await workspace.create({ epoch, capabilities: { persistence } });
 * await client.capabilities.persistence.whenSynced;
 * const schema = extractSchemaFromYDoc(client.ydoc, workspaceId);
 * ```
 */
export function extractSchemaFromYDoc(
	ydoc: Y.Doc,
	workspaceId: string,
): WorkspaceSchema {
	const metaMap = ydoc.getMap<string>('meta');
	const schemaMap = ydoc.getMap('schema');

	const tablesYMap = schemaMap.get('tables') as
		| Y.Map<Y.Map<unknown>>
		| undefined;
	const tables: WorkspaceSchema['tables'] = {};

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
					(tableMap.get('icon') as WorkspaceSchema['tables'][string]['icon']) ??
					null,
				cover:
					(tableMap.get(
						'cover',
					) as WorkspaceSchema['tables'][string]['cover']) ?? null,
				description: (tableMap.get('description') as string) ?? '',
				fields: fields as WorkspaceSchema['tables'][string]['fields'],
			};
		}
	}

	const kvYMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: WorkspaceSchema['kv'] = {};
	if (kvYMap) {
		for (const [key, value] of kvYMap.entries()) {
			kv[key] = value as WorkspaceSchema['kv'][string];
		}
	}

	return {
		id: workspaceId,
		slug: metaMap.get('slug') ?? workspaceId,
		name: metaMap.get('name') ?? 'Untitled',
		tables,
		kv,
	};
}
