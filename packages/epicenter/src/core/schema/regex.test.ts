import { describe, expect, test } from 'bun:test';
import {
	DATE_WITH_TIMEZONE_STRING_REGEX,
	ISO_DATETIME_REGEX,
	TIMEZONE_ID_REGEX,
} from './regex';

describe('ISO_DATETIME_REGEX', () => {
	describe('valid formats', () => {
		test('date only (YYYY-MM-DD)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01')).toBe(true);
		});

		test('date + time (YYYY-MM-DDTHH:mm)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00')).toBe(true);
		});

		test('date + time + seconds (YYYY-MM-DDTHH:mm:ss)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00')).toBe(true);
		});

		test('date + time + milliseconds (YYYY-MM-DDTHH:mm:ss.SSS)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.000')).toBe(true);
		});

		test('date + time + milliseconds + UTC (Z)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.000Z')).toBe(true);
		});

		test('date + time + milliseconds + positive offset (+HH:mm)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.000+05:00')).toBe(
				true,
			);
		});

		test('date + time + milliseconds + negative offset (-HH:mm)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00-05:00')).toBe(true);
		});

		test('single digit milliseconds', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.0Z')).toBe(true);
		});

		test('two digit milliseconds', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.00Z')).toBe(true);
		});

		test('max milliseconds (999)', () => {
			expect(ISO_DATETIME_REGEX.test('2024-01-01T20:00:00.999Z')).toBe(true);
		});

		test('Date.toISOString() output format', () => {
			const isoString = new Date('2024-01-01T20:00:00.000Z').toISOString();
			expect(ISO_DATETIME_REGEX.test(isoString)).toBe(true);
		});
	});

	describe('invalid formats', () => {
		test('2-digit year', () => {
			expect(ISO_DATETIME_REGEX.test('24-01-01')).toBe(false);
		});

		test('wrong separator (slash)', () => {
			expect(ISO_DATETIME_REGEX.test('2024/01/01')).toBe(false);
		});

		test('empty string', () => {
			expect(ISO_DATETIME_REGEX.test('')).toBe(false);
		});
	});

	describe('edge cases', () => {
		test('regex does not validate month ranges (accepts 13)', () => {
			// Note: regex validates format, not semantic correctness
			expect(ISO_DATETIME_REGEX.test('2024-13-01')).toBe(true);
		});

		test('regex does not validate hour ranges (accepts 25)', () => {
			// Note: regex validates format, not semantic correctness
			expect(ISO_DATETIME_REGEX.test('2024-01-01T25:00:00Z')).toBe(true);
		});
	});
});

describe('TIMEZONE_ID_REGEX', () => {
	describe('valid IANA timezone identifiers', () => {
		test('UTC', () => {
			expect(TIMEZONE_ID_REGEX.test('UTC')).toBe(true);
		});

		test('America/New_York', () => {
			expect(TIMEZONE_ID_REGEX.test('America/New_York')).toBe(true);
		});

		test('Europe/London', () => {
			expect(TIMEZONE_ID_REGEX.test('Europe/London')).toBe(true);
		});

		test('Asia/Tokyo', () => {
			expect(TIMEZONE_ID_REGEX.test('Asia/Tokyo')).toBe(true);
		});

		test('Etc/GMT+5', () => {
			expect(TIMEZONE_ID_REGEX.test('Etc/GMT+5')).toBe(true);
		});

		test('Etc/GMT-5', () => {
			expect(TIMEZONE_ID_REGEX.test('Etc/GMT-5')).toBe(true);
		});

		test('US/Pacific', () => {
			expect(TIMEZONE_ID_REGEX.test('US/Pacific')).toBe(true);
		});

		test('single letter (Z)', () => {
			expect(TIMEZONE_ID_REGEX.test('Z')).toBe(true);
		});
	});

	describe('strings without valid timezone identifiers', () => {
		test('only digits', () => {
			expect(TIMEZONE_ID_REGEX.test('123')).toBe(false);
		});

		test('starts with hyphen (offset notation)', () => {
			expect(TIMEZONE_ID_REGEX.test('-05:00')).toBe(false);
		});

		test('empty string', () => {
			expect(TIMEZONE_ID_REGEX.test('')).toBe(false);
		});
	});

	describe('component regex behavior (matches anywhere in string)', () => {
		test('finds timezone ID even if preceded by underscore', () => {
			// This is expected: component regexes don't have anchors
			// When composed into DATE_WITH_TIMEZONE_STRING_REGEX, anchors are added
			expect(TIMEZONE_ID_REGEX.test('_UTC')).toBe(true); // matches "UTC"
		});

		test('finds timezone ID even if preceded by slash', () => {
			expect(TIMEZONE_ID_REGEX.test('/America')).toBe(true); // matches "America"
		});
	});
});

describe('DATE_WITH_TIMEZONE_STRING_REGEX', () => {
	describe('valid DateWithTimezoneString formats', () => {
		test('full ISO datetime with timezone', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test(
					'2024-01-01T20:00:00.000Z|America/New_York',
				),
			).toBe(true);
		});

		test('date only with timezone', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01|UTC')).toBe(
				true,
			);
		});

		test('datetime with offset and timezone', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test(
					'2024-01-01T20:00:00+05:00|Asia/Tokyo',
				),
			).toBe(true);
		});

		test('minimal valid format', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01|Z')).toBe(true);
		});
	});

	describe('invalid formats', () => {
		test('no timezone (missing pipe)', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01')).toBe(false);
		});

		test('empty timezone after pipe', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01|')).toBe(false);
		});

		test('no datetime (pipe at start)', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('|America/New_York')).toBe(
				false,
			);
		});

		test('space separator instead of pipe', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01 America/New_York'),
			).toBe(false);
		});

		test('no pipe, no timezone', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-01-01T20:00:00.000Z'),
			).toBe(false);
		});

		test('empty string', () => {
			expect(DATE_WITH_TIMEZONE_STRING_REGEX.test('')).toBe(false);
		});
	});

	describe('capture groups', () => {
		test('extracts datetime and timezone parts', () => {
			const input = '2024-01-01T20:00:00.000Z|America/New_York';
			const match = input.match(DATE_WITH_TIMEZONE_STRING_REGEX);

			expect(match).not.toBeNull();
			expect(match?.[1]).toBe('2024-01-01T20:00:00.000Z'); // datetime
			expect(match?.[2]).toBe('America/New_York'); // timezone
		});

		test('extracts minimal format', () => {
			const input = '2024-01-01|UTC';
			const match = input.match(DATE_WITH_TIMEZONE_STRING_REGEX);

			expect(match).not.toBeNull();
			expect(match?.[1]).toBe('2024-01-01'); // datetime
			expect(match?.[2]).toBe('UTC'); // timezone
		});

		test('extracts datetime with offset', () => {
			const input = '2024-01-01T20:00:00+05:00|Asia/Tokyo';
			const match = input.match(DATE_WITH_TIMEZONE_STRING_REGEX);

			expect(match).not.toBeNull();
			expect(match?.[1]).toBe('2024-01-01T20:00:00+05:00'); // datetime
			expect(match?.[2]).toBe('Asia/Tokyo'); // timezone
		});
	});

	describe('real-world examples', () => {
		test('New York Eastern Time', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test(
					'2024-01-01T15:30:00.000Z|America/New_York',
				),
			).toBe(true);
		});

		test('Tokyo time', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test(
					'2024-01-01T09:00:00.000Z|Asia/Tokyo',
				),
			).toBe(true);
		});

		test('London time', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test(
					'2024-07-15T14:22:33.123Z|Europe/London',
				),
			).toBe(true);
		});

		test('UTC time', () => {
			expect(
				DATE_WITH_TIMEZONE_STRING_REGEX.test('2024-12-31T23:59:59.999Z|UTC'),
			).toBe(true);
		});
	});
});
