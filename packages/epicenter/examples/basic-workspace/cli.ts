#!/usr/bin/env bun
import { generateCLI } from '../../src/cli/index';
import config from './epicenter.config';

// Generate and run CLI
const cli = generateCLI(config);

await cli.parse();
