#!/usr/bin/env bun
import { hideBin } from 'yargs/helpers';
import { createCLI } from '../../src/cli/index.ts';
import config from './epicenter.config';

// Create and run CLI
const cli = createCLI({ config, argv: hideBin(process.argv) });

await cli.parse();
