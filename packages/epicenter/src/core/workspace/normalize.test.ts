/**
 * Tests for icon and KV normalization functions.
 *
 * Note: Table normalization is now handled by the `table()` factory function
 * in fields/factories.ts. See fields/factories.test.ts for table tests.
 */

import { describe, expect, test } from 'bun:test';
import type { IconDefinition } from '../schema/fields/types';
import { normalizeIcon } from './normalize';

describe('normalizeIcon', () => {
	test('string input → IconDefinition (emoji)', () => {
		const result = normalizeIcon('📝');
		expect(result).toEqual({ type: 'emoji', value: '📝' });
	});

	test('string input with unicode emoji → IconDefinition', () => {
		const result = normalizeIcon('🚀');
		expect(result).toEqual({ type: 'emoji', value: '🚀' });
	});

	test('IconDefinition input → unchanged', () => {
		const icon: IconDefinition = { type: 'emoji', value: '📝' };
		const result = normalizeIcon(icon);
		expect(result).toEqual(icon);
	});

	test('external IconDefinition input → unchanged', () => {
		const icon: IconDefinition = {
			type: 'external',
			url: 'https://example.com/icon.png',
		};
		const result = normalizeIcon(icon);
		expect(result).toEqual(icon);
	});

	test('null input → null', () => {
		expect(normalizeIcon(null)).toBeNull();
	});

	test('undefined input → null', () => {
		expect(normalizeIcon(undefined)).toBeNull();
	});
});
