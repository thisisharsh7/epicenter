import { describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { createUnionSchema } from './schema-union.js';

describe('createUnionSchema', () => {
	test('validates against first matching schema', () => {
		const v1 = type({ id: 'string', title: 'string' });
		const v2 = type({ id: 'string', title: 'string', views: 'number' });

		const union = createUnionSchema([v1, v2]);
		const result = union['~standard'].validate({ id: '1', title: 'Hello' });

		if (result.issues) {
			expect.unreachable('Expected validation to pass');
		} else {
			expect(result.value).toEqual({ id: '1', title: 'Hello' });
		}
	});

	test('validates against second schema when first fails', () => {
		const v1 = type({ id: 'string', title: 'string' });
		const v2 = type({ id: 'string', title: 'string', views: 'number' });

		const union = createUnionSchema([v1, v2]);
		const result = union['~standard'].validate({
			id: '1',
			title: 'Hello',
			views: 42,
		});

		if (result.issues) {
			expect.unreachable('Expected validation to pass');
		}
	});

	test('returns error when no schema matches', () => {
		const v1 = type({ id: 'string', title: 'string' });

		const union = createUnionSchema([v1]);
		const result = union['~standard'].validate({ id: 123 }); // id should be string

		if (result.issues) {
			expect(result.issues.length).toBeGreaterThan(0);
		} else {
			expect.unreachable('Expected validation to fail');
		}
	});
});
