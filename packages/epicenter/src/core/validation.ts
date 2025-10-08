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
 * Reasons why structural validation failed
 */
export type InvalidStructureReason =
	| {
		type: 'not-an-object';
		actual: unknown;
	}
	| {
		type: 'invalid-cell-value';
		field: string;
		actual: unknown;
	};

/**
 * Reasons why schema validation failed
 */
export type SchemaMismatchReason =
	| {
		type: 'missing-required-field';
		field: string;
	}
	| {
		type: 'type-mismatch';
		field: string;
		expected: string;
		actual: unknown;
	}
	| {
		type: 'invalid-option';
		field: string;
		actual: string;
		allowedOptions: readonly string[];
	};

/**
 * Discriminated union representing row validation result
 * Three possible states:
 * - valid: Data matches schema perfectly
 * - schema-mismatch: Valid Row structure but doesn't match schema
 * - invalid-structure: Not a valid Row structure
 */
export type RowValidationResult<TRow extends Row> =
	| { status: 'valid'; data: TRow }
	| { status: 'schema-mismatch'; data: Row; reason: SchemaMismatchReason }
	| {
		status: 'invalid-structure';
		data: unknown;
		reason: InvalidStructureReason;
	};

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
	// Step 1: Structural validation - check if data is a valid object (not null, array, or primitive)
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		return {
			status: 'invalid-structure',
			data,
			reason: { type: 'not-an-object', actual: data },
		};
	}

	// Check all values are valid CellValue types
	for (const [key, value] of Object.entries(data)) {
		if (!isValidCellValue(value)) {
			return {
				status: 'invalid-structure',
				data,
				reason: { type: 'invalid-cell-value', field: key, actual: value },
			};
		}
	}

	// At this point we know it's a valid Row structure
	const row = data as Row;

	// Step 2: Schema validation - validate each field against schema constraints
	for (const [fieldName, columnSchema] of Object.entries(schema)) {
		const value = row[fieldName];

		// Check if required field is null/undefined
		if (value === null || value === undefined) {
			if (columnSchema.type === 'id' || !columnSchema.nullable) {
				return {
					status: 'schema-mismatch',
					data: row,
					reason: { type: 'missing-required-field', field: fieldName },
				};
			}
			continue;
		}

		// Type-specific validation
		switch (columnSchema.type) {
			case 'id':
			case 'text':
				if (typeof value !== 'string') {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'string',
							actual: value,
						},
					};
				}
				break;

			case 'integer':
				if (typeof value !== 'number' || !Number.isInteger(value)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'integer',
							actual: value,
						},
					};
				}
				break;

			case 'real':
				if (typeof value !== 'number') {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'number',
							actual: value,
						},
					};
				}
				break;

			case 'boolean':
				if (typeof value !== 'boolean') {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'boolean',
							actual: value,
						},
					};
				}
				break;

			case 'ytext':
				if (!(value instanceof Y.Text)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'Y.Text',
							actual: value,
						},
					};
				}
				break;

			case 'yxmlfragment':
				if (!(value instanceof Y.XmlFragment)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'Y.XmlFragment',
							actual: value,
						},
					};
				}
				break;

			case 'select':
				if (typeof value !== 'string') {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'string',
							actual: value,
						},
					};
				}
				if (!columnSchema.options.includes(value)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'invalid-option',
							field: fieldName,
							actual: value,
							allowedOptions: columnSchema.options,
						},
					};
				}
				break;

			case 'multi-select':
				if (!(value instanceof Y.Array)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'Y.Array',
							actual: value,
						},
					};
				}
				break;

			case 'date':
				if (!isDateWithTimezone(value)) {
					return {
						status: 'schema-mismatch',
						data: row,
						reason: {
							type: 'type-mismatch',
							field: fieldName,
							expected: 'DateWithTimezone',
							actual: value,
						},
					};
				}
				break;
		}
	}

	return { status: 'valid', data: row as ValidatedRow<TSchema> };
}
