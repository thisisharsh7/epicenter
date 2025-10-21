#!/usr/bin/env bun
import { generateCLI } from '../../packages/epicenter/src/cli/index.ts';
import config from './epicenter.config';

// Generate and run CLI
const cli = generateCLI(config);

await cli.parse();
