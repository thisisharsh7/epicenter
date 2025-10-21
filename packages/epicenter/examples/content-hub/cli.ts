#!/usr/bin/env bun
import { generateCLI } from '../../src/cli/index';
import { defineEpicenter } from '../../src/index';
import { pages } from './epicenter.config';

// Note: Only using pages workspace because content-hub has Zod schemas
// that need to be converted to TypeBox
const config = defineEpicenter({
	id: 'content-hub-cli',
	workspaces: [pages],
});

const cli = generateCLI(config);
await cli.parse();
