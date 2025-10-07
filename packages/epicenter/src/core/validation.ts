import * as Y from 'yjs';
import type { Row, TableSchema } from './column-schemas';

/**
 * A row that has been validated against its table schema
 * This is just a type alias - the validation happens at runtime
 */
export type ValidatedRow<TSchema extends TableSchema = TableSchema> =
	Row<TSchema>;

/**
 * Discriminated union representing validation result
 * Either valid (typed data) or invalid (raw data)
 */
export type ValidationResult<TValid, TInvalid = unknown> =
	| { valid: TValid; invalid: null }
	| { valid: null; invalid: TInvalid };

/**
 * Validate a row against its table schema
 * Returns validation result with either valid typed row or invalid raw row
 *
 * @param data - The row data to validate
 * @param schema - The table schema to validate against
 * @returns ValidationResult with valid typed row or invalid raw row
 */
export function validateRow<TSchema extends TableSchema>(
	data: Row,
	schema: TSchema,
): ValidationResult<ValidatedRow<TSchema>, Row> {
	// Validate each field in schema
	for (const [fieldName, columnSchema] of Object.entries(schema)) {
		const value = data[fieldName];

		// Check nullable
		if (value === null || value === undefined) {
			if ('nullable' in columnSchema && !columnSchema.nullable) {
				console.warn(
					`Validation failed: field "${fieldName}" is required but got null/undefined`,
				);
				return { valid: null, invalid: data };
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
					return { valid: null, invalid: data };
				}
				break;

			case 'integer':
				if (typeof value !== 'number' || !Number.isInteger(value)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected integer, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'real':
				if (typeof value !== 'number') {
					console.warn(
						`Validation failed: field "${fieldName}" expected number, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'boolean':
				if (typeof value !== 'boolean') {
					console.warn(
						`Validation failed: field "${fieldName}" expected boolean, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'ytext':
				if (!(value instanceof Y.Text)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.Text, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'yxmlfragment':
				if (!(value instanceof Y.XmlFragment)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.XmlFragment, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'select':
				if (typeof value !== 'string') {
					console.warn(
						`Validation failed: field "${fieldName}" expected string, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				if (
					'options' in columnSchema &&
					!columnSchema.options.includes(value)
				) {
					console.warn(
						`Validation failed: field "${fieldName}" value "${value}" not in options`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'multi-select':
				if (!(value instanceof Y.Array)) {
					console.warn(
						`Validation failed: field "${fieldName}" expected Y.Array, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;

			case 'date':
				if (
					typeof value !== 'object' ||
					value === null ||
					!('date' in value) ||
					!('timezone' in value)
				) {
					console.warn(
						`Validation failed: field "${fieldName}" expected DateWithTimezone object, got ${typeof value}`,
					);
					return { valid: null, invalid: data };
				}
				break;
		}
	}

	return { valid: data as ValidatedRow<TSchema>, invalid: null };
}
