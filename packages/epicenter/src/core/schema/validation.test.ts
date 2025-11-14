import { type } from 'arktype';
import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
	createTableValidators,
	id,
	integer,
	json,
	select,
	tags,
	text,
	ytext
} from './index';

describe('createTableValidators', () => {
	describe('validateUnknown()', () => {
		test('validates valid data', () => {
			const validators = createTableValidators({
				id: id(),
				title: text(),
			});

			const result = validators.validateUnknown({
				id: '123',
				title: 'Hello World',
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row).toEqual({ id: '123', title: 'Hello World' });
			}
		});

		test('validates ytext strings', () => {
			const validators = createTableValidators({
				id: id(),
				content: ytext(),
			});

			const result = validators.validateUnknown({
				id: '123',
				content: 'Hello World',
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(typeof result.row.content).toBe('string');
				expect(result.row.content).toBe('Hello World');
			}
		});

		test('validates multi-select arrays', () => {
			const validators = createTableValidators({
				id: id(),
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			const result = validators.validateUnknown({
				id: '123',
				tags: ['typescript', 'javascript'],
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(Array.isArray(result.row.tags)).toBe(true);
				expect(result.row.tags).toEqual(['typescript', 'javascript']);
			}
		});

		test('returns invalid for wrong types', () => {
			const validators = createTableValidators({
				id: id(),
				count: integer(),
			});

			const result = validators.validateUnknown({
				id: '123',
				count: 'not a number',
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('count');
			}
		});

		test('validates select options', () => {
			const validators = createTableValidators({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = validators.validateUnknown({
				id: '123',
				status: 'draft',
			});

			expect(result.status).toBe('valid');
		});

		test('returns invalid for invalid select option', () => {
			const validators = createTableValidators({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = validators.validateUnknown({
				id: '123',
				status: 'invalid',
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates nullable fields', () => {
			const validators = createTableValidators({
				id: id(),
				optional: text({ nullable: true }),
			});

			const result = validators.validateUnknown({
				id: '123',
				optional: null,
			});

			expect(result.status).toBe('valid');
		});

		test('returns invalid for missing required fields', () => {
			const validators = createTableValidators({
				id: id(),
				title: text(),
			});

			const result = validators.validateUnknown({
				id: '123',
				// Missing title
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('missing-required-field');
				expect(result.reason.field).toBe('title');
			}
		});

		test('validates multi-select options in array', () => {
			const validators = createTableValidators({
				id: id(),
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			const result = validators.validateUnknown({
				id: '123',
				tags: ['invalid-tag'],
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates JSON with valid data', () => {
			const configSchema = type({
				theme: 'string',
				autoSave: 'boolean',
			});

			const validators = createTableValidators({
				id: id(),
				config: json({ schema: configSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				config: {
					theme: 'dark',
					autoSave: true,
				},
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.config).toEqual({
					theme: 'dark',
					autoSave: true,
				});
			}
		});

		test('returns invalid for JSON with invalid data', () => {
			const configSchema = type({
				theme: 'string',
				autoSave: 'boolean',
			});

			const validators = createTableValidators({
				id: id(),
				config: json({ schema: configSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				config: {
					theme: 'dark',
					autoSave: 'not a boolean', // Invalid
				},
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('config');
			}
		});

		test('validates nullable JSON', () => {
			const metaSchema = type({
				version: 'string',
			});

			const validators = createTableValidators({
				id: id(),
				meta: json({ schema: metaSchema, nullable: true }),
			});

			const result = validators.validateUnknown({
				id: '123',
				meta: null,
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.meta).toBe(null);
			}
		});

		test('validates JSON with complex nested structures', () => {
			const productSchema = type({
				name: 'string',
				price: 'number',
				tags: 'string[]',
				metadata: {
					category: 'string',
					inStock: 'boolean',
				},
			});

			const validators = createTableValidators({
				id: id(),
				product: json({ schema: productSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				product: {
					name: 'Widget',
					price: 29.99,
					tags: ['electronics', 'gadgets'],
					metadata: {
						category: 'tech',
						inStock: true,
					},
				},
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.product).toEqual({
					name: 'Widget',
					price: 29.99,
					tags: ['electronics', 'gadgets'],
					metadata: {
						category: 'tech',
						inStock: true,
					},
				});
			}
		});

		test('returns invalid for non-serialized cell values', () => {
			const validators = createTableValidators({
				id: id(),
				count: integer(),
			});

			const result = validators.validateUnknown({
				id: '123',
				count: new Y.Text(), // Y.js types don't match integer schema
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('count');
			}
		});

		test('validates select options and returns schema-mismatch for invalid options', () => {
			const validators = createTableValidators({
				id: id(),
				status: select({ options: ['draft', 'published'] }),
			});

			const result = validators.validateUnknown({
				id: '123',
				status: 'invalid',
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('invalid-option');
			}
		});

		test('validates multi-select structure and options', () => {
			const validators = createTableValidators({
				id: id(),
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			});

			// Invalid structure (not an array)
			const result1 = validators.validateUnknown({
				id: '123',
				tags: new Y.Text(), // Y.js types don't match array schema
			});

			expect(result1.status).toBe('invalid');
			if (result1.status === 'invalid') {
				expect(result1.reason.type).toBe('type-mismatch');
				expect(result1.reason.field).toBe('tags');
			}

			// Invalid option (valid structure, bad value)
			const result2 = validators.validateUnknown({
				id: '123',
				tags: ['invalid-tag'],
			});

			expect(result2.status).toBe('invalid');
			if (result2.status === 'invalid') {
				expect(result2.reason.type).toBe('invalid-option');
			}
		});

		test('validates JSON with plain object', () => {
			const userSchema = type({
				username: 'string',
				role: 'string',
			});

			const validators = createTableValidators({
				id: id(),
				user: json({ schema: userSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				user: {
					username: 'john_doe',
					role: 'admin',
				},
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.user).toEqual({
					username: 'john_doe',
					role: 'admin',
				});
			}
		});

		test('returns invalid for JSON with Y.js types', () => {
			const dataSchema = type({
				content: 'string',
			});

			const validators = createTableValidators({
				id: id(),
				data: json({ schema: dataSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				data: new Y.Text(), // Y.js type doesn't match JSON schema
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('data');
			}
		});

		test('returns invalid for JSON with invalid data structure', () => {
			const settingsSchema = type({
				notifications: 'boolean',
				volume: 'number',
			});

			const validators = createTableValidators({
				id: id(),
				settings: json({ schema: settingsSchema }),
			});

			const result = validators.validateUnknown({
				id: '123',
				settings: {
					notifications: true,
					volume: 'loud', // Invalid: should be number
				},
			});

			expect(result.status).toBe('invalid');
			if (result.status === 'invalid') {
				expect(result.reason.type).toBe('type-mismatch');
				expect(result.reason.field).toBe('settings');
			}
		});

		test('validates nullable JSON with null value', () => {
			const preferencesSchema = type({
				language: 'string',
			});

			const validators = createTableValidators({
				id: id(),
				preferences: json({ schema: preferencesSchema, nullable: true }),
			});

			const result = validators.validateUnknown({
				id: '123',
				preferences: null,
			});

			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.preferences).toBe(null);
			}
		});
	});
});
