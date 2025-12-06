/**
 * SQLite Rebuild Strategy Benchmark
 *
 * Compares three approaches for rebuilding SQLite data:
 * 1. DELETE + INSERT: Delete all rows, then insert new data
 * 2. DROP + CREATE + INSERT: Drop tables, recreate schema, then insert
 * 3. FILE DELETE + INSERT: Delete the entire .db file, recreate everything
 *
 * @example
 * ```bash
 * cd examples/sqlite-rebuild-benchmark
 * bun benchmark.ts
 * ```
 */

import { existsSync, unlinkSync, statSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Configuration
// =============================================================================

const TEST_SIZES = [1_000, 10_000, 50_000, 100_000];
const ITERATIONS = 3;
const DB_DIR = './.benchmark-data';

// =============================================================================
// Schema
// =============================================================================

const items = sqliteTable('items', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	value: integer('value').notNull(),
	created_at: text('created_at').notNull(),
});

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
	return Math.random().toString(36).substring(2, 15);
}

function generateRows(count: number) {
	const now = new Date().toISOString();
	const rows = [];
	for (let i = 0; i < count; i++) {
		rows.push({
			id: generateId(),
			name: `Item ${i}`,
			value: i,
			created_at: now,
		});
	}
	return rows;
}

function formatTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(1)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

function formatRate(count: number, ms: number): string {
	const rate = (count / ms) * 1000;
	if (rate >= 1000) return `${(rate / 1000).toFixed(1)}k/s`;
	return `${rate.toFixed(0)}/s`;
}

// =============================================================================
// Strategy 1: DELETE + INSERT
// =============================================================================

async function strategyDeleteInsert(
	dbPath: string,
	rows: ReturnType<typeof generateRows>,
): Promise<number> {
	const client = new Database(dbPath);
	client.exec('PRAGMA journal_mode = WAL');
	const db = drizzle({ client, schema: { items } });

	const start = performance.now();

	// Delete all rows
	db.delete(items).run();

	// Insert new rows
	db.insert(items).values(rows).run();

	const elapsed = performance.now() - start;

	client.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	client.close();
	return elapsed;
}

// =============================================================================
// Strategy 2: DROP + CREATE + INSERT
// =============================================================================

async function strategyDropCreate(
	dbPath: string,
	rows: ReturnType<typeof generateRows>,
): Promise<number> {
	const client = new Database(dbPath);
	client.exec('PRAGMA journal_mode = WAL');
	const db = drizzle({ client, schema: { items } });

	const start = performance.now();

	// Drop table
	db.run(sql.raw('DROP TABLE IF EXISTS "items"'));

	// Recreate table
	db.run(
		sql.raw(`
		CREATE TABLE "items" (
			"id" TEXT PRIMARY KEY,
			"name" TEXT NOT NULL,
			"value" INTEGER NOT NULL,
			"created_at" TEXT NOT NULL
		)
	`),
	);

	// Insert new rows
	db.insert(items).values(rows).run();

	const elapsed = performance.now() - start;

	client.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	client.close();
	return elapsed;
}

// =============================================================================
// Strategy 3: FILE DELETE + INSERT
// =============================================================================

async function strategyFileDelete(
	dbPath: string,
	rows: ReturnType<typeof generateRows>,
): Promise<number> {
	const start = performance.now();

	// Delete database files
	if (existsSync(dbPath)) unlinkSync(dbPath);
	if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
	if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');

	// Create fresh database
	const client = new Database(dbPath);
	client.exec('PRAGMA journal_mode = WAL');
	const db = drizzle({ client, schema: { items } });

	// Drop and create table (turso may cache schema)
	db.run(sql.raw('DROP TABLE IF EXISTS "items"'));
	db.run(
		sql.raw(`
		CREATE TABLE "items" (
			"id" TEXT PRIMARY KEY,
			"name" TEXT NOT NULL,
			"value" INTEGER NOT NULL,
			"created_at" TEXT NOT NULL
		)
	`),
	);

	// Insert new rows
	db.insert(items).values(rows).run();

	const elapsed = performance.now() - start;

	client.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	client.close();
	return elapsed;
}

// =============================================================================
// Setup: Create database with initial data
// =============================================================================

async function setupDatabase(dbPath: string, rowCount: number): Promise<void> {
	// Remove existing files completely for a fresh start
	if (existsSync(dbPath)) unlinkSync(dbPath);
	if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
	if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');

	const client = new Database(dbPath);
	client.exec('PRAGMA journal_mode = WAL');
	const db = drizzle({ client, schema: { items } });

	// Drop and create table (in case file deletion didn't work due to locks)
	db.run(sql.raw('DROP TABLE IF EXISTS "items"'));
	db.run(
		sql.raw(`
		CREATE TABLE "items" (
			"id" TEXT PRIMARY KEY,
			"name" TEXT NOT NULL,
			"value" INTEGER NOT NULL,
			"created_at" TEXT NOT NULL
		)
	`),
	);

	// Insert initial data
	const rows = generateRows(rowCount);
	db.insert(items).values(rows).run();

	// Force WAL checkpoint to ensure all data is in main db file before closing
	client.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	client.close();
}

// =============================================================================
// Main Benchmark
// =============================================================================

type Strategy = {
	name: string;
	fn: (
		dbPath: string,
		rows: ReturnType<typeof generateRows>,
	) => Promise<number>;
};

const strategies: Strategy[] = [
	{ name: 'DELETE + INSERT', fn: strategyDeleteInsert },
	{ name: 'DROP + CREATE + INSERT', fn: strategyDropCreate },
	{ name: 'FILE DELETE + INSERT', fn: strategyFileDelete },
];

async function runBenchmark() {
	console.log('='.repeat(70));
	console.log('SQLite Rebuild Strategy Benchmark');
	console.log('='.repeat(70));
	console.log(`Test sizes: ${TEST_SIZES.map((n) => n.toLocaleString()).join(', ')} rows`);
	console.log(`Iterations per test: ${ITERATIONS}`);
	console.log('='.repeat(70));
	console.log('');

	await mkdir(DB_DIR, { recursive: true });

	const results: Record<string, Record<number, number[]>> = {};
	for (const strategy of strategies) {
		results[strategy.name] = {};
		for (const size of TEST_SIZES) {
			results[strategy.name][size] = [];
		}
	}

	for (const size of TEST_SIZES) {
		console.log(`\n${'='.repeat(70)}`);
		console.log(`Testing with ${size.toLocaleString()} rows`);
		console.log('='.repeat(70));

		// Generate test data once per size
		const testRows = generateRows(size);

		for (const strategy of strategies) {
			const dbPath = path.join(DB_DIR, `${strategy.name.replace(/\s+/g, '-').toLowerCase()}.db`);

			console.log(`\n${strategy.name}:`);

			for (let i = 0; i < ITERATIONS; i++) {
				// Setup: create database with initial data
				await setupDatabase(dbPath, size);

				// Run benchmark
				const elapsed = await strategy.fn(dbPath, testRows);
				results[strategy.name][size].push(elapsed);

				process.stdout.write(
					`  Iteration ${i + 1}: ${formatTime(elapsed)} (${formatRate(size, elapsed)})\n`,
				);
			}

			// Calculate average
			const times = results[strategy.name][size];
			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			console.log(`  Average: ${formatTime(avg)} (${formatRate(size, avg)})`);
		}
	}

	// Summary table
	console.log('\n');
	console.log('='.repeat(70));
	console.log('SUMMARY (average times)');
	console.log('='.repeat(70));

	// Header
	const header = ['Strategy', ...TEST_SIZES.map((s) => `${(s / 1000).toFixed(0)}k rows`)];
	console.log(header.map((h) => h.padEnd(22)).join(''));
	console.log('-'.repeat(70));

	// Rows
	for (const strategy of strategies) {
		const row = [strategy.name];
		for (const size of TEST_SIZES) {
			const times = results[strategy.name][size];
			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			row.push(formatTime(avg));
		}
		console.log(row.map((r) => r.padEnd(22)).join(''));
	}

	// Find winner for each size
	console.log('-'.repeat(70));
	const winners = ['Winner'];
	for (const size of TEST_SIZES) {
		let bestTime = Infinity;
		let bestStrategy = '';
		for (const strategy of strategies) {
			const times = results[strategy.name][size];
			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			if (avg < bestTime) {
				bestTime = avg;
				bestStrategy = strategy.name.split(' ')[0]; // First word
			}
		}
		winners.push(bestStrategy);
	}
	console.log(winners.map((w) => w.padEnd(22)).join(''));

	// Cleanup
	console.log('\nCleaning up benchmark data...');
	for (const strategy of strategies) {
		const dbPath = path.join(DB_DIR, `${strategy.name.replace(/\s+/g, '-').toLowerCase()}.db`);
		if (existsSync(dbPath)) unlinkSync(dbPath);
		if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
		if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');
	}

	console.log('\nBenchmark complete!');
}

runBenchmark().catch(console.error);
