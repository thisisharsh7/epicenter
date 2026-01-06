/**
 * DateTime types and Temporal API helpers.
 *
 * Storage format: "2024-01-01T20:00:00.000Z|America/New_York"
 * Runtime type: Temporal.ZonedDateTime (use directly for all date operations)
 */

import { Temporal } from 'temporal-polyfill';
import type { Brand } from 'wellcrafted/brand';
import { DATE_TIME_STRING_REGEX } from './regex';

/** ISO 8601 UTC datetime string from Date.toISOString() */
export type DateIsoString = string & Brand<'DateIsoString'>;

/** IANA timezone identifier (e.g., "America/New_York", "UTC") */
export type TimezoneId = string & Brand<'TimezoneId'>;

/** Database storage format: "ISO_UTC|TIMEZONE" */
export type DateTimeString = `${DateIsoString}|${TimezoneId}` &
	Brand<'DateTimeString'>;

/**
 * Type guard to check if a string is a valid DateTimeString.
 * Format: "YYYY-MM-DDTHH:mm:ss.sssZ|TIMEZONE" (24 char ISO + pipe + timezone)
 */
export function isDateTimeString(value: unknown): value is DateTimeString {
	if (typeof value !== 'string') return false;
	return DATE_TIME_STRING_REGEX.test(value);
}

/**
 * Serialize Temporal.ZonedDateTime to storage string.
 *
 * @example
 * const stored = toDateTimeString(Temporal.Now.zonedDateTimeISO('America/New_York'));
 * // => "2024-01-01T20:00:00.000Z|America/New_York"
 */
export function toDateTimeString(dt: Temporal.ZonedDateTime): DateTimeString {
	const date = new Date(dt.epochMilliseconds);
	return `${date.toISOString()}|${dt.timeZoneId}` as DateTimeString;
}

/**
 * Parse storage string to Temporal.ZonedDateTime.
 *
 * @example
 * const dt = fromDateTimeString("2024-01-01T20:00:00.000Z|America/New_York");
 * dt.add({ months: 1 }); // Date math just works
 */
export function fromDateTimeString(
	str: DateTimeString,
): Temporal.ZonedDateTime {
	if (!DATE_TIME_STRING_REGEX.test(str)) {
		throw new Error(`Invalid DateTimeString format: ${str}`);
	}
	const instant = str.slice(0, 24);
	const timezone = str.slice(25);
	return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone);
}
