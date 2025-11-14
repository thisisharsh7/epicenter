import { describe, expect, it } from 'vitest';
import { type } from 'arktype';
import {
	columnSchemaToArktypeType,
	tableSchemaToArktypeFields,
	tableSchemaToArktypeType,
} from './arktype';
import {
	id,
	text,
	ytext,
	integer,
	real,
	boolean,
	date,
	select,
	tags,
	json,
	DateWithTimezone,
} from '../../schema';

describe('columnSchemaToArktypeType', () => {
	it('converts id column to string type', () => {
		const result = columnSchemaToArktypeType(id());
		expect(result).toBeDefined();

		// Test validation
		const valid = result('test-id');
		expect(valid).not.toBeInstanceOf(type.errors);

		const invalid = result(123);
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts text column to string type', () => {
		const result = columnSchemaToArktypeType(text());
		expect(result).toBeDefined();

		const valid = result('hello');
		expect(valid).not.toBeInstanceOf(type.errors);
	});

	it('converts nullable text column to string | null', () => {
		const result = columnSchemaToArktypeType(text({ nullable: true }));
		expect(result).toBeDefined();

		const validString = result('hello');
		expect(validString).not.toBeInstanceOf(type.errors);

		const validNull = result(null);
		expect(validNull).not.toBeInstanceOf(type.errors);
	});

	it('converts integer column to integer type', () => {
		const result = columnSchemaToArktypeType(integer());
		expect(result).toBeDefined();

		const valid = result(42);
		expect(valid).not.toBeInstanceOf(type.errors);

		// Should reject floats
		const invalid = result(42.5);
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts real column to number type', () => {
		const result = columnSchemaToArktypeType(real());
		expect(result).toBeDefined();

		const validInt = result(42);
		expect(validInt).not.toBeInstanceOf(type.errors);

		const validFloat = result(42.5);
		expect(validFloat).not.toBeInstanceOf(type.errors);
	});

	it('converts boolean column to boolean type', () => {
		const result = columnSchemaToArktypeType(boolean());
		expect(result).toBeDefined();

		const validTrue = result(true);
		expect(validTrue).not.toBeInstanceOf(type.errors);

		const validFalse = result(false);
		expect(validFalse).not.toBeInstanceOf(type.errors);

		const invalid = result('true');
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts date column to DateWithTimezoneString type', () => {
		const result = columnSchemaToArktypeType(date());
		expect(result).toBeDefined();

		const valid = result('2024-01-01T20:00:00.000Z|America/New_York');
		expect(valid).not.toBeInstanceOf(type.errors);

		const invalid = result('2024-01-01');
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts select column to enum type', () => {
		const result = columnSchemaToArktypeType(
			select({ options: ['draft', 'published', 'archived'] }),
		);
		expect(result).toBeDefined();

		const valid = result('draft');
		expect(valid).not.toBeInstanceOf(type.errors);

		const invalid = result('invalid');
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts tags column with options to enum array', () => {
		const result = columnSchemaToArktypeType(
			tags({ options: ['urgent', 'normal', 'low'] }),
		);
		expect(result).toBeDefined();

		const valid = result(['urgent', 'low']);
		expect(valid).not.toBeInstanceOf(type.errors);

		const invalid = result(['urgent', 'invalid']);
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts tags column without options to string array', () => {
		const result = columnSchemaToArktypeType(tags());
		expect(result).toBeDefined();

		const valid = result(['any', 'tags', 'work']);
		expect(valid).not.toBeInstanceOf(type.errors);

		const invalid = result([1, 2, 3]);
		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('converts json column to unknown type', () => {
		const jsonSchema = type({ key: 'string', value: 'number' });
		const result = columnSchemaToArktypeType(
			json({ schema: jsonSchema }),
		);
		expect(result).toBeDefined();

		// Should accept any value (validation happens in validateYRow)
		const anyValue = result({ anything: 'goes' });
		expect(anyValue).not.toBeInstanceOf(type.errors);
	});
});

describe('tableSchemaToArktypeFields', () => {
	it('converts simple table schema to fields', () => {
		const schema = {
			id: id(),
			title: text(),
			count: integer(),
		};

		const fields = tableSchemaToArktypeFields(schema);

		expect(fields).toBeDefined();
		expect(fields.id).toBeDefined();
		expect(fields.title).toBeDefined();
		expect(fields.count).toBeDefined();
	});

	it('handles nullable fields correctly', () => {
		const schema = {
			id: id(),
			title: text({ nullable: true }),
			count: integer({ nullable: true }),
		};

		const fields = tableSchemaToArktypeFields(schema);

		// Test nullable title
		const titleValid = fields.title(null);
		expect(titleValid).not.toBeInstanceOf(type.errors);

		// Test nullable count
		const countValid = fields.count(null);
		expect(countValid).not.toBeInstanceOf(type.errors);
	});

	it('preserves all column types', () => {
		const schema = {
			id: id(),
			title: text(),
			content: ytext(),
			views: integer(),
			rating: real(),
			published: boolean(),
			createdAt: date(),
			status: select({ options: ['draft', 'published'] as const }),
			tags: tags({ options: ['tech', 'personal'] as const }),
			metadata: json({ schema: type({ key: 'string' }) }),
		};

		const fields = tableSchemaToArktypeFields(schema);

		expect(Object.keys(fields)).toHaveLength(10);
		expect(fields.id).toBeDefined();
		expect(fields.title).toBeDefined();
		expect(fields.content).toBeDefined();
		expect(fields.views).toBeDefined();
		expect(fields.rating).toBeDefined();
		expect(fields.published).toBeDefined();
		expect(fields.createdAt).toBeDefined();
		expect(fields.status).toBeDefined();
		expect(fields.tags).toBeDefined();
		expect(fields.metadata).toBeDefined();
	});
});

describe('tableSchemaToArktypeType', () => {
	it('returns a complete arktype Type instance', () => {
		const schema = {
			id: id(),
			title: text(),
			count: integer(),
		};

		const validator = tableSchemaToArktypeType(schema);

		expect(validator).toBeDefined();
		expect(typeof validator).toBe('function');
	});

	it('validates complete objects correctly', () => {
		const schema = {
			id: id(),
			title: text(),
			count: integer(),
		};

		const validator = tableSchemaToArktypeType(schema);

		const valid = validator({
			id: 'test-123',
			title: 'Hello',
			count: 42,
		});

		expect(valid).not.toBeInstanceOf(type.errors);
	});

	it('rejects invalid objects', () => {
		const schema = {
			id: id(),
			title: text(),
			count: integer(),
		};

		const validator = tableSchemaToArktypeType(schema);

		const invalid = validator({
			id: 'test-123',
			title: 'Hello',
			count: 'not a number',
		});

		expect(invalid).toBeInstanceOf(type.errors);
	});

	it('supports .partial() composition', () => {
		const schema = {
			id: id(),
			title: text(),
			count: integer(),
		};

		const validator = tableSchemaToArktypeType(schema);
		const partialValidator = validator.partial().merge({ id: type.string });

		// Should allow partial objects
		const valid = partialValidator({
			id: 'test-123',
			title: 'Hello',
			// count is omitted
		});

		expect(valid).not.toBeInstanceOf(type.errors);
	});

	it('supports .array() composition', () => {
		const schema = {
			id: id(),
			title: text(),
		};

		const validator = tableSchemaToArktypeType(schema);
		const arrayValidator = validator.array();

		const valid = arrayValidator([
			{ id: '1', title: 'First' },
			{ id: '2', title: 'Second' },
		]);

		expect(valid).not.toBeInstanceOf(type.errors);
	});

	it('supports .merge() composition', () => {
		const schema = {
			id: id(),
			title: text(),
		};

		const validator = tableSchemaToArktypeType(schema);
		const merged = validator.merge({ extra: type.boolean });

		const valid = merged({
			id: '123',
			title: 'Test',
			extra: true,
		});

		expect(valid).not.toBeInstanceOf(type.errors);
	});

	it('handles complex nested schema', () => {
		const schema = {
			id: id(),
			title: text(),
			metadata: json({
				schema: type({
					author: 'string',
					tags: type.string.array(),
				}),
			}),
			status: select({ options: ['draft', 'published'] as const }),
		};

		const validator = tableSchemaToArktypeType(schema);

		const valid = validator({
			id: 'post-123',
			title: 'My Post',
			metadata: { arbitrary: 'data' }, // JSON is unknown, so anything goes
			status: 'draft',
		});

		expect(valid).not.toBeInstanceOf(type.errors);
	});
});
