import {
	createRegistryDoc,
	createHeadDoc,
	type RegistryDoc,
	type HeadDoc,
	type WorkspaceSchema,
	type TableDefinitionMap,
	type KvSchema,
} from '@epicenter/hq';
import {
	registryPersistence,
	headPersistence,
} from '$lib/capabilities/tauri-persistence';

/**
 * Workspace schema type used throughout the app.
 * Uses generic TableDefinitionMap and KvSchema for flexibility.
 */
export type AppWorkspaceSchema = WorkspaceSchema<TableDefinitionMap, KvSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Module State
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY_ID = 'local';

let registry: RegistryDoc | null = null;
let registryInitPromise: Promise<RegistryDoc> | null = null;

const headDocs = new Map<string, HeadDoc>();
const headInitPromises = new Map<string, Promise<HeadDoc>>();

/**
 * In-memory schema cache.
 *
 * Schemas are loaded from workspace docs on bootstrap and cached here.
 * When creating a new workspace, the schema is added to the cache before
 * the workspace doc is created.
 */
const schemaCache = new Map<string, AppWorkspaceSchema>();

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
	if (registry) return registry;

	// Avoid race conditions on concurrent calls
	if (!registryInitPromise) {
		registryInitPromise = (async () => {
			const doc = createRegistryDoc({ registryId: REGISTRY_ID });
			await registryPersistence(doc.ydoc);
			registry = doc;
			return doc;
		})();
	}

	return registryInitPromise;
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
	const existing = headDocs.get(workspaceId);
	if (existing) return existing;

	// Avoid race conditions on concurrent calls for same workspace
	let initPromise = headInitPromises.get(workspaceId);
	if (!initPromise) {
		initPromise = (async () => {
			const doc = createHeadDoc({ workspaceId });
			await headPersistence(doc.ydoc, workspaceId);
			headDocs.set(workspaceId, doc);
			return doc;
		})();
		headInitPromises.set(workspaceId, initPromise);
	}

	return initPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store a workspace schema in the cache.
 *
 * Called when creating a new workspace or loading existing schemas from
 * workspace docs during bootstrap.
 */
export function setWorkspaceSchema(
	workspaceId: string,
	schema: AppWorkspaceSchema,
): void {
	console.log(`[Registry] Caching schema:`, {
		workspaceId,
		slug: schema.slug,
		cacheSize: schemaCache.size + 1,
	});
	schemaCache.set(workspaceId, schema);
}

/**
 * Get a workspace schema from the cache by GUID.
 *
 * Returns undefined if not cached.
 */
export function getWorkspaceSchema(
	workspaceId: string,
): AppWorkspaceSchema | undefined {
	return schemaCache.get(workspaceId);
}

/**
 * Remove a workspace schema from the cache.
 *
 * Called when deleting a workspace.
 */
export function removeWorkspaceSchema(workspaceId: string): void {
	schemaCache.delete(workspaceId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a workspace schema by its slug.
 *
 * Searches through cached schemas. Returns undefined if not found.
 *
 * @example
 * ```typescript
 * const schema = findWorkspaceBySlug('my-blog');
 * if (schema) {
 *   console.log(schema.id); // GUID
 * }
 * ```
 */
export function findWorkspaceBySlug(
	slug: string,
): AppWorkspaceSchema | undefined {
	console.log(
		`[Registry] Looking for slug: "${slug}", cache size: ${schemaCache.size}`,
	);
	for (const schema of schemaCache.values()) {
		console.log(
			`[Registry] Checking: "${schema.slug}" === "${slug}" ?`,
			schema.slug === slug,
		);
		if (schema.slug === slug) {
			return schema;
		}
	}
	return undefined;
}

/**
 * Get all workspace schemas from the cache.
 *
 * Returns an array of all cached schemas. The order is not guaranteed.
 */
export function getAllWorkspaceSchemas(): AppWorkspaceSchema[] {
	return Array.from(schemaCache.values());
}

/**
 * Check if a slug is already in use by another workspace.
 */
export function isSlugTaken(slug: string): boolean {
	return findWorkspaceBySlug(slug) !== undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clean up a head doc from the cache.
 *
 * Called when deleting a workspace.
 */
export function removeHeadDoc(workspaceId: string): void {
	const head = headDocs.get(workspaceId);
	if (head) {
		head.destroy();
		headDocs.delete(workspaceId);
		headInitPromises.delete(workspaceId);
	}
}
