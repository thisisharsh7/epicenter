import { describe, expect, test } from 'bun:test';
import { Value } from 'typebox/value';
import { Compile } from 'typebox/compile';
import { type } from 'arktype';
import {
	id,
	integer,
	json,
	select,
	text,
	boolean,
	tags,
	real,
	date,
	richtext,
} from '../../schema';
import { tableSchemaToTypebox, fieldSchemaToTypebox } from './to-typebox';

describe('fieldSchemaToTypebox', () => {
	describe('id', () => {
		test('accepts strings', () => {
			const schema = fieldSchemaToTypebox(id());
			expect(Value.Check(schema, 'test-123')).toBe(true);
			expect(Value.Check(schema, '')).toBe(true);
			expect(Value.Check(schema, 'a'.repeat(1000))).toBe(true);
		});

		test('rejects non-strings', () => {
			const schema = fieldSchemaToTypebox(id());
			expect(Value.Check(schema, 123)).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
			expect(Value.Check(schema, undefined)).toBe(false);
			expect(Value.Check(schema, {})).toBe(false);
		});
	});

	describe('text', () => {
		test('non-nullable accepts strings only', () => {
			const schema = fieldSchemaToTypebox(text());
			expect(Value.Check(schema, 'hello')).toBe(true);
			expect(Value.Check(schema, '')).toBe(true);
			expect(Value.Check(schema, null)).toBe(false);
			expect(Value.Check(schema, 123)).toBe(false);
		});

		test('nullable accepts strings and null', () => {
			const schema = fieldSchemaToTypebox(text({ nullable: true }));
			expect(Value.Check(schema, 'hello')).toBe(true);
			expect(Value.Check(schema, '')).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
			expect(Value.Check(schema, 123)).toBe(false);
		});
	});

	describe('richtext', () => {
		test('always nullable - accepts strings and null', () => {
			const schema = fieldSchemaToTypebox(richtext());
			expect(Value.Check(schema, 'content-id-123')).toBe(true);
			expect(Value.Check(schema, '')).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
			expect(Value.Check(schema, 123)).toBe(false);
		});
	});

	describe('integer', () => {
		test('accepts whole numbers', () => {
			const schema = fieldSchemaToTypebox(integer());
			expect(Value.Check(schema, 0)).toBe(true);
			expect(Value.Check(schema, 42)).toBe(true);
			expect(Value.Check(schema, -100)).toBe(true);
			expect(Value.Check(schema, Number.MAX_SAFE_INTEGER)).toBe(true);
		});

		test('rejects floats', () => {
			const schema = fieldSchemaToTypebox(integer());
			expect(Value.Check(schema, 42.5)).toBe(false);
			expect(Value.Check(schema, 0.1)).toBe(false);
			expect(Value.Check(schema, -3.14)).toBe(false);
		});

		test('rejects non-numbers', () => {
			const schema = fieldSchemaToTypebox(integer());
			expect(Value.Check(schema, '42')).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
			expect(Value.Check(schema, NaN)).toBe(false);
			expect(Value.Check(schema, Infinity)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(integer({ nullable: true }));
			expect(Value.Check(schema, 42)).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});
	});

	describe('real', () => {
		test('accepts any number', () => {
			const schema = fieldSchemaToTypebox(real());
			expect(Value.Check(schema, 0)).toBe(true);
			expect(Value.Check(schema, 42)).toBe(true);
			expect(Value.Check(schema, 3.14159)).toBe(true);
			expect(Value.Check(schema, -99.99)).toBe(true);
		});

		test('rejects non-numbers', () => {
			const schema = fieldSchemaToTypebox(real());
			expect(Value.Check(schema, '3.14')).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(real({ nullable: true }));
			expect(Value.Check(schema, 19.99)).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});
	});

	describe('boolean', () => {
		test('accepts true and false only', () => {
			const schema = fieldSchemaToTypebox(boolean());
			expect(Value.Check(schema, true)).toBe(true);
			expect(Value.Check(schema, false)).toBe(true);
		});

		test('rejects truthy/falsy values', () => {
			const schema = fieldSchemaToTypebox(boolean());
			expect(Value.Check(schema, 0)).toBe(false);
			expect(Value.Check(schema, 1)).toBe(false);
			expect(Value.Check(schema, 'true')).toBe(false);
			expect(Value.Check(schema, 'false')).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(boolean({ nullable: true }));
			expect(Value.Check(schema, true)).toBe(true);
			expect(Value.Check(schema, false)).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});
	});

	describe('date', () => {
		test('accepts valid DateTimeString format', () => {
			const schema = fieldSchemaToTypebox(date());
			expect(
				Value.Check(schema, '2024-01-01T20:00:00.000Z|America/New_York'),
			).toBe(true);
			expect(Value.Check(schema, '2024-12-31T23:59:59.999Z|UTC')).toBe(true);
			expect(
				Value.Check(schema, '2024-06-15T12:30:00.000Z|Europe/London'),
			).toBe(true);
		});

		test('rejects invalid formats', () => {
			const schema = fieldSchemaToTypebox(date());
			expect(Value.Check(schema, '2024-01-01')).toBe(false);
			expect(Value.Check(schema, '2024-01-01T20:00:00Z')).toBe(false);
			expect(Value.Check(schema, 'not-a-date')).toBe(false);
			expect(Value.Check(schema, 1704067200000)).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(date({ nullable: true }));
			expect(
				Value.Check(schema, '2024-01-01T20:00:00.000Z|America/New_York'),
			).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});
	});

	describe('select', () => {
		test('accepts defined options only', () => {
			const schema = fieldSchemaToTypebox(
				select({ options: ['draft', 'published', 'archived'] }),
			);
			expect(Value.Check(schema, 'draft')).toBe(true);
			expect(Value.Check(schema, 'published')).toBe(true);
			expect(Value.Check(schema, 'archived')).toBe(true);
		});

		test('rejects undefined options', () => {
			const schema = fieldSchemaToTypebox(
				select({ options: ['draft', 'published', 'archived'] }),
			);
			expect(Value.Check(schema, 'pending')).toBe(false);
			expect(Value.Check(schema, 'DRAFT')).toBe(false);
			expect(Value.Check(schema, '')).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(
				select({ options: ['a', 'b'], nullable: true }),
			);
			expect(Value.Check(schema, 'a')).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
			expect(Value.Check(schema, 'c')).toBe(false);
		});
	});

	describe('tags', () => {
		test('constrained tags accept valid options', () => {
			const schema = fieldSchemaToTypebox(
				tags({ options: ['tech', 'personal', 'work'] }),
			);
			expect(Value.Check(schema, ['tech'])).toBe(true);
			expect(Value.Check(schema, ['tech', 'work'])).toBe(true);
			expect(Value.Check(schema, ['tech', 'personal', 'work'])).toBe(true);
			expect(Value.Check(schema, [])).toBe(true);
		});

		test('constrained tags reject invalid options', () => {
			const schema = fieldSchemaToTypebox(
				tags({ options: ['tech', 'personal', 'work'] }),
			);
			expect(Value.Check(schema, ['invalid'])).toBe(false);
			expect(Value.Check(schema, ['tech', 'invalid'])).toBe(false);
			expect(Value.Check(schema, ['TECH'])).toBe(false);
		});

		test('unconstrained tags accept any strings', () => {
			const schema = fieldSchemaToTypebox(tags());
			expect(Value.Check(schema, ['anything', 'goes'])).toBe(true);
			expect(Value.Check(schema, ['a', 'b', 'c', 'd', 'e'])).toBe(true);
			expect(Value.Check(schema, [])).toBe(true);
		});

		test('rejects non-array and non-string elements', () => {
			const schema = fieldSchemaToTypebox(tags());
			expect(Value.Check(schema, 'not-an-array')).toBe(false);
			expect(Value.Check(schema, [1, 2, 3])).toBe(false);
			expect(Value.Check(schema, ['valid', 123])).toBe(false);
			expect(Value.Check(schema, null)).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(
				tags({ options: ['a', 'b'], nullable: true }),
			);
			expect(Value.Check(schema, ['a'])).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});
	});

	describe('json', () => {
		test('validates against embedded StandardSchema', () => {
			const schema = fieldSchemaToTypebox(
				json({
					schema: type({ name: 'string', age: 'number' }),
				}),
			);
			expect(Value.Check(schema, { name: 'John', age: 30 })).toBe(true);
			expect(Value.Check(schema, { name: 'Jane', age: 25 })).toBe(true);
		});

		test('rejects invalid structure', () => {
			const schema = fieldSchemaToTypebox(
				json({
					schema: type({ name: 'string', age: 'number' }),
				}),
			);
			expect(Value.Check(schema, { name: 123, age: 30 })).toBe(false);
			expect(Value.Check(schema, { name: 'John' })).toBe(false);
			expect(Value.Check(schema, {})).toBe(false);
			expect(Value.Check(schema, 'not-an-object')).toBe(false);
		});

		test('nullable accepts null', () => {
			const schema = fieldSchemaToTypebox(
				json({
					schema: type({ key: 'string' }),
					nullable: true,
				}),
			);
			expect(Value.Check(schema, { key: 'value' })).toBe(true);
			expect(Value.Check(schema, null)).toBe(true);
		});

		test('validates nested objects', () => {
			const schema = fieldSchemaToTypebox(
				json({
					schema: type({
						user: { name: 'string', email: 'string' },
						settings: { theme: '"light" | "dark"' },
					}),
				}),
			);
			expect(
				Value.Check(schema, {
					user: { name: 'John', email: 'john@example.com' },
					settings: { theme: 'dark' },
				}),
			).toBe(true);
			expect(
				Value.Check(schema, {
					user: { name: 'John', email: 'john@example.com' },
					settings: { theme: 'invalid' },
				}),
			).toBe(false);
		});

		test('validates arrays in schema', () => {
			const schema = fieldSchemaToTypebox(
				json({
					schema: type({ items: 'string[]', count: 'number' }),
				}),
			);
			expect(Value.Check(schema, { items: ['a', 'b'], count: 2 })).toBe(true);
			expect(Value.Check(schema, { items: [], count: 0 })).toBe(true);
			expect(Value.Check(schema, { items: [1, 2], count: 2 })).toBe(false);
		});
	});
});

describe('tableSchemaToTypebox', () => {
	test('creates valid TypeBox object schema', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
		});
		expect(schema.type).toBe('object');
		expect(schema.properties).toBeDefined();
	});

	test('validates complete row', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			count: integer(),
			active: boolean(),
		});

		expect(
			Value.Check(schema, {
				id: '123',
				title: 'Test',
				count: 42,
				active: true,
			}),
		).toBe(true);
	});

	test('rejects missing required fields', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			count: integer(),
		});

		expect(Value.Check(schema, { id: '123', title: 'Test' })).toBe(false);
		expect(Value.Check(schema, { id: '123' })).toBe(false);
		expect(Value.Check(schema, {})).toBe(false);
	});

	test('handles mixed nullable and non-nullable fields', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			required: text(),
			optional: text({ nullable: true }),
			alsoOptional: integer({ nullable: true }),
		});

		expect(
			Value.Check(schema, {
				id: '123',
				required: 'value',
				optional: null,
				alsoOptional: null,
			}),
		).toBe(true);

		expect(
			Value.Check(schema, {
				id: '123',
				required: 'value',
				optional: 'has value',
				alsoOptional: 42,
			}),
		).toBe(true);
	});

	test('validates complex schema with all field types', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			content: richtext(),
			views: integer(),
			rating: real({ nullable: true }),
			published: boolean(),
			publishedAt: date({ nullable: true }),
			status: select({ options: ['draft', 'published'] }),
			tags: tags({ options: ['tech', 'news'] }),
			metadata: json({ schema: type({ author: 'string' }) }),
		});

		expect(
			Value.Check(schema, {
				id: 'post-123',
				title: 'Hello World',
				content: null,
				views: 100,
				rating: 4.5,
				published: true,
				publishedAt: '2024-01-01T12:00:00.000Z|UTC',
				status: 'published',
				tags: ['tech'],
				metadata: { author: 'John' },
			}),
		).toBe(true);

		expect(
			Value.Check(schema, {
				id: 'post-123',
				title: 'Hello World',
				content: null,
				views: 100,
				rating: null,
				published: false,
				publishedAt: null,
				status: 'draft',
				tags: [],
				metadata: { author: 'Jane' },
			}),
		).toBe(true);
	});

	test('rejects row with wrong field types', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			count: integer(),
		});

		expect(
			Value.Check(schema, {
				id: 123,
				title: 'Test',
				count: 42,
			}),
		).toBe(false);

		expect(
			Value.Check(schema, {
				id: '123',
				title: 'Test',
				count: '42',
			}),
		).toBe(false);
	});
});

describe('JSON Schema pass-through for json fields', () => {
	test('json field produces valid JSON Schema that TypeBox can compile', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			settings: json({
				schema: type({ theme: '"light" | "dark"', fontSize: 'number' }),
			}),
		});

		const validator = Compile(schema);
		expect(
			validator.Check({ id: '1', settings: { theme: 'dark', fontSize: 14 } }),
		).toBe(true);
		expect(
			validator.Check({ id: '1', settings: { theme: 'light', fontSize: 16 } }),
		).toBe(true);
	});

	test('json field validation errors include path information', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			config: json({ schema: type({ name: 'string', count: 'number' }) }),
		});

		const validator = Compile(schema);
		const errors = [
			...validator.Errors({ id: '1', config: { name: 123, count: 'invalid' } }),
		];

		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some((e) => e.instancePath.includes('config'))).toBe(true);
	});

	test('array composition works with JSON Schema via manual construction', () => {
		const rowSchema = tableSchemaToTypebox({
			id: id(),
			data: json({ schema: type({ value: 'number' }) }),
		});

		const arraySchema = { type: 'array', items: rowSchema };
		const validator = Compile(arraySchema);

		expect(
			validator.Check([
				{ id: '1', data: { value: 10 } },
				{ id: '2', data: { value: 20 } },
			]),
		).toBe(true);

		expect(validator.Check([{ id: '1', data: { value: 'invalid' } }])).toBe(
			false,
		);
	});

	test('nested json schema validates correctly', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			nested: json({
				schema: type({
					user: { name: 'string', email: 'string' },
					preferences: { notifications: 'boolean' },
				}),
			}),
		});

		const validator = Compile(schema);

		expect(
			validator.Check({
				id: '1',
				nested: {
					user: { name: 'John', email: 'john@example.com' },
					preferences: { notifications: true },
				},
			}),
		).toBe(true);

		expect(
			validator.Check({
				id: '1',
				nested: {
					user: { name: 'John' },
					preferences: { notifications: true },
				},
			}),
		).toBe(false);
	});
});

describe('Compile (JIT validation)', () => {
	test('compiled validator produces same results as Value.Check', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			count: integer(),
		});

		const validator = Compile(schema);
		const validData = { id: '123', title: 'Test', count: 42 };
		const invalidData = { id: '123', title: 'Test', count: 'not a number' };

		expect(validator.Check(validData)).toBe(Value.Check(schema, validData));
		expect(validator.Check(invalidData)).toBe(Value.Check(schema, invalidData));
	});

	test('compiled validator validates complex schema', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			title: text(),
			status: select({ options: ['draft', 'published'] }),
			tags: tags({ options: ['tech', 'news'] }),
			metadata: json({ schema: type({ author: 'string' }) }),
		});

		const validator = Compile(schema);

		expect(
			validator.Check({
				id: 'post-1',
				title: 'Hello',
				status: 'draft',
				tags: ['tech'],
				metadata: { author: 'John' },
			}),
		).toBe(true);

		expect(
			validator.Check({
				id: 'post-1',
				title: 'Hello',
				status: 'invalid',
				tags: ['tech'],
				metadata: { author: 'John' },
			}),
		).toBe(false);
	});

	test('compiled validator handles nullable fields', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			name: text({ nullable: true }),
			count: integer({ nullable: true }),
		});

		const validator = Compile(schema);

		expect(validator.Check({ id: '1', name: null, count: null })).toBe(true);
		expect(validator.Check({ id: '1', name: 'Test', count: 42 })).toBe(true);
	});

	test('compiled validator can report errors', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			count: integer(),
		});

		const validator = Compile(schema);
		const errors = [...validator.Errors({ id: '123', count: 'invalid' })];

		expect(errors.length).toBeGreaterThan(0);
		expect(errors.at(0)?.message).toBeDefined();
	});

	test('compiled validator is reusable', () => {
		const schema = tableSchemaToTypebox({
			id: id(),
			value: integer(),
		});

		const validator = Compile(schema);

		for (let i = 0; i < 100; i++) {
			expect(validator.Check({ id: `item-${i}`, value: i })).toBe(true);
		}
	});
});
