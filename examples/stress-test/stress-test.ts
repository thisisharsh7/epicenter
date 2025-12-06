/**
 * YJS Stress Test
 *
 * Tests bulk upsert performance and YJS file size with large datasets.
 *
 * ## Performance Note: upsertMany vs upsert
 *
 * This test uses `upsertMany` which is ~500x faster than individual `upsert` calls:
 *
 * - `upsert()`: ~34 items/second (each upsert triggers a separate YJS transaction)
 * - `upsertMany()`: ~20,000 items/second (batches all upserts into a single YJS transaction)
 *
 * The key difference is that `upsertMany` uses `$transact` internally, which wraps
 * all operations in a single YJS transaction. This dramatically reduces overhead from:
 * 1. YJS document updates (one update vs N updates)
 * 2. Observer notifications (one notification vs N notifications)
 * 3. Persistence writes (one write vs potentially N writes)
 *
 * When doing bulk operations, always prefer:
 * - `upsertMany({ rows: [...] })` over multiple `upsert()` calls
 * - `updateMany({ rows: [...] })` over multiple `update()` calls
 * - `$transact(() => { ... })` to batch arbitrary operations
 *
 * @example
 * ```bash
 * # Run with default 10k items per table (100k total)
 * bun run stress-test.ts
 *
 * # Custom count
 * bun run stress-test.ts 20000
 *
 * # Full stress test (100k per table = 1M total) - expect slowdown
 * bun run stress-test.ts 100000
 * ```
 */

import { existsSync, statSync } from 'node:fs';
import { createEpicenterClient, generateId } from '@epicenter/hq';
import epicenterConfig from './epicenter.config';

// Configuration - can override via CLI args
const ITEMS_PER_TABLE = Number(process.argv[2]) || 10_000; // Default 10k for balanced stress test
const BATCH_SIZE = 1_000; // Upsert in batches of 1k using upsertMany

const TABLES = [
	'items_a',
	'items_b',
	'items_c',
	'items_d',
	'items_e',
	'items_f',
	'items_g',
	'items_h',
	'items_i',
	'items_j',
] as const;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

function formatRate(count: number, ms: number): string {
	const rate = (count / ms) * 1000;
	if (rate >= 1000) return `${(rate / 1000).toFixed(1)}k/s`;
	return `${rate.toFixed(0)}/s`;
}

console.log('='.repeat(60));
console.log('YJS Stress Test (using upsertMany for bulk upserts)');
console.log('='.repeat(60));
console.log(`Items per table: ${ITEMS_PER_TABLE.toLocaleString()}`);
console.log(`Batch size: ${BATCH_SIZE.toLocaleString()}`);
console.log(`Total tables: ${TABLES.length}`);
console.log(
	`Total items: ${(ITEMS_PER_TABLE * TABLES.length).toLocaleString()}`,
);
console.log('='.repeat(60));
console.log('');

const totalStart = performance.now();

console.log('Creating client...');
await using client = await createEpicenterClient(epicenterConfig);
console.log('Client created\n');

const stress = client.stress;

let grandTotal = 0;

for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex++) {
	const table = TABLES[tableIndex];
	const tableStart = performance.now();

	process.stdout.write(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: 0/${ITEMS_PER_TABLE.toLocaleString()}`,
	);

	const now = new Date().toISOString();
	const tableDb = stress[table];

	let inserted = 0;
	while (inserted < ITEMS_PER_TABLE) {
		const batchStart = performance.now();
		const batchCount = Math.min(BATCH_SIZE, ITEMS_PER_TABLE - inserted);

		// Generate batch of items
		const items = [];
		for (let i = 0; i < batchCount; i++) {
			items.push({
				id: generateId(),
				name: `Item ${inserted + i}`,
				value: inserted + i,
				created_at: now,
			});
		}

		// Bulk upsert
		tableDb.upsertMany({ rows: items });
		inserted += batchCount;

		const batchElapsed = performance.now() - batchStart;
		const totalElapsed = performance.now() - tableStart;
		const rate = formatRate(batchCount, batchElapsed);

		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		process.stdout.write(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${inserted.toLocaleString()}/${ITEMS_PER_TABLE.toLocaleString()} (batch: ${rate}, elapsed: ${formatTime(totalElapsed)})`,
		);
	}

	const tableElapsed = performance.now() - tableStart;

	process.stdout.clearLine(0);
	process.stdout.cursorTo(0);

	grandTotal += ITEMS_PER_TABLE;
	const avgRate = formatRate(ITEMS_PER_TABLE, tableElapsed);
	console.log(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: ${ITEMS_PER_TABLE.toLocaleString()} items in ${formatTime(tableElapsed)} (avg ${avgRate})`,
	);
}

const totalElapsed = performance.now() - totalStart;
console.log('');
console.log('='.repeat(60));
console.log(
	`Total: ${grandTotal.toLocaleString()} items in ${formatTime(totalElapsed)}`,
);
console.log(`Average rate: ${formatRate(grandTotal, totalElapsed)}`);
console.log('='.repeat(60));

// Wait for persistence to complete
console.log('');
console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));

// Check YJS file size
const yjsPath = './.epicenter/stress.yjs';
if (existsSync(yjsPath)) {
	const stats = statSync(yjsPath);
	console.log(`YJS file: ${yjsPath}`);
	console.log(`YJS file size: ${formatBytes(stats.size)}`);
	console.log(`Bytes per item: ${(stats.size / grandTotal).toFixed(2)}`);
} else {
	console.log(`YJS file not found at ${yjsPath}`);
}

console.log('');
console.log('Stress test complete!');
