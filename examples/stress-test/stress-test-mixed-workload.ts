/**
 * YJS Mixed Workload Stress Test
 *
 * Simulates realistic application usage with interleaved reads and writes.
 * Unlike pure write tests, this measures how the system performs when
 * constantly switching between operations.
 *
 * The test performs rounds of mixed operations:
 * - Upserts (new items)
 * - Updates (existing items)
 * - Deletes
 * - Reads (getAll, get)
 *
 * Key questions this answers:
 * - Does interleaving reads/writes affect performance?
 * - Is there overhead from operation switching?
 * - How does the system handle realistic usage patterns?
 *
 * @example
 * ```bash
 * bun run stress-test-mixed-workload.ts
 *
 * # Custom rounds
 * bun run stress-test-mixed-workload.ts 10
 *
 * # Custom operations per round
 * bun run stress-test-mixed-workload.ts 10 500
 * ```
 */

import { existsSync, statSync, rmSync } from 'node:fs';
import { createEpicenterClient, generateId } from '@epicenter/hq';
import epicenterConfig from './epicenter.config';

const ROUNDS = Number(process.argv[2]) || 5;
const OPS_PER_ROUND = Number(process.argv[3]) || 1_000;

// Operation distribution per round
const DISTRIBUTION = {
	upsertNew: 0.3, // 30% new items
	upsertUpdate: 0.3, // 30% update existing
	delete: 0.1, // 10% delete
	readAll: 0.1, // 10% getAll
	readSingle: 0.2, // 20% get single
};

const TABLE = 'items_a' as const;

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
console.log('YJS Mixed Workload Stress Test');
console.log('='.repeat(60));
console.log(`Rounds: ${ROUNDS}`);
console.log(`Operations per round: ${OPS_PER_ROUND.toLocaleString()}`);
console.log(`Total operations: ${(ROUNDS * OPS_PER_ROUND).toLocaleString()}`);
console.log('');
console.log('Operation distribution:');
console.log(`  Upsert (new):    ${(DISTRIBUTION.upsertNew * 100).toFixed(0)}%`);
console.log(`  Upsert (update): ${(DISTRIBUTION.upsertUpdate * 100).toFixed(0)}%`);
console.log(`  Delete:          ${(DISTRIBUTION.delete * 100).toFixed(0)}%`);
console.log(`  Read (getAll):   ${(DISTRIBUTION.readAll * 100).toFixed(0)}%`);
console.log(`  Read (get):      ${(DISTRIBUTION.readSingle * 100).toFixed(0)}%`);
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
const tableDb = stress[TABLE];

// Track existing IDs
const existingIds: string[] = [];

// Track metrics per round
type RoundMetrics = {
	round: number;
	totalOps: number;
	duration: number;
	opsPerSec: number;
	opCounts: Record<string, number>;
	opTimes: Record<string, number>;
	itemCount: number;
	fileSize: number | null;
};

const roundMetrics: RoundMetrics[] = [];

// Seed with some initial data
console.log('Seeding initial data (1000 items)...');
const seedStart = performance.now();
const seedItems = [];
for (let i = 0; i < 1000; i++) {
	const id = generateId();
	existingIds.push(id);
	seedItems.push({
		id,
		name: `Seed Item ${i}`,
		value: i,
		created_at: new Date().toISOString(),
	});
}
tableDb.upsertMany({ rows: seedItems });
console.log(`Seeded in ${formatTime(performance.now() - seedStart)}\n`);

console.log('Starting mixed workload rounds...');
console.log('-'.repeat(70));
console.log('Round | Ops/sec    | Items   | File Size  | Operation breakdown');
console.log('-'.repeat(70));

for (let round = 1; round <= ROUNDS; round++) {
	const roundStart = performance.now();
	const opCounts: Record<string, number> = {
		upsertNew: 0,
		upsertUpdate: 0,
		delete: 0,
		readAll: 0,
		readSingle: 0,
	};
	const opTimes: Record<string, number> = {
		upsertNew: 0,
		upsertUpdate: 0,
		delete: 0,
		readAll: 0,
		readSingle: 0,
	};

	const now = new Date().toISOString();

	for (let op = 0; op < OPS_PER_ROUND; op++) {
		const rand = Math.random();
		let cumulative = 0;

		const opStart = performance.now();

		// Upsert new
		cumulative += DISTRIBUTION.upsertNew;
		if (rand < cumulative) {
			const id = generateId();
			existingIds.push(id);
			tableDb.upsert({
				id,
				name: `New Item ${round}-${op}`,
				value: op,
				created_at: now,
			});
			opCounts.upsertNew++;
			opTimes.upsertNew += performance.now() - opStart;
			continue;
		}

		// Upsert update (only if we have existing items)
		cumulative += DISTRIBUTION.upsertUpdate;
		if (rand < cumulative && existingIds.length > 0) {
			const randomId = existingIds[Math.floor(Math.random() * existingIds.length)];
			tableDb.upsert({
				id: randomId,
				name: `Updated Item ${round}-${op}`,
				value: op * 10,
				created_at: now,
			});
			opCounts.upsertUpdate++;
			opTimes.upsertUpdate += performance.now() - opStart;
			continue;
		}

		// Delete (only if we have enough items)
		cumulative += DISTRIBUTION.delete;
		if (rand < cumulative && existingIds.length > 100) {
			const randomIndex = Math.floor(Math.random() * existingIds.length);
			const idToDelete = existingIds[randomIndex];
			existingIds.splice(randomIndex, 1);
			tableDb.delete({ id: idToDelete });
			opCounts.delete++;
			opTimes.delete += performance.now() - opStart;
			continue;
		}

		// Read all
		cumulative += DISTRIBUTION.readAll;
		if (rand < cumulative) {
			tableDb.getAllValid();
			opCounts.readAll++;
			opTimes.readAll += performance.now() - opStart;
			continue;
		}

		// Read single (fallback)
		if (existingIds.length > 0) {
			const randomId = existingIds[Math.floor(Math.random() * existingIds.length)];
			tableDb.get({ id: randomId });
			opCounts.readSingle++;
			opTimes.readSingle += performance.now() - opStart;
		}
	}

	const roundDuration = performance.now() - roundStart;

	// Wait for persistence briefly
	await new Promise((resolve) => setTimeout(resolve, 500));
	const fileSize = getYjsFileSize();

	const metrics: RoundMetrics = {
		round,
		totalOps: OPS_PER_ROUND,
		duration: roundDuration,
		opsPerSec: OPS_PER_ROUND / roundDuration * 1000,
		opCounts,
		opTimes,
		itemCount: existingIds.length,
		fileSize,
	};
	roundMetrics.push(metrics);

	// Print row
	const roundCol = round.toString().padStart(5);
	const opsSecCol = formatRate(OPS_PER_ROUND, roundDuration).padStart(10);
	const itemsCol = existingIds.length.toLocaleString().padStart(7);
	const sizeCol = (fileSize ? formatBytes(fileSize) : 'N/A').padStart(10);

	// Operation breakdown
	const breakdown = Object.entries(opCounts)
		.filter(([_, count]) => count > 0)
		.map(([op, count]) => `${op.slice(0, 3)}:${count}`)
		.join(' ');

	console.log(`${roundCol} | ${opsSecCol} | ${itemsCol} | ${sizeCol} | ${breakdown}`);
}

console.log('-'.repeat(70));
console.log('');

// Wait for final persistence
console.log('Waiting for YJS persistence (2s)...');
await new Promise((resolve) => setTimeout(resolve, 2000));

const totalElapsed = performance.now() - totalStart;

// ============================================================================
// Summary
// ============================================================================
console.log('');
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Total time: ${formatTime(totalElapsed)}`);
console.log(`Total operations: ${(ROUNDS * OPS_PER_ROUND).toLocaleString()}`);
console.log(`Final item count: ${existingIds.length.toLocaleString()}`);
console.log(`Final file size: ${getYjsFileSize() ? formatBytes(getYjsFileSize()!) : 'N/A'}`);
console.log('');

// Performance trends
if (roundMetrics.length >= 2) {
	const first = roundMetrics[0];
	const last = roundMetrics[roundMetrics.length - 1];

	console.log('Performance trend:');
	console.log(`  First round: ${formatRate(first.totalOps, first.duration)}`);
	console.log(`  Last round:  ${formatRate(last.totalOps, last.duration)}`);

	const slowdown = ((first.opsPerSec - last.opsPerSec) / first.opsPerSec * 100).toFixed(1);
	if (parseFloat(slowdown) > 0) {
		console.log(`  Slowdown: ${slowdown}% over ${ROUNDS} rounds`);
	} else {
		console.log(`  Speedup: ${Math.abs(parseFloat(slowdown))}% over ${ROUNDS} rounds`);
	}
}

// Average times per operation type
console.log('');
console.log('Average time per operation type:');

const totalOpCounts: Record<string, number> = {};
const totalOpTimes: Record<string, number> = {};

for (const m of roundMetrics) {
	for (const [op, count] of Object.entries(m.opCounts)) {
		totalOpCounts[op] = (totalOpCounts[op] || 0) + count;
		totalOpTimes[op] = (totalOpTimes[op] || 0) + m.opTimes[op];
	}
}

for (const op of Object.keys(totalOpCounts)) {
	if (totalOpCounts[op] > 0) {
		const avgTime = totalOpTimes[op] / totalOpCounts[op];
		console.log(`  ${op.padEnd(12)}: ${formatTime(avgTime)} (${totalOpCounts[op].toLocaleString()} ops)`);
	}
}

console.log('');
console.log('Mixed workload stress test complete!');
