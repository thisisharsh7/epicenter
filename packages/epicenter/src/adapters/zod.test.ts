import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from './zod';
import { id, text, integer, boolean, select, multiSelect, date } from '../core/schema';

describe('Zod Adapter', () => {
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

			// Should not have id field in schema shape
			const result = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});

			// Schema should be valid without id
			expect(result.success).toBe(true);

			// Verify id is not in the schema shape
			expect('id' in schema.shape).toBe(false);
		});

		test('should validate required fields', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid data
			const valid = schema.safeParse({
				title: 'Test Post',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(valid.success).toBe(true);

			// Missing required field
			const invalid = schema.safeParse({
				title: 'Test Post',
				category: 'tech',
				// missing: published
			});
			expect(invalid.success).toBe(false);
		});

		test('should handle nullable fields', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Null value for nullable field
			const result = schema.safeParse({
				title: 'Test',
				content: null,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(result.success).toBe(true);
		});

		test('should make fields with defaults optional', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Omit field with default (viewCount)
			const result = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
				// viewCount omitted (has default)
			});
			expect(result.success).toBe(true);
		});

		test('should validate select options', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid option
			const valid = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(valid.success).toBe(true);

			// Invalid option
			const invalid = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'invalid',
				tags: ['typescript'],
			});
			expect(invalid.success).toBe(false);
		});

		test('should validate multi-select options', () => {
			const schema = createInsertSchema(testSchema.posts);

			// Valid options
			const valid = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript', 'javascript'],
			});
			expect(valid.success).toBe(true);

			// Invalid option in array
			const invalid = schema.safeParse({
				title: 'Test',
				published: true,
				category: 'tech',
				tags: ['typescript', 'rust'],
			});
			expect(invalid.success).toBe(false);
		});

		test('should compose with Zod refinements', () => {
			const schema = createInsertSchema(testSchema.posts).extend({
				title: z.string().min(3).max(100),
			});

			// Too short
			const tooShort = schema.safeParse({
				title: 'ab',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(tooShort.success).toBe(false);

			// Valid length
			const valid = schema.safeParse({
				title: 'Valid Title',
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(valid.success).toBe(true);
		});
	});

	describe('createSelectSchema', () => {
		test('should include id field', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Valid with id
			const result = schema.safeParse({
				id: '123',
				title: 'Test',
				content: null,
				viewCount: 0,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(result.success).toBe(true);
		});

		test('should require all non-nullable fields', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Missing required field
			const result = schema.safeParse({
				id: '123',
				title: 'Test',
				// missing: published
			});
			expect(result.success).toBe(false);
		});

		test('should handle nullable fields', () => {
			const schema = createSelectSchema(testSchema.posts);

			// Null value for nullable field
			const result = schema.safeParse({
				id: '123',
				title: 'Test',
				content: null,
				viewCount: 0,
				published: true,
				category: 'tech',
				tags: ['typescript'],
			});
			expect(result.success).toBe(true);
		});
	});

	describe('createUpdateSchema', () => {
		test('should require id field', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Valid with id
			const valid = schema.safeParse({
				id: '123',
				title: 'Updated Title',
			});
			expect(valid.success).toBe(true);

			// Missing id
			const invalid = schema.safeParse({
				title: 'Updated Title',
			});
			expect(invalid.success).toBe(false);
		});

		test('should make all non-id fields optional', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Only id and one field
			const result = schema.safeParse({
				id: '123',
				title: 'Updated Title',
			});
			expect(result.success).toBe(true);
		});

		test('should allow partial updates', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Update only specific fields
			const result = schema.safeParse({
				id: '123',
				viewCount: 100,
				published: true,
			});
			expect(result.success).toBe(true);
		});

		test('should handle nullable fields in updates', () => {
			const schema = createUpdateSchema(testSchema.posts);

			// Set nullable field to null
			const result = schema.safeParse({
				id: '123',
				content: null,
			});
			expect(result.success).toBe(true);
		});
	});

	describe('Date fields', () => {
		const dateSchema = {
			events: {
				id: id(),
				name: text(),
				startDate: date(),
				endDate: date({ nullable: true }),
			},
		};

		test('should validate date objects', () => {
			const schema = createInsertSchema(dateSchema.events);

			const result = schema.safeParse({
				name: 'Conference',
				startDate: {
					date: new Date('2024-01-01'),
					timezone: 'America/New_York',
				},
			});
			expect(result.success).toBe(true);
		});

		test('should reject invalid date format', () => {
			const schema = createInsertSchema(dateSchema.events);

			const result = schema.safeParse({
				name: 'Conference',
				startDate: '2024-01-01', // Wrong format
			});
			expect(result.success).toBe(false);
		});
	});
});
