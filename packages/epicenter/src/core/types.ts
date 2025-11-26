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
