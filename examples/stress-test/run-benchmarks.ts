#!/usr/bin/env bun

/**
 * Benchmark Runner
 *
 * Run all benchmarks or select specific ones.
 *
 * @example
 * ```bash
 * # Run all benchmarks
 * bun run run-benchmarks.ts
 *
 * # Run specific benchmarks (by number or name)
 * bun run run-benchmarks.ts 1 3 5
 * bun run run-benchmarks.ts bulk update mixed
 *
 * # List available benchmarks
 * bun run run-benchmarks.ts --list
 * ```
 */

import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'bun';

const BENCHMARKS = [
	{
		id: 1,
		name: 'bulk',
		file: 'stress-test.ts',
		description: 'Bulk Upsert - Maximum upsertMany throughput',
	},
	{
		id: 2,
		name: 'write-delete-write',
		file: 'stress-test-write-delete-write.ts',
		description: 'Write-Delete-Write - Tombstone overhead',
	},
	{
		id: 3,
		name: 'update',
		file: 'stress-test-update-heavy.ts',
		description: 'Update-Heavy - Repeated updates performance',
	},
	{
		id: 4,
		name: 'read',
		file: 'stress-test-read-at-scale.ts',
		description: 'Read-at-Scale - Query scaling',
	},
	{
		id: 5,
		name: 'mixed',
		file: 'stress-test-mixed-workload.ts',
		description: 'Mixed Workload - Realistic interleaved ops',
	},
];

function printHelp() {
	console.log('YJS Benchmark Runner');
	console.log('====================');
	console.log('');
	console.log('Usage:');
	console.log('  bun run run-benchmarks.ts [options] [benchmarks...]');
	console.log('');
	console.log('Options:');
	console.log('  --list, -l     List available benchmarks');
	console.log('  --help, -h     Show this help');
	console.log('  --clean        Remove .epicenter folder before running');
	console.log('');
	console.log('Benchmarks can be specified by:');
	console.log('  - Number: 1, 2, 3, 4, 5');
	console.log('  - Name: bulk, write-delete-write, update, read, mixed');
	console.log('');
	console.log('Examples:');
	console.log('  bun run run-benchmarks.ts              # Run all');
	console.log(
		'  bun run run-benchmarks.ts 1 3          # Run benchmarks 1 and 3',
	);
	console.log('  bun run run-benchmarks.ts bulk mixed   # Run by name');
	console.log(
		'  bun run run-benchmarks.ts --clean 1    # Clean and run benchmark 1',
	);
}

function listBenchmarks() {
	console.log('Available Benchmarks:');
	console.log('=====================');
	console.log('');
	for (const b of BENCHMARKS) {
		console.log(`  ${b.id}. [${b.name}] ${b.description}`);
		console.log(`     File: ${b.file}`);
		console.log('');
	}
}

async function runBenchmark(benchmark: (typeof BENCHMARKS)[number]) {
	console.log('');
	console.log('█'.repeat(60));
	console.log(`█ Running: ${benchmark.description}`);
	console.log(`█ File: ${benchmark.file}`);
	console.log('█'.repeat(60));
	console.log('');

	const proc = spawn({
		cmd: ['bun', 'run', benchmark.file],
		cwd: import.meta.dir,
		stdout: 'inherit',
		stderr: 'inherit',
	});

	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		console.log(
			`\n⚠️  Benchmark ${benchmark.name} exited with code ${exitCode}`,
		);
	}

	return exitCode;
}

// Parse arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	printHelp();
	process.exit(0);
}

if (args.includes('--list') || args.includes('-l')) {
	listBenchmarks();
	process.exit(0);
}

const shouldClean = args.includes('--clean');
const benchmarkArgs = args.filter((a) => !a.startsWith('--'));

// Determine which benchmarks to run
let benchmarksToRun: typeof BENCHMARKS;

if (benchmarkArgs.length === 0) {
	benchmarksToRun = BENCHMARKS;
} else {
	benchmarksToRun = [];
	for (const arg of benchmarkArgs) {
		// Try as number
		const num = parseInt(arg, 10);
		if (!isNaN(num)) {
			const found = BENCHMARKS.find((b) => b.id === num);
			if (found) {
				benchmarksToRun.push(found);
				continue;
			}
		}

		// Try as name (partial match)
		const found = BENCHMARKS.find(
			(b) =>
				b.name.includes(arg.toLowerCase()) ||
				b.file.includes(arg.toLowerCase()),
		);
		if (found) {
			benchmarksToRun.push(found);
		} else {
			console.error(`Unknown benchmark: ${arg}`);
			console.error('Use --list to see available benchmarks');
			process.exit(1);
		}
	}
}

// Clean if requested
if (shouldClean) {
	const epicenterPath = './.epicenter';
	if (existsSync(epicenterPath)) {
		console.log('Cleaning .epicenter folder...');
		rmSync(epicenterPath, { recursive: true });
	}
}

// Run benchmarks
console.log('='.repeat(60));
console.log('YJS Benchmark Suite');
console.log('='.repeat(60));
console.log(`Running ${benchmarksToRun.length} benchmark(s):`);
for (const b of benchmarksToRun) {
	console.log(`  ${b.id}. ${b.description}`);
}
console.log('='.repeat(60));

const startTime = performance.now();
const results: { benchmark: string; exitCode: number }[] = [];

for (const benchmark of benchmarksToRun) {
	const exitCode = await runBenchmark(benchmark);
	results.push({ benchmark: benchmark.name, exitCode });

	// Small delay between benchmarks to let things settle
	if (benchmarksToRun.indexOf(benchmark) < benchmarksToRun.length - 1) {
		console.log('\nWaiting 3 seconds before next benchmark...\n');
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
}

const totalTime = performance.now() - startTime;

// Summary
console.log('');
console.log('█'.repeat(60));
console.log('█ BENCHMARK SUITE COMPLETE');
console.log('█'.repeat(60));
console.log('');
console.log(`Total time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
console.log('');
console.log('Results:');
for (const r of results) {
	const status = r.exitCode === 0 ? '✓' : '✗';
	console.log(`  ${status} ${r.benchmark}`);
}

const failed = results.filter((r) => r.exitCode !== 0);
if (failed.length > 0) {
	console.log(`\n${failed.length} benchmark(s) failed`);
	process.exit(1);
}

console.log('\nAll benchmarks completed successfully!');
