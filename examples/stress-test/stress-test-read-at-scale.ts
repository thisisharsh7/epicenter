/**
 * YJS Read-at-Scale Stress Test
 *
 * Tests read performance as document size grows. This simulates real-world
 * scenarios where applications need to query data from large datasets.
 *
 * The test performs:
 * 1. Incrementally add data in batches
 * 2. After each batch, measure read performance (getAll, get, count)
 *
 * Key questions this answers:
 * - How does getAll() performance scale with document size?
 * - How does single-row get() scale?
 * - Is count() affected by document size?
 *
 * @example
 * ```bash
 * bun run stress-test-read-at-scale.ts
 *
 * # Custom total items
 * bun run stress-test-read-at-scale.ts 50000
 *
 * # Custom batch size for measurements
 * bun run stress-test-read-at-scale.ts 50000 10000
 * ```
 */

import { existsSync, rmSync } from 'node:fs';
import { createEpicenterClient, generateId } from '@epicenter/hq';
import epicenterConfig from './epicenter.config';

const TOTAL_ITEMS = Number(process.argv[2]) || 50_000;
const MEASUREMENT_BATCH = Number(process.argv[3]) || 10_000;
const INSERT_BATCH_SIZE = 1_000;

// Use a single table for cleaner measurements
const TABLE = 'items_a' as const;

function formatTime(ms: number): string {
	if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
	if (ms < 1000) return `${ms.toFixed(2)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

function formatRate(count: number, ms: number): string {
	const rate = (count / ms) * 1000;
	if (rate >= 1_000_000) return `${(rate / 1_000_000).toFixed(1)}M/s`;
	if (rate >= 1000) return `${(rate / 1000).toFixed(1)}k/s`;
	return `${rate.toFixed(0)}/s`;
}

console.log('='.repeat(60));
console.log('YJS Read-at-Scale Stress Test');
console.log('='.repeat(60));
console.log(`Total items to insert: ${TOTAL_ITEMS.toLocaleString()}`);
console.log(`Measurement interval: every ${MEASUREMENT_BATCH.toLocaleString()} items`);
console.log(`Insert batch size: ${INSERT_BATCH_SIZE.toLocaleString()}`);
console.log('='.repeat(60));
console.log('');

// Clean up any existing YJS file
const yjsPath = './.epicenter/stress.yjs';
if (existsSync(yjsPath)) {
	console.log('Removing existing YJS file...');
	rmSync(yjsPath);
}

console.log('Creating client...');
await using client = await createEpicenterClient(epicenterConfig);
console.log('Client created\n');

const stress = client.stress;
const tableDb = stress[TABLE];

// Track all IDs for random access tests
const allIds: string[] = [];

// Track metrics
const metrics: {
	itemCount: number;
	getAllTime: number;
	getAllRate: number;
	getSingleTime: number;
	getSingleRate: number;
	countTime: number;
}[] = [];

console.log('Starting incremental load with read measurements...');
console.log('-'.repeat(60));
console.log('Items      | getAll()    | get() x100  | count()');
console.log('-'.repeat(60));

let totalInserted = 0;
const now = new Date().toISOString();

while (totalInserted < TOTAL_ITEMS) {
	// Insert until next measurement point
	const nextMeasurement = Math.min(
		Math.ceil((totalInserted + 1) / MEASUREMENT_BATCH) * MEASUREMENT_BATCH,
		TOTAL_ITEMS,
	);

	while (totalInserted < nextMeasurement) {
		const batchCount = Math.min(INSERT_BATCH_SIZE, nextMeasurement - totalInserted);

		const items = [];
		for (let i = 0; i < batchCount; i++) {
			const id = generateId();
			allIds.push(id);
			items.push({
				id,
				name: `Item ${totalInserted + i}`,
				value: totalInserted + i,
				created_at: now,
			});
		}

		tableDb.upsertMany({ rows: items });
		totalInserted += batchCount;
	}

	// Measure read performance at this point
	// 1. getAllValid() - fetch all valid rows
	const getAllStart = performance.now();
	const allRows = tableDb.getAllValid();
	const getAllTime = performance.now() - getAllStart;

	// 2. get() - fetch 100 random rows
	const sampleSize = Math.min(100, allIds.length);
	const sampleIds = [];
	for (let i = 0; i < sampleSize; i++) {
		const randomIndex = Math.floor(Math.random() * allIds.length);
		sampleIds.push(allIds[randomIndex]);
	}

	const getSingleStart = performance.now();
	for (const id of sampleIds) {
		tableDb.get({ id });
	}
	const getSingleTime = performance.now() - getSingleStart;
	const avgGetTime = getSingleTime / sampleSize;

	// 3. count() - get total count
	const countStart = performance.now();
	const count = tableDb.count();
	const countTime = performance.now() - countStart;

	// Record metrics
	metrics.push({
		itemCount: totalInserted,
		getAllTime,
		getAllRate: allRows.length / getAllTime * 1000,
		getSingleTime: avgGetTime,
		getSingleRate: 1 / avgGetTime * 1000,
		countTime,
	});

	// Print row
	const itemsCol = totalInserted.toLocaleString().padStart(10);
	const getAllCol = `${formatTime(getAllTime)} (${formatRate(allRows.length, getAllTime)})`.padStart(11);
	const getCol = `${formatTime(avgGetTime)}/ea`.padStart(11);
	const countCol = formatTime(countTime).padStart(10);

	console.log(`${itemsCol} | ${getAllCol} | ${getCol} | ${countCol}`);
}

console.log('-'.repeat(60));
console.log('');

// ============================================================================
// Summary
// ============================================================================
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));

if (metrics.length >= 2) {
	const first = metrics[0];
	const last = metrics[metrics.length - 1];

	console.log('');
	console.log('Scaling analysis (first vs last measurement):');
	console.log('-'.repeat(60));

	// getAll scaling
	const getAllSlowdown = (last.getAllTime / first.getAllTime).toFixed(2);
	const itemsRatio = (last.itemCount / first.itemCount).toFixed(1);
	console.log(`  Items grew: ${first.itemCount.toLocaleString()} → ${last.itemCount.toLocaleString()} (${itemsRatio}x)`);
	console.log(`  getAll() time: ${formatTime(first.getAllTime)} → ${formatTime(last.getAllTime)} (${getAllSlowdown}x slower)`);

	// get() scaling
	const getSlowdown = (last.getSingleTime / first.getSingleTime).toFixed(2);
	console.log(`  get() time: ${formatTime(first.getSingleTime)} → ${formatTime(last.getSingleTime)} (${getSlowdown}x slower)`);

	// count() scaling
	const countSlowdown = (last.countTime / first.countTime).toFixed(2);
	console.log(`  count() time: ${formatTime(first.countTime)} → ${formatTime(last.countTime)} (${countSlowdown}x slower)`);

	// Complexity analysis
	console.log('');
	console.log('Complexity estimate:');

	const getAllComplexity = parseFloat(getAllSlowdown) / parseFloat(itemsRatio);
	if (getAllComplexity < 1.2) {
		console.log(`  getAll(): ~O(n) - linear scaling (${getAllComplexity.toFixed(2)}x per ${itemsRatio}x items)`);
	} else if (getAllComplexity < 2) {
		console.log(`  getAll(): ~O(n log n) - slightly superlinear (${getAllComplexity.toFixed(2)}x per ${itemsRatio}x items)`);
	} else {
		console.log(`  getAll(): ~O(n²) or worse - concerning (${getAllComplexity.toFixed(2)}x per ${itemsRatio}x items)`);
	}

	const getComplexity = parseFloat(getSlowdown);
	if (getComplexity < 1.5) {
		console.log(`  get(): ~O(1) - constant time (${getSlowdown}x over ${itemsRatio}x items)`);
	} else if (getComplexity < parseFloat(itemsRatio)) {
		console.log(`  get(): ~O(log n) - logarithmic (${getSlowdown}x over ${itemsRatio}x items)`);
	} else {
		console.log(`  get(): ~O(n) or worse - linear scan (${getSlowdown}x over ${itemsRatio}x items)`);
	}
}

console.log('');
console.log('Read-at-scale stress test complete!');
