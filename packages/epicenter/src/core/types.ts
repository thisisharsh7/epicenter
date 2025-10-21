/**
 * Base alphanumeric character: a-z, A-Z, 0-9
 */
export type AlphanumericChar =
	| 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
	| 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
	| 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
	| 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
	| '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * Extended identifier character: includes alphanumeric plus _, -, .
 */
export type FileNameChar = AlphanumericChar | '_' | '-' | '.';

/**
 * Check if a string starts with an invalid character (. or /)
 */
type StartsWithInvalid<S extends string> =
	S extends `.${string}` ? true :
	S extends `/${string}` ? true :
	false;

/**
 * Check if a string contains only valid filename characters.
 */
type IsValidFileNameChars<S extends string> =
	S extends '' ? true :
	S extends `${FileNameChar}${infer Rest}` ? IsValidFileNameChars<Rest> :
	false;

/**
 * File name identifier with compile-time validation and error messages.
 *
 * Valid characters: a-z, A-Z, 0-9, _, -, .
 *
 * Constraints:
 * - Cannot be empty
 * - Cannot start with '.' (no hidden files)
 * - Cannot start with '/' (no paths)
 * - Must only contain alphanumeric characters, underscores, hyphens, and periods
 *
 * Valid examples:
 * - 'my-app'
 * - 'user_profile'
 * - 'cache.v2'
 * - 'blog123'
 * - 'asdf.db'
 *
 * Invalid examples:
 * - '' (empty string)
 * - '.hidden' (starts with '.')
 * - '/path/to/file' (starts with '/')
 * - 'my@app' (contains '@')
 * - 'my app' (contains space)
 *
 * @example
 * ```typescript
 * // ✓ Valid - compiles
 * const valid: FileName<'asdf.db'> = 'asdf.db';
 *
 * // ✗ Type error with descriptive message
 * const invalid1: FileName<'.hidden'> = '.hidden';
 * // Error: "FileName cannot start with '.' or '/'"
 *
 * const invalid2: FileName<'my@app'> = 'my@app';
 * // Error: "FileName contains invalid characters. Only a-z, A-Z, 0-9, _, -, . are allowed."
 *
 * // Works with generic string (no validation)
 * function acceptsAny(name: FileName) {
 *   // name is just string at runtime
 * }
 * ```
 */
export type FileName<S extends string = string> =
	S extends ''
		? "Error: FileName cannot be empty"
		: StartsWithInvalid<S> extends true
			? "Error: FileName cannot start with '.' or '/'"
			: IsValidFileNameChars<S> extends true
				? S
				: "Error: FileName contains invalid characters. Only a-z, A-Z, 0-9, _, -, . are allowed.";

/**
 * Type guard to check if a string is a valid filename.
 *
 * @param value - The string to validate
 * @returns True if the string is a valid filename
 *
 * @example
 * ```typescript
 * const filename = isValidFileName('asdf.db');
 * if (filename) {
 *   // filename is now validated
 *   useFilename(filename);
 * }
 * ```
 */
export function isValidFileName(value: string): boolean {
	// Empty string is not a valid filename
	if (!value) {
		return false;
	}

	// Check if starts with . or /
	if (value.startsWith('.') || value.startsWith('/')) {
		return false;
	}

	// Check if all characters are valid: a-z, A-Z, 0-9, _, -, .
	const validPattern = /^[a-zA-Z0-9_.-]+$/;
	return validPattern.test(value);
}
