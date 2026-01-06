/**
 * Temporal API helpers for DateTimeString serialization.
 *
 * Storage format: "2024-01-01T20:00:00.000Z|America/New_York"
 * Runtime type: Temporal.ZonedDateTime (use directly for all date operations)
 */

import { Temporal } from 'temporal-polyfill';
import type { DateWithTimezoneString } from './date-with-timezone';
import { DATE_WITH_TIMEZONE_STRING_REGEX } from './regex';

export { Temporal };

/**
 * Serialize Temporal.ZonedDateTime to storage string.
 *
 * @example
 * const stored = toDateTimeString(Temporal.Now.zonedDateTimeISO('America/New_York'));
 * // => "2024-01-01T20:00:00.000Z|America/New_York"
 */
export function toDateTimeString(
	dt: Temporal.ZonedDateTime,
): DateWithTimezoneString {
	const date = new Date(dt.epochMilliseconds);
	return `${date.toISOString()}|${dt.timeZoneId}` as DateWithTimezoneString;
}

/**
 * Parse storage string to Temporal.ZonedDateTime.
 *
 * @example
 * const dt = fromDateTimeString("2024-01-01T20:00:00.000Z|America/New_York");
 * dt.add({ months: 1 }); // Date math just works
 */
export function fromDateTimeString(
	str: DateWithTimezoneString,
): Temporal.ZonedDateTime {
	if (!DATE_WITH_TIMEZONE_STRING_REGEX.test(str)) {
		throw new Error(`Invalid DateTimeString format: ${str}`);
	}
	const instant = str.slice(0, 24);
	const timezone = str.slice(25);
	return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone);
}
