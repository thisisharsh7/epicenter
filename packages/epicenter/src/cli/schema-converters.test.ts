import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import yargs from 'yargs';
import { createSchemaConverter, applySchemaConverters } from './schema-converters';

describe('createSchemaConverter', () => {
	test('creates a converter with condition and convert functions', () => {
		const converter = createSchemaConverter({
			condition: (schema) => schema !== undefined,
			convert: (schema, yargs) => yargs,
		});

		expect(converter).toHaveProperty('condition');
		expect(converter).toHaveProperty('convert');
		expect(typeof converter.condition).toBe('function');
		expect(typeof converter.convert).toBe('function');
	});
});

describe('applySchemaConverters', () => {
	test('returns unmodified yargs when schema is undefined', () => {
		const yargsInstance = yargs();
		const result = applySchemaConverters(undefined, yargsInstance, []);
		expect(result).toBe(yargsInstance);
	});

	test('applies the first matching converter', () => {
		const schema = z.object({ name: z.string() }) as any;
		const yargsInstance = yargs();

		let converter1Called = false;
		let converter2Called = false;

		const converter1 = createSchemaConverter({
			condition: () => false,
			convert: (schema, yargs) => {
				converter1Called = true;
				return yargs;
			},
		});

		const converter2 = createSchemaConverter({
			condition: () => true,
			convert: (schema, yargs) => {
				converter2Called = true;
				return yargs;
			},
		});

		applySchemaConverters(schema, yargsInstance, [converter1, converter2]);

		expect(converter1Called).toBe(false);
		expect(converter2Called).toBe(true);
	});

	test('warns when no converter matches', () => {
		const schema = z.object({ name: z.string() }) as any;
		const yargsInstance = yargs();

		const converter = createSchemaConverter({
			condition: () => false,
			convert: (schema, yargs) => yargs,
		});

		// Should not throw, just warn
		const result = applySchemaConverters(schema, yargsInstance, [converter]);
		expect(result).toBe(yargsInstance);
	});
});
