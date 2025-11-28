import type { Brand } from 'wellcrafted/brand';

/**
 * Branded type for absolute filesystem paths
 *
 * This ensures paths have been resolved to absolute paths at the type level,
 * preventing accidental use of relative paths in filesystem operations.
 *
 * @example
 * ```typescript
 * import { resolveAbsolutePath } from './helpers';
 *
 * // Create an absolute path
 * const absolutePath = resolveAbsolutePath('/Users/me/project');
 *
 * // TypeScript enforces that only AbsolutePath can be used
 * function saveFile(path: AbsolutePath) { ... }
 * saveFile(absolutePath); // ✓ OK
 * saveFile('./relative'); // ✗ Type error
 * ```
 */
export type AbsolutePath = string & Brand<'AbsolutePath'>;

/**
 * Branded type for the `.epicenter` directory path
 *
 * This is the absolute path to the `.epicenter` directory where all Epicenter
 * data is stored (YJS documents, SQLite databases, logs, tokens, etc.).
 *
 * Computed once from `storageDir` and passed to providers, indexes, and exports
 * to avoid repeated `path.join(storageDir, '.epicenter')` calls.
 *
 * @example
 * ```typescript
 * // In a workspace export
 * exports: ({ epicenterDir }) => ({
 *   login: defineMutation({
 *     handler: async () => {
 *       if (!epicenterDir) {
 *         return Err({ message: 'Requires filesystem access' });
 *       }
 *       const tokenPath = path.join(epicenterDir, 'gmail-token.json');
 *       // ...
 *     }
 *   })
 * })
 * ```
 */
export type EpicenterDir = string & Brand<'EpicenterDir'>;
