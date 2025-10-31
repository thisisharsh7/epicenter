import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
	boolean,
	createTableSchemaWithValidation,
	date,
	DateWithTimezone,
	generateId,
	id,
	integer,
	multiSelect,
	real,
	select,
	text,
	ytext,
} from './schema';

describe('createTableSchemaWithValidation', () => {
	describe('validateYRow()', () => {
		test('validates valid YRow', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('title', 'Hello World');

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.id).toBe('123');
				expect(result.row.title).toBe('Hello World');
			}
		});

		test('validates Y.Text types correctly', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				content: ytext(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			const ytextField = new Y.Text();
			ytextField.insert(0, 'Hello World');
			yrow.set('content', ytextField);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.content).toBeInstanceOf(Y.Text);
				expect(result.row.content.toString()).toBe('Hello World');
			}
		});

		test('returns schema-mismatch for wrong Y.js types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				content: ytext(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('content', 'not a Y.Text'); // Invalid

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('content');
			}
		});

		test('validates select options', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('status', 'draft');

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.status).toBe('draft');
			}
		});

		test('returns schema-mismatch for invalid select option', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('status', 'invalid');

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates multi-select with Y.Array', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			const yarray = new Y.Array();
			yarray.push(['typescript', 'javascript']);
			yrow.set('tags', yarray);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.tags).toBeInstanceOf(Y.Array);
				expect(result.row.tags.toArray()).toEqual(['typescript', 'javascript']);
			}
		});

		test('validates nullable fields', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				optional: text({ nullable: true }),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('optional', null);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.optional).toBe(null);
			}
		});

		test('returns schema-mismatch for missing required fields', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			// Missing title

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('missing-required-field');
				expect(result.reason.field).toBe('title');
			}
		});

		test('validates integer types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				count: integer(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('count', 42);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.count).toBe(42);
			}
		});

		test('returns schema-mismatch for non-integer numbers', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				count: integer(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('count', 42.5);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('count');
			}
		});

		test('validates real (float) types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				price: real(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('price', 19.99);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.price).toBe(19.99);
			}
		});

		test('validates boolean types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				published: boolean(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('published', true);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.published).toBe(true);
			}
		});

		test('validates date types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				createdAt: date(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			const dateValue = DateWithTimezone({
				date: new Date('2024-01-01'),
				timezone: 'America/New_York',
			});
			yrow.set('createdAt', dateValue);

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.createdAt.date).toEqual(new Date('2024-01-01'));
				expect(result.row.createdAt.timezone).toBe('America/New_York');
			}
		});

		test('Row proxy has toJSON() method', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('title', 'Hello');

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				const json = result.row.toJSON();
				expect(json).toEqual({ id: '123', title: 'Hello' });
			}
		});

		test('Row proxy has $yRow property', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const ydoc = new Y.Doc();
			const yrow = ydoc.getMap('row');
			yrow.set('id', '123');
			yrow.set('title', 'Hello');

			const result = schema.validateYRow(yrow);

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.$yRow).toBe(yrow);
			}
		});
	});

	describe('validateSerializedRow()', () => {
		test('validates valid serialized data', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				title: 'Hello World',
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row).toEqual({ id: '123', title: 'Hello World' });
			}
		});

		test('converts ytext string to Y.Text', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				content: ytext(),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				content: 'Hello World',
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.content).toBeInstanceOf(Y.Text);
				expect(result.row.content.toString()).toBe('Hello World');
			}
		});

		test('converts multi-select array to Y.Array', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				tags: ['typescript', 'javascript'],
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.tags).toBeInstanceOf(Y.Array);
				expect(result.row.tags.toArray()).toEqual(['typescript', 'javascript']);
			}
		});

		test('returns schema-mismatch for wrong types', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				count: integer(),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				count: 'not a number',
			});

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('count');
			}
		});

		test('validates select options in serialized data', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				status: 'draft',
			});

			expect(result.status).toBe('valid');
		});

		test('returns schema-mismatch for invalid select option in serialized data', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				status: 'invalid',
			});

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates nullable fields in serialized data', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				optional: text({ nullable: true }),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				optional: null,
			});

			expect(result.status).toBe('valid');
		});

		test('returns schema-mismatch for missing required fields in serialized data', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				// Missing title
			});

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('missing-required-field');
				expect(result.reason.field).toBe('title');
			}
		});

		test('validates multi-select options in serialized array', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			});

			const result = schema.validateSerializedRow({
				id: '123',
				tags: ['invalid-tag'],
			});

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});
	});

	describe('validateUnknown()', () => {
		test('validates valid record', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
			});

			const result = schema.validateUnknown({
				id: '123',
				title: 'Hello World',
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.title).toBe('Hello World');
				expect(result.row.toJSON()).toEqual({ id: '123', title: 'Hello World' });
			}
		});

		test('returns invalid-structure for non-serialized cell values', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				count: integer(),
			});

			const result = schema.validateUnknown({
				id: '123',
				count: 'not a number',
			});

			expect(result.status).toBe('invalid-structure');
			if (result.status === 'invalid-structure') {
				expect(result.reason.type).toBe('invalid-cell-value');
				expect(result.reason.field).toBe('count');
			}
		});

		test('validates select options and returns schema-mismatch for invalid options', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = schema.validateUnknown({
				id: '123',
				status: 'invalid',
			});

			expect(result.status).toBe('schema-mismatch');
			if (result.status === 'schema-mismatch') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates multi-select structure and options', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			});

			// Invalid structure (not an array)
			const result1 = schema.validateUnknown({
				id: '123',
				tags: 'not-an-array',
			});

			expect(result1.status).toBe('invalid-structure');

			// Invalid option (valid structure, bad value)
			const result2 = schema.validateUnknown({
				id: '123',
				tags: ['invalid-tag'],
			});

			expect(result2.status).toBe('schema-mismatch');
			if (result2.status === 'schema-mismatch') {
				expect(result2.reason.type).toBe('invalid-option');
			}
		});
	});

	describe('schema field access', () => {
		test('can access schema fields directly', () => {
			const schema = createTableSchemaWithValidation({
				id: id(),
				title: text(),
				count: integer(),
			});

			expect(schema.id.type).toBe('id');
			expect(schema.title.type).toBe('text');
			expect(schema.count.type).toBe('integer');
		});
	});
});
