/**
 * YJS Write-Delete-Write Stress Test
 *
 * Tests YJS file size behavior when data is written, deleted, then written again.
 * This helps understand how YJS handles tombstones and whether file size grows
 * with deletions.
 *
 * The test performs 3 phases:
 * 1. Write: Upsert 10k items across all tables
 * 2. Delete: Delete all 10k items
 * 3. Write: Upsert 10k items again
 *
 * @example
 * ```bash
 * bun run stress-test-write-delete-write.ts
 *
 * # Custom item count
 * bun run stress-test-write-delete-write.ts 5000
 * ```
 */

import { existsSync, rmSync, statSync } from 'node:fs';
import { createEpicenterClient, generateId } from '@epicenter/hq';
import epicenterConfig from './epicenter.config';

const ITEMS_PER_TABLE = Number(process.argv[2]) || 10_000;
const BATCH_SIZE = 1_000;

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

// TTY helpers for progress output
const isTTY = process.stdout.isTTY;
const clearLine = () => {
	if (isTTY) {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
	}
};
const writeLine = (text: string) => {
	if (isTTY) {
		process.stdout.write(text);
	}
};

function getYjsFileSize(): number | null {
	const yjsPath = './.epicenter/stress.yjs';
	if (existsSync(yjsPath)) {
		return statSync(yjsPath).size;
	}
	return null;
}

console.log('='.repeat(60));
console.log('YJS Write-Delete-Write Stress Test');
console.log('='.repeat(60));
console.log(`Items per table: ${ITEMS_PER_TABLE.toLocaleString()}`);
console.log(`Batch size: ${BATCH_SIZE.toLocaleString()}`);
console.log(`Total tables: ${TABLES.length}`);
console.log(
	`Items per phase: ${(ITEMS_PER_TABLE * TABLES.length).toLocaleString()}`,
);
console.log('='.repeat(60));
console.log('');

// Clean up any existing YJS file
const yjsPath = './.epicenter/stress.yjs';
if (existsSync(yjsPath)) {
	console.log('Removing existing YJS file...');
	rmSync(yjsPath);
}

const totalStart = performance.now();

console.log('Creating client...');
await using client = await createEpicenterClient(epicenterConfig);
console.log('Client created\n');

const stress = client.stress;

// Track IDs for deletion
const allIds: Map<(typeof TABLES)[number], string[]> = new Map();
for (const table of TABLES) {
	allIds.set(table, []);
}

// ============================================================================
// PHASE 1: Write
// ============================================================================
console.log('PHASE 1: Write');
console.log('-'.repeat(60));

const phase1Start = performance.now();

for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex++) {
	const table = TABLES[tableIndex];
	const tableStart = performance.now();
	const tableIds = allIds.get(table)!;

	writeLine(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: 0/${ITEMS_PER_TABLE.toLocaleString()}`,
	);

	const now = new Date().toISOString();
	const tableDb = stress[table];

	let inserted = 0;
	while (inserted < ITEMS_PER_TABLE) {
		const batchStart = performance.now();
		const batchCount = Math.min(BATCH_SIZE, ITEMS_PER_TABLE - inserted);

		const items = [];
		for (let i = 0; i < batchCount; i++) {
			const id = generateId();
			tableIds.push(id);
			items.push({
				id,
				name: `Item ${inserted + i}`,
				value: inserted + i,
				created_at: now,
			});
		}

		tableDb.upsertMany({ rows: items });
		inserted += batchCount;

		const batchElapsed = performance.now() - batchStart;
		const totalElapsed = performance.now() - tableStart;
		const rate = formatRate(batchCount, batchElapsed);

		clearLine();
		writeLine(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${inserted.toLocaleString()}/${ITEMS_PER_TABLE.toLocaleString()} (batch: ${rate}, elapsed: ${formatTime(totalElapsed)})`,
		);
	}

	const tableElapsed = performance.now() - tableStart;

	clearLine();
	console.log(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: ${ITEMS_PER_TABLE.toLocaleString()} items in ${formatTime(tableElapsed)} (avg ${formatRate(ITEMS_PER_TABLE, tableElapsed)})`,
	);
}

const phase1Elapsed = performance.now() - phase1Start;
const phase1Total = ITEMS_PER_TABLE * TABLES.length;
console.log('');
console.log(
	`Phase 1 complete: ${phase1Total.toLocaleString()} items in ${formatTime(phase1Elapsed)}`,
);

// Wait for persistence and check size
console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));
const sizeAfterWrite1 = getYjsFileSize();
console.log(
	`YJS file size after Phase 1: ${sizeAfterWrite1 ? formatBytes(sizeAfterWrite1) : 'N/A'}`,
);
console.log('');

// ============================================================================
// PHASE 2: Delete
// ============================================================================
console.log('PHASE 2: Delete');
console.log('-'.repeat(60));

const phase2Start = performance.now();

for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex++) {
	const table = TABLES[tableIndex];
	const tableStart = performance.now();
	const tableIds = allIds.get(table)!;
	const tableDb = stress[table];

	writeLine(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: 0/${tableIds.length.toLocaleString()}`,
	);

	let deleted = 0;
	while (deleted < tableIds.length) {
		const batchStart = performance.now();
		const batchCount = Math.min(BATCH_SIZE, tableIds.length - deleted);
		const batchIds = tableIds.slice(deleted, deleted + batchCount);

		// Delete batch
		tableDb.deleteMany({ ids: batchIds });
		deleted += batchCount;

		const batchElapsed = performance.now() - batchStart;
		const totalElapsed = performance.now() - tableStart;
		const rate = formatRate(batchCount, batchElapsed);

		clearLine();
		writeLine(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${deleted.toLocaleString()}/${tableIds.length.toLocaleString()} (batch: ${rate}, elapsed: ${formatTime(totalElapsed)})`,
		);
	}

	const tableElapsed = performance.now() - tableStart;

	clearLine();
	console.log(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: ${tableIds.length.toLocaleString()} items in ${formatTime(tableElapsed)} (avg ${formatRate(tableIds.length, tableElapsed)})`,
	);
}

const phase2Elapsed = performance.now() - phase2Start;
const phase2Total = ITEMS_PER_TABLE * TABLES.length;
console.log('');
console.log(
	`Phase 2 complete: ${phase2Total.toLocaleString()} items deleted in ${formatTime(phase2Elapsed)}`,
);

// Wait for persistence and check size
console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));
const sizeAfterDelete = getYjsFileSize();
console.log(
	`YJS file size after Phase 2: ${sizeAfterDelete ? formatBytes(sizeAfterDelete) : 'N/A'}`,
);
console.log('');

// ============================================================================
// PHASE 3: Write again
// ============================================================================
console.log('PHASE 3: Write again');
console.log('-'.repeat(60));

const phase3Start = performance.now();

for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex++) {
	const table = TABLES[tableIndex];
	const tableStart = performance.now();

	writeLine(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: 0/${ITEMS_PER_TABLE.toLocaleString()}`,
	);

	const now = new Date().toISOString();
	const tableDb = stress[table];

	let inserted = 0;
	while (inserted < ITEMS_PER_TABLE) {
		const batchStart = performance.now();
		const batchCount = Math.min(BATCH_SIZE, ITEMS_PER_TABLE - inserted);

		const items = [];
		for (let i = 0; i < batchCount; i++) {
			items.push({
				id: generateId(),
				name: `Item v2 ${inserted + i}`,
				value: inserted + i + 1000000,
				created_at: now,
			});
		}

		tableDb.upsertMany({ rows: items });
		inserted += batchCount;

		const batchElapsed = performance.now() - batchStart;
		const totalElapsed = performance.now() - tableStart;
		const rate = formatRate(batchCount, batchElapsed);

		clearLine();
		writeLine(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${inserted.toLocaleString()}/${ITEMS_PER_TABLE.toLocaleString()} (batch: ${rate}, elapsed: ${formatTime(totalElapsed)})`,
		);
	}

	const tableElapsed = performance.now() - tableStart;

	clearLine();
	console.log(
		`[${tableIndex + 1}/${TABLES.length}] ${table}: ${ITEMS_PER_TABLE.toLocaleString()} items in ${formatTime(tableElapsed)} (avg ${formatRate(ITEMS_PER_TABLE, tableElapsed)})`,
	);
}

const phase3Elapsed = performance.now() - phase3Start;
const phase3Total = ITEMS_PER_TABLE * TABLES.length;
console.log('');
console.log(
	`Phase 3 complete: ${phase3Total.toLocaleString()} items in ${formatTime(phase3Elapsed)}`,
);

// Wait for persistence and check final size
console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));
const sizeAfterWrite2 = getYjsFileSize();
console.log(
	`YJS file size after Phase 3: ${sizeAfterWrite2 ? formatBytes(sizeAfterWrite2) : 'N/A'}`,
);
console.log('');

// ============================================================================
// Summary
// ============================================================================
const totalElapsed = performance.now() - totalStart;

console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Total time: ${formatTime(totalElapsed)}`);
console.log('');
console.log('File size progression:');
console.log(
	`  After Phase 1 (write):  ${sizeAfterWrite1 ? formatBytes(sizeAfterWrite1) : 'N/A'}`,
);
console.log(
	`  After Phase 2 (delete): ${sizeAfterDelete ? formatBytes(sizeAfterDelete) : 'N/A'}`,
);
console.log(
	`  After Phase 3 (write):  ${sizeAfterWrite2 ? formatBytes(sizeAfterWrite2) : 'N/A'}`,
);

if (sizeAfterWrite1 && sizeAfterDelete && sizeAfterWrite2) {
	console.log('');
	console.log('Size changes:');
	console.log(
		`  Delete overhead: +${formatBytes(sizeAfterDelete - sizeAfterWrite1)} (${((sizeAfterDelete / sizeAfterWrite1 - 1) * 100).toFixed(1)}%)`,
	);
	console.log(
		`  Final vs initial: +${formatBytes(sizeAfterWrite2 - sizeAfterWrite1)} (${((sizeAfterWrite2 / sizeAfterWrite1 - 1) * 100).toFixed(1)}%)`,
	);
	console.log(
		`  Final vs single write (2x data): ${(sizeAfterWrite2 / sizeAfterWrite1).toFixed(2)}x`,
	);
}

console.log('');
console.log('Write-Delete-Write stress test complete!');
