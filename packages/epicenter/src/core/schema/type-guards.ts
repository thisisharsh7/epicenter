/**
 * @fileoverview Type guards for runtime type checking
 *
 * Provides type guard functions to validate serialized values at runtime.
 */

import type { SerializedCellValue, SerializedRow } from './types';

/**
 * Type guard to check if a value is a valid SerializedCellValue.
 * Validates that the value is a plain JavaScript type (not a Y.js type).
 *
 * @param value - Value to check
 * @returns true if value is a valid SerializedCellValue
 * @example
 * ```typescript
 * isSerializedCellValue("hello") // true
 * isSerializedCellValue(42) // true
 * isSerializedCellValue(null) // true
 * isSerializedCellValue(['a', 'b']) // true
 * isSerializedCellValue(yText) // false (Y.js type)
 * ```
 */
export function isSerializedCellValue(
	value: unknown,
): value is SerializedCellValue {
	// null
	if (value === null) return true;

	// string | number | boolean
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return true;
	}

	// string[] (for multi-select)
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return true;
	}

	// Plain object or array (for JSON columns)
	// Exclude Y.js types which have specific constructor names
	if (typeof value === 'object') {
		const constructorName = value.constructor?.name;
		// Y.js types include: Text, Array, Map, XmlElement, XmlText, etc.
		// Plain objects have constructor name "Object" or "Array"
		if (constructorName === 'Object' || constructorName === 'Array') {
			return true;
		}
	}

	return false;
}

/**
 * Type guard to check if an object is a valid SerializedRow.
 * Validates that all values are SerializedCellValue types.
 *
 * @param value - Value to check
 * @returns true if value is a SerializedRow
 * @example
 * ```typescript
 * isSerializedRow({ id: '123', name: 'John' }) // true
 * isSerializedRow({ id: '123', data: yText }) // false (contains Y.js type)
 * isSerializedRow([]) // false (not an object)
 * ```
 */
export function isSerializedRow(value: unknown): value is SerializedRow {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	// Check that all values are valid SerializedCellValue
	return Object.values(value).every(isSerializedCellValue);
}
