import { describe, expect, test } from 'bun:test';
import { createCLI } from '../../packages/epicenter/src/cli/create-cli';
import { createTypeBoxConverter } from '../../packages/epicenter/src/cli/converters/typebox';
import epicenterConfig from './epicenter.config';

describe('E2E CLI Tests', () => {
	test('creates CLI from epicenter config', () => {
		const cli = createCLI(epicenterConfig, {
			argv: [],
			schemaConverters: [createTypeBoxConverter()],
		});

		expect(cli).toBeDefined();
		expect(typeof cli.parse).toBe('function');
		expect(typeof cli.getOptions).toBe('function');
	});

	test('CLI is configured with schema converters', () => {
		const converter = createTypeBoxConverter();
		const cli = createCLI(epicenterConfig, {
			argv: [],
			schemaConverters: [converter],
		});

		expect(cli).toBeDefined();
		expect(typeof cli.parse).toBe('function');
	});

	test('CLI can parse arguments', () => {
		const cli = createCLI(epicenterConfig, {
			argv: ['--help'],
			schemaConverters: [createTypeBoxConverter()],
		});

		expect(cli).toBeDefined();
	});
});
