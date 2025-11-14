import { describe, expect, it } from 'vitest';
import { type } from 'arktype';
import { tableSchemaToArktypeType } from './arktype';
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
} from '../../schema';

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
