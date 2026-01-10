import type { FieldDefinitions, TableDefinition } from '@epicenter/hq';

/**
 * Check if a table entry is in the new TableDefinition format (has `fields` property)
 * or the old bare FieldDefinitions format (fields directly on the object).
 */
export function isTableDefinition(table: unknown): table is TableDefinition {
	return (
		typeof table === 'object' &&
		table !== null &&
		'fields' in table &&
		typeof (table as TableDefinition).fields === 'object'
	);
}

/**
 * Get the fields from a table, handling both old and new formats.
 *
 * Old format: { id: { type: 'id' }, title: { type: 'text' } }
 * New format: { name: '...', icon: ..., fields: { id: { type: 'id' } } }
 */
export function getTableFields(table: unknown): FieldDefinitions | undefined {
	if (!table || typeof table !== 'object') return undefined;

	if (isTableDefinition(table)) {
		return table.fields;
	}

	// Old format - the table object IS the field definitions
	// Check if it has an 'id' field with 'type' property to confirm it's FieldDefinitions
	const maybeFields = table as Record<string, unknown>;
	if (
		maybeFields.id &&
		typeof maybeFields.id === 'object' &&
		maybeFields.id !== null &&
		'type' in maybeFields.id
	) {
		return table as FieldDefinitions;
	}

	return undefined;
}

/**
 * Get table metadata, with defaults for old format tables.
 */
export function getTableMetadata(
	tableKey: string,
	table: unknown,
): { name: string; icon: TableDefinition['icon']; description: string } {
	if (isTableDefinition(table)) {
		return {
			name: table.name,
			icon: table.icon,
			description: table.description,
		};
	}

	// Old format - just use the key as-is (snake_case is fine)
	return {
		name: tableKey,
		icon: null,
		description: '',
	};
}
