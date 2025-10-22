#!/usr/bin/env bun
import { hideBin } from 'yargs/helpers';
import { generateCLI } from '../../packages/epicenter/src/cli/index.ts';
import config from './epicenter.config';

// Generate and run CLI
const cli = generateCLI({ config, argv: hideBin(process.argv) });

await cli.parse();
