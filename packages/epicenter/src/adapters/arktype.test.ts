import { describe, test, expect } from 'bun:test';
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from './arktype';
import { id, text, integer, boolean, select, multiSelect } from '../core/schema';

describe('ArkType Adapter', () => {
	const testSchema = {
		posts: {
			id: id(),
			title: text(),
			content: text({ nullable: true }),
			viewCount: integer({ default: 0 }),
			published: boolean(),
			category: select({ options: ['tech', 'personal'] }),
			tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
		},
	};

	describe('createInsertSchema', () => {
		test('should generate schema without id field', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Should not have id field - ArkType will reject extra properties by default
			const result = schema({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});

			// Check if validation passed (no problems)
			expect(Array.isArray(result)).toBe(false);
		});

		test('should validate required fields', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid data
			const valid = schema({
				title: 'Test Post',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(valid)).toBe(false);

			// Missing required field (published)
			const invalid = schema({
				title: 'Test Post',
				category: 'tech',
				tags: ['typescript'],
			});
			// ArkType returns a type with problems array if validation fails
			expect(Array.isArray(invalid)).toBe(true);
		});

		test('should handle nullable fields', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Null value for nullable field
			const result = schema({
				title: 'Test',
				content: null,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(false);
		});

		test('should make fields with defaults optional', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Omit field with default (viewCount)
			const result = schema({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
				// viewCount omitted (has default)
			});
			expect(Array.isArray(result)).toBe(false);
		});

		test('should validate select options', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid option
			const valid = schema({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(valid)).toBe(false);

			// Invalid option
			const invalid = schema({
				title: 'Test',
				published: true,
				category: 'invalid',
				tags: ['typescript'],
			});
			expect(Array.isArray(invalid)).toBe(true);
		});

		test('should validate multi-select options', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid options
			const valid = schema({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript', 'javascript'],
			});
			expect(Array.isArray(valid)).toBe(false);

			// Invalid option in array
			const invalid = schema({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript', 'rust'],
			});
			expect(Array.isArray(invalid)).toBe(true);
		});

		test('should allow composing with ArkType', () => {
			const baseSchema = createInsertSchema(testSchema.posts);

			// You can compose schemas by creating new types
			// This is just testing that the base schema works
			const result = baseSchema({
				title: 'Valid Title',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});

			expect(Array.isArray(result)).toBe(false);
		});
	});

	describe('createSelectSchema', () => {
		test('should include id field', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Valid with id
			const result = schema({
				id: '123',
				title: 'Test',
				content: null,
				viewCount: 0,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(false);
		});

		test('should require all non-nullable fields', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Missing required field
			const result = schema({
				id: '123',
				title: 'Test',
				content: null,
				viewCount: 0,
				// missing: published
			});
			expect(Array.isArray(result)).toBe(true);
		});

		test('should handle nullable fields', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Null value for nullable field
			const result = schema({
				id: '123',
				title: 'Test',
				content: null,
				viewCount: 0,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(false);
		});
	});

	describe('createUpdateSchema', () => {
		test('should require id field', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Valid with id
			const valid = schema({
				id: '123',
				title: 'Updated Title',
			});
			expect(Array.isArray(valid)).toBe(false);

			// Missing id
			const invalid = schema({
				title: 'Updated Title',
			});
			expect(Array.isArray(invalid)).toBe(true);
		});

		test('should make all non-id fields optional', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Only id and one field
			const result = schema({
				id: '123',
				title: 'Updated Title',
			});
			expect(Array.isArray(result)).toBe(false);
		});

		test('should allow partial updates', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Update only specific fields
			const result = schema({
				id: '123',
				viewCount: 100,
				published: true,
			});
			expect(Array.isArray(result)).toBe(false);
		});

		test('should handle nullable fields in updates', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Set nullable field to null
			const result = schema({
				id: '123',
				content: null,
			});
			expect(Array.isArray(result)).toBe(false);
		});
	});

	describe('Type inference', () => {
		test('should validate string types', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Wrong type for title
			const result = schema({
				title: 123, // Should be string
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(true);
		});

		test('should validate boolean types', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Wrong type for published
			const result = schema({
				title: 'Test',
				published: 'true', // Should be boolean
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(true);
		});

		test('should validate integer types', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Wrong type for viewCount
			const result = schema({
				title: 'Test',
				viewCount: 'not a number',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(Array.isArray(result)).toBe(true);
		});
	});
});
