/**
 * Workspace templates for pre-configured schemas.
 *
 * Templates provide ready-to-use workspace definitions that users can
 * select when creating a new workspace instead of starting from scratch.
 */

import { ENTRIES_TEMPLATE } from './entries';

/**
 * Registry of available workspace templates.
 *
 * The 'blank' template is implicit and not listed here.
 * Add new templates by importing them and adding to this array.
 */
export const WORKSPACE_TEMPLATES = [ENTRIES_TEMPLATE] as const;

/**
 * A workspace template definition.
 *
 * Templates are similar to WorkspaceDefinition but with predefined
 * id, name, tables, and kv that get applied when the user creates
 * a workspace from this template.
 */
export type WorkspaceTemplate = (typeof WORKSPACE_TEMPLATES)[number];
