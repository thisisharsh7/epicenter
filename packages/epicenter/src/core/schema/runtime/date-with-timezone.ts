/**
 * Storage format types for timezone-aware dates.
 *
 * Runtime representation: Temporal.ZonedDateTime (from datetime.ts)
 * Storage format: "2024-01-01T20:00:00.000Z|America/New_York"
 */

import type { Brand } from 'wellcrafted/brand';
import { DATE_WITH_TIMEZONE_STRING_REGEX } from './regex';

/** ISO 8601 UTC datetime string from Date.toISOString() */
export type DateIsoString = string & Brand<'DateIsoString'>;

/** IANA timezone identifier (e.g., "America/New_York", "UTC") */
export type TimezoneId = string & Brand<'TimezoneId'>;

/** Database storage format: "ISO_UTC|TIMEZONE" */
export type DateWithTimezoneString = `${DateIsoString}|${TimezoneId}` &
	Brand<'DateWithTimezoneString'>;

/**
 * Type guard to check if a string is a valid DateWithTimezoneString.
 * Format: "YYYY-MM-DDTHH:mm:ss.sssZ|TIMEZONE" (24 char ISO + pipe + timezone)
 */
export function isDateWithTimezoneString(
	value: unknown,
): value is DateWithTimezoneString {
	if (typeof value !== 'string') return false;
	return DATE_WITH_TIMEZONE_STRING_REGEX.test(value);
}
