import * as Y from 'yjs';
import {
	isDateWithTimezone,
	type CellValue,
	type Row,
	type TableSchema,
} from './column-schemas';

/**
 * A row that has been validated against its table schema
 * This is just a type alias - the validation happens at runtime
 */
export type ValidatedRow<TSchema extends TableSchema = TableSchema> =
	Row<TSchema>;

/**
 * Discriminated union representing row validation result
 * Three possible states:
 * - valid: Data matches schema perfectly
 * - schema_mismatch: Valid Row structure but doesn't match schema
 * - invalid_structure: Not a valid Row structure
 */
export type RowValidationResult<TRow extends Row> =
	| { status: 'valid'; data: TRow }
	| { status: 'schema_mismatch'; data: Row }
	| { status: 'invalid_structure'; data: unknown };

/**
 * Check if a value is a valid CellValue type
 */
function isValidCellValue(value: unknown): value is CellValue {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return true;
	if (typeof value === 'number') return true;
	if (typeof value === 'boolean') return true;
	if (value instanceof Y.Text) return true;
	if (value instanceof Y.XmlFragment) return true;
	if (value instanceof Y.Array) return true;
	if (isDateWithTimezone(value)) return true;
	return false;
}

/**
 * Validate a row against its table schema
 * Performs two-level validation:
 * 1. Structural: Is the data a valid Row? (all values are valid CellValue types)
 * 2. Schema: Does the Row match the specific table schema?
 *
 * @param data - The data to validate (can be anything)
 * @param schema - The table schema to validate against
 * @returns RowValidationResult with status and typed/untyped data
 */
export function validateRow<TSchema extends TableSchema>(
	data: unknown,
	schema: TSchema,
): RowValidationResult<ValidatedRow<TSchema>> {
	// Step 1: Structural validation - is this even a valid Row?
	if (typeof data !== 'object' || data === null) {
		console.warn('Validation failed: data is not an object');
		return { status: 'invalid_structure', data };
	}

	// Check all values are valid CellValue types
	for (const [key, value] of Object.entries(data)) {
		if (!isValidCellValue(value)) {
			console.warn(
				`Validation failed: field "${key}" has invalid type (${typeof value})`,
			);
			return { status: 'invalid_structure', data };
		}
	}

	// At this point we know it's a valid Row structure
	const row = data as Row;

	// Step 2: Schema validation - validate each field in schema
	for (const [fieldName, columnSchema] of Object.entries(schema)) {
		const value = row[fieldName];

		// Check nullable
		if (value === null || value === undefined) {
			if ('nullable' in columnSchema && !columnSchema.nullable) {
				console.warn(
					`Validation failed: field "${fieldName}" is required but got null/undefined`,
				);
				return { status: 'schema_mismatch', data: row };
			}
			continue;
		}

		// Type-specific validation
		switch (columnSchema.type) {
			case 'id':
			case 'text':
				if (typeof value !== 'string') {
					console.warn(
						`Validation failed: field "${fieldName}" expected string, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'integer':
				if (typeof value !== 'number' || !Number.isInteger(value)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected integer, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'real':
				if (typeof value !== 'number') {
					console.warn(
						`Validation failed: field "${fieldName}" expected number, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'boolean':
				if (typeof value !== 'boolean') {
					console.warn(
						`Validation failed: field "${fieldName}" expected boolean, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'ytext':
				if (!(value instanceof Y.Text)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.Text, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'yxmlfragment':
				if (!(value instanceof Y.XmlFragment)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.XmlFragment, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'select':
				if (typeof value !== 'string') {
					console.warn(
						`Validation failed: field "${fieldName}" expected string, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				if (
					'options' in columnSchema &&
					!columnSchema.options.includes(value)
				) {
					console.warn(
						`Validation failed: field "${fieldName}" value "${value}" not in options`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'multi-select':
				if (!(value instanceof Y.Array)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.Array, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;

			case 'date':
				if (!isDateWithTimezone(value)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected DateWithTimezone object, got ${typeof value}`,
					);
					return { status: 'schema_mismatch', data: row };
				}
				break;
		}
	}

	return { status: 'valid', data: row as ValidatedRow<TSchema> };
}
