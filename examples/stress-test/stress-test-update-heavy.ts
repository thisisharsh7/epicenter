/**
 * YJS Update-Heavy Stress Test
 *
 * Tests performance when repeatedly updating existing rows vs creating new ones.
 * This simulates real-world scenarios where data is frequently modified rather
 * than just inserted.
 *
 * The test performs:
 * 1. Setup: Create initial dataset
 * 2. Update rounds: Repeatedly update all rows multiple times
 *
 * Key questions this answers:
 * - How does update performance compare to initial upsert?
 * - Does update performance degrade over multiple rounds?
 * - How does file size grow with updates vs inserts?
 *
 * @example
 * ```bash
 * bun run stress-test-update-heavy.ts
 *
 * # Custom item count
 * bun run stress-test-update-heavy.ts 5000
 *
 * # Custom update rounds
 * bun run stress-test-update-heavy.ts 5000 5
 * ```
 */

import { existsSync, rmSync, statSync } from 'node:fs';
import { createClient, generateId } from '@epicenter/hq';
import epicenterConfig from './epicenter.config';

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

const ITEMS_PER_TABLE = Number(process.argv[2]) || 5_000;
const UPDATE_ROUNDS = Number(process.argv[3]) || 3;
const BATCH_SIZE = 1_000;

const TABLES = ['items_a', 'items_b', 'items_c', 'items_d', 'items_e'] as const;

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

function getYjsFileSize(): number | null {
	const yjsPath = './.epicenter/stress.yjs';
	if (existsSync(yjsPath)) {
		return statSync(yjsPath).size;
	}
	return null;
}

console.log('='.repeat(60));
console.log('YJS Update-Heavy Stress Test');
console.log('='.repeat(60));
console.log(`Items per table: ${ITEMS_PER_TABLE.toLocaleString()}`);
console.log(`Update rounds: ${UPDATE_ROUNDS}`);
console.log(`Batch size: ${BATCH_SIZE.toLocaleString()}`);
console.log(`Total tables: ${TABLES.length}`);
console.log(
	`Total items: ${(ITEMS_PER_TABLE * TABLES.length).toLocaleString()}`,
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
await using client = await createClient(epicenterConfig);
console.log('Client created\n');

const stress = client.stress;

// Track IDs for updates
const allIds: Map<(typeof TABLES)[number], string[]> = new Map();
for (const table of TABLES) {
	allIds.set(table, []);
}

// Track metrics
const metrics: {
	phase: string;
	duration: number;
	itemCount: number;
	rate: number;
	fileSize: number | null;
}[] = [];

// ============================================================================
// PHASE 1: Initial Setup (Create data)
// ============================================================================
console.log('PHASE 1: Initial Setup');
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

		clearLine();
		writeLine(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${inserted.toLocaleString()}/${ITEMS_PER_TABLE.toLocaleString()}`,
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

console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));
const sizeAfterSetup = getYjsFileSize();
console.log(
	`YJS file size after setup: ${sizeAfterSetup ? formatBytes(sizeAfterSetup) : 'N/A'}`,
);

metrics.push({
	phase: 'Initial Setup',
	duration: phase1Elapsed,
	itemCount: phase1Total,
	rate: (phase1Total / phase1Elapsed) * 1000,
	fileSize: sizeAfterSetup,
});

console.log('');

// ============================================================================
// UPDATE ROUNDS
// ============================================================================
for (let round = 1; round <= UPDATE_ROUNDS; round++) {
	console.log(`UPDATE ROUND ${round}/${UPDATE_ROUNDS}`);
	console.log('-'.repeat(60));

	const roundStart = performance.now();

	for (let tableIndex = 0; tableIndex < TABLES.length; tableIndex++) {
		const table = TABLES[tableIndex];
		const tableStart = performance.now();
		const tableIds = allIds.get(table)!;
		const tableDb = stress[table];

		writeLine(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: 0/${tableIds.length.toLocaleString()}`,
		);

		const now = new Date().toISOString();
		let updated = 0;

		while (updated < tableIds.length) {
			const batchCount = Math.min(BATCH_SIZE, tableIds.length - updated);
			const batchIds = tableIds.slice(updated, updated + batchCount);

			const items = batchIds.map((id, i) => ({
				id,
				name: `Item v${round + 1} ${updated + i}`,
				value: (updated + i) * (round + 1),
				created_at: now,
			}));

			// Use upsertMany for updates (since updateMany requires all rows to exist)
			tableDb.upsertMany({ rows: items });
			updated += batchCount;

			clearLine();
			writeLine(
				`[${tableIndex + 1}/${TABLES.length}] ${table}: ${updated.toLocaleString()}/${tableIds.length.toLocaleString()}`,
			);
		}

		const tableElapsed = performance.now() - tableStart;
		clearLine();
		console.log(
			`[${tableIndex + 1}/${TABLES.length}] ${table}: ${tableIds.length.toLocaleString()} items in ${formatTime(tableElapsed)} (avg ${formatRate(tableIds.length, tableElapsed)})`,
		);
	}

	const roundElapsed = performance.now() - roundStart;
	const roundTotal = ITEMS_PER_TABLE * TABLES.length;

	console.log('');
	console.log(
		`Round ${round} complete: ${roundTotal.toLocaleString()} updates in ${formatTime(roundElapsed)}`,
	);

	console.log('Waiting for YJS persistence (2s)...');
	await new Promise((resolve) => setTimeout(resolve, 2000));
	const sizeAfterRound = getYjsFileSize();
	console.log(
		`YJS file size after round ${round}: ${sizeAfterRound ? formatBytes(sizeAfterRound) : 'N/A'}`,
	);

	metrics.push({
		phase: `Update Round ${round}`,
		duration: roundElapsed,
		itemCount: roundTotal,
		rate: (roundTotal / roundElapsed) * 1000,
		fileSize: sizeAfterRound,
	});

	console.log('');
}

// ============================================================================
// Summary
// ============================================================================
const totalElapsed = performance.now() - totalStart;

console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Total time: ${formatTime(totalElapsed)}`);
console.log('');

console.log('Performance by phase:');
console.log('-'.repeat(60));
console.log('Phase                  | Items      | Rate       | File Size');
console.log('-'.repeat(60));

for (const m of metrics) {
	const phase = m.phase.padEnd(22);
	const items = m.itemCount.toLocaleString().padStart(10);
	const rate = formatRate(m.itemCount, m.duration).padStart(10);
	const size = m.fileSize
		? formatBytes(m.fileSize).padStart(10)
		: 'N/A'.padStart(10);
	console.log(`${phase} | ${items} | ${rate} | ${size}`);
}

console.log('-'.repeat(60));

// Calculate trends
if (metrics.length >= 2) {
	const setupRate = metrics[0].rate;
	const lastUpdateRate = metrics[metrics.length - 1].rate;
	const updateVsSetup = ((lastUpdateRate / setupRate) * 100).toFixed(1);

	console.log('');
	console.log('Key findings:');
	console.log(`  Update rate vs initial: ${updateVsSetup}% of setup speed`);

	if (metrics[0].fileSize && metrics[metrics.length - 1].fileSize) {
		const sizeGrowth =
			metrics[metrics.length - 1].fileSize - metrics[0].fileSize;
		const growthPercent = ((sizeGrowth / metrics[0].fileSize) * 100).toFixed(1);
		console.log(
			`  File size growth: +${formatBytes(sizeGrowth)} (+${growthPercent}%)`,
		);
		console.log(
			`  Bytes per update round: ~${formatBytes(sizeGrowth / UPDATE_ROUNDS)}`,
		);
	}
}

console.log('');
console.log('Update-heavy stress test complete!');
