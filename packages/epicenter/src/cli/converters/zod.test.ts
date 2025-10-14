import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import yargs from 'yargs';
import { createZodConverter } from './zod';

describe('createZodConverter', () => {
	const converter = createZodConverter();

	describe('condition', () => {
		test('returns true for Zod schemas', () => {
			const schema = z.object({ name: z.string() });
			expect(converter.condition(schema as any)).toBe(true);
		});

		test('returns false for undefined', () => {
			expect(converter.condition(undefined)).toBe(false);
		});

		test('returns false for non-Zod objects', () => {
			const notZod = { foo: 'bar' };
			expect(converter.condition(notZod as any)).toBe(false);
		});
	});

	describe('convert', () => {
		test('adds string options for string fields', () => {
			const schema = z.object({ name: z.string() });
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.string).toContain('name');
		});

		test('adds number options for number fields', () => {
			const schema = z.object({ age: z.number() });
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.number).toContain('age');
		});

		test('adds boolean options for boolean fields', () => {
			const schema = z.object({ active: z.boolean() });
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.boolean).toContain('active');
		});

		test('handles optional fields', () => {
			const schema = z.object({
				name: z.string(),
				nickname: z.string().optional()
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.string).toContain('name');
			expect(options.string).toContain('nickname');
		});

		test('handles default values', () => {
			const schema = z.object({
				count: z.number().default(10)
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const parsed = yargsInstance.parse([]);
			expect(parsed.count).toBe(10);
		});

		test('handles enums', () => {
			const schema = z.object({
				status: z.enum(['active', 'inactive', 'pending'])
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.string).toContain('status');
		});

		test('handles arrays', () => {
			const schema = z.object({
				tags: z.array(z.string())
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.array).toContain('tags');
		});

		test('handles multiple fields', () => {
			const schema = z.object({
				name: z.string(),
				age: z.number(),
				active: z.boolean(),
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			const options = yargsInstance.getOptions();
			expect(options.string).toContain('name');
			expect(options.number).toContain('age');
			expect(options.boolean).toContain('active');
		});

		test('handles descriptions', () => {
			const schema = z.object({
				name: z.string().describe('The user name'),
			});
			const yargsInstance = yargs([]);

			converter.convert(schema as any, yargsInstance);

			// Just verify the option was added - don't parse help as it causes process.exit
			const options = yargsInstance.getOptions();
			expect(options.string).toContain('name');
		});
	});
});
