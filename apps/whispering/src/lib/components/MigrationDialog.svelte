<script module lang="ts">
	import { createDbServiceWeb } from '$lib/services/db/web';
	import { createFileSystemDb } from '$lib/services/db/file-system';
	import {
		migrateRecordings,
		migrateTransformations,
		migrateTransformationRuns,
		getMigrationCounts,
		type MigrationDirection,
		type MigrationResult
	} from '$lib/services/db/migration';
	import { seedIndexedDB, clearIndexedDB as clearIDB } from '$lib/services/db/seed-mock-data';

	export const migrationDialog = createMigrationDialog();

	function createMigrationDialog() {
		let isOpen = $state(false);
		let direction = $state<MigrationDirection>('idb-to-fs');
		let overwriteExisting = $state(false);
		let deleteAfterMigration = $state(false);
		let isRunning = $state(false);
		let logs = $state<string[]>([]);
		let counts = $state<{
			indexedDb: { recordings: number; transformations: number; runs: number };
			fileSystem: { recordings: number; transformations: number; runs: number };
		} | null>(null);
		let results = $state<{
			recordings: MigrationResult | null;
			transformations: MigrationResult | null;
			runs: MigrationResult | null;
		}>({
			recordings: null,
			transformations: null,
			runs: null
		});

		// Dev-only seeding state
		let isSeeding = $state(false);
		let isClearing = $state(false);

		// Create service instances
		const fileSystemDb = createFileSystemDb();
		const indexedDb = createDbServiceWeb({ DownloadService: null as any });

		function addLog(message: string) {
			logs.push(message);
		}

		function clearLogs() {
			logs = [];
		}

		async function loadCounts() {
			addLog('[Counts] Loading item counts from both systems...');

			const { data, error } = await getMigrationCounts(indexedDb, fileSystemDb);

			if (error) {
				addLog(`[Counts] ❌ Error: ${error.message}`);
				return;
			}

			counts = data;
			addLog(
				`[Counts] IndexedDB: ${data.indexedDb.recordings} recordings, ${data.indexedDb.transformations} transformations, ${data.indexedDb.runs} runs`
			);
			addLog(
				`[Counts] File System: ${data.fileSystem.recordings} recordings, ${data.fileSystem.transformations} transformations, ${data.fileSystem.runs} runs`
			);
		}

		async function startMigration() {
			if (isRunning) return;

			isRunning = true;
			clearLogs();
			results = { recordings: null, transformations: null, runs: null };

			addLog('[Migration] Starting migration process...');
			addLog(`[Migration] Direction: ${direction}`);
			addLog(`[Migration] Overwrite existing: ${overwriteExisting}`);
			addLog(`[Migration] Delete after migration: ${deleteAfterMigration}`);

			const options = {
				direction,
				overwriteExisting,
				deleteAfterMigration,
				onProgress: addLog
			};

			// Migrate recordings
			const recordingsResult = await migrateRecordings(indexedDb, fileSystemDb, options);
			if (recordingsResult.error) {
				addLog(`[Migration] ❌ Recordings migration failed: ${recordingsResult.error.message}`);
			} else {
				results.recordings = recordingsResult.data;
			}

			// Migrate transformations
			const transformationsResult = await migrateTransformations(indexedDb, fileSystemDb, options);
			if (transformationsResult.error) {
				addLog(
					`[Migration] ❌ Transformations migration failed: ${transformationsResult.error.message}`
				);
			} else {
				results.transformations = transformationsResult.data;
			}

			// Migrate transformation runs
			const runsResult = await migrateTransformationRuns(indexedDb, fileSystemDb, options);
			if (runsResult.error) {
				addLog(`[Migration] ❌ Runs migration failed: ${runsResult.error.message}`);
			} else {
				results.runs = runsResult.data;
			}

			// Reload counts after migration
			await loadCounts();

			isRunning = false;
			addLog('[Migration] Migration process complete!');
		}

		// Dev-only: Seed mock data
		async function seedMockData() {
			if (isSeeding) return;

			isSeeding = true;
			clearLogs();
			addLog('[Seed] Starting mock data seeding...');

			const result = await seedIndexedDB({
				recordingCount: 5000,
				transformationCount: 50,
				runCount: 500,
				onProgress: addLog
			});

			addLog(
				`[Seed] ✅ Seeded ${result.recordings} recordings, ${result.transformations} transformations, ${result.runs} runs`
			);

			// Reload counts after seeding
			await loadCounts();

			isSeeding = false;
		}

		// Dev-only: Clear IndexedDB
		async function clearIndexedDB() {
			if (isClearing) return;

			isClearing = true;
			clearLogs();
			addLog('[Clear] Clearing IndexedDB...');

			await clearIDB({
				onProgress: addLog
			});

			addLog('[Clear] ✅ IndexedDB cleared');

			// Reload counts after clearing
			await loadCounts();

			isClearing = false;
		}

		return {
			get isOpen() {
				return isOpen;
			},
			setOpen(value: boolean) {
				isOpen = value;
				if (value) {
					loadCounts();
				}
			},
			open() {
				isOpen = true;
				loadCounts();
			},
			close() {
				isOpen = false;
			},
			get direction() {
				return direction;
			},
			setDirection(value: MigrationDirection) {
				direction = value;
			},
			get overwriteExisting() {
				return overwriteExisting;
			},
			toggleOverwriteExisting() {
				overwriteExisting = !overwriteExisting;
			},
			get deleteAfterMigration() {
				return deleteAfterMigration;
			},
			toggleDeleteAfterMigration() {
				deleteAfterMigration = !deleteAfterMigration;
			},
			get isRunning() {
				return isRunning;
			},
			get logs() {
				return logs;
			},
			get counts() {
				return counts;
			},
			get results() {
				return results;
			},
			startMigration,
			get isSeeding() {
				return isSeeding;
			},
			seedMockData,
			get isClearing() {
				return isClearing;
			},
			clearIndexedDB
		};
	}
</script>

<script lang="ts">
	import * as Dialog from '@repo/ui/dialog';
	import { Button } from '@repo/ui/button';
	import { Switch } from '@repo/ui/switch';
	import { Checkbox } from '@repo/ui/checkbox';
	import { Database } from '@lucide/svelte';

	let logsContainer: HTMLDivElement;

	// Auto-scroll logs to bottom
	$effect(() => {
		if (logsContainer && migrationDialog.logs.length > 0) {
			logsContainer.scrollTop = logsContainer.scrollHeight;
		}
	});

	// Check if Tauri is available
	const isTauriAvailable =
		typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && window.__TAURI_INTERNALS__;
</script>

{#if isTauriAvailable}
	<!-- Floating button -->
	<button
		class="fixed bottom-24 right-4 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-transform hover:scale-110"
		onclick={migrationDialog.open}
		aria-label="Open Migration Manager"
	>
		<Database class="h-5 w-5" />
	</button>

	<!-- Migration Dialog -->
	<Dialog.Root open={migrationDialog.isOpen} onOpenChange={migrationDialog.setOpen}>
		<Dialog.Content class="max-h-[90vh] max-w-3xl overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>Database Migration Manager</Dialog.Title>
				<Dialog.Description>
					Migrate data between IndexedDB and File System storage.
				</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-6">
				<!-- Direction Selector -->
				<div class="flex items-center justify-between rounded-lg border p-4">
					<div class="space-y-0.5">
						<label class="text-sm font-medium">Migration Direction</label>
						<p class="text-sm text-muted-foreground">
							{migrationDialog.direction === 'idb-to-fs'
								? 'IndexedDB → File System'
								: 'File System → IndexedDB'}
						</p>
					</div>
					<Switch
						checked={migrationDialog.direction === 'idb-to-fs'}
						onCheckedChange={(checked) =>
							migrationDialog.setDirection(checked ? 'idb-to-fs' : 'fs-to-idb')}
						disabled
					/>
				</div>

				<!-- Counts Display -->
				{#if migrationDialog.counts}
					<div class="rounded-lg border p-4">
						<h3 class="mb-3 text-sm font-semibold">Current Item Counts</h3>
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="font-medium">IndexedDB:</p>
								<ul class="ml-4 list-disc text-muted-foreground">
									<li>{migrationDialog.counts.indexedDb.recordings} recordings</li>
									<li>{migrationDialog.counts.indexedDb.transformations} transformations</li>
									<li>{migrationDialog.counts.indexedDb.runs} runs</li>
								</ul>
							</div>
							<div>
								<p class="font-medium">File System:</p>
								<ul class="ml-4 list-disc text-muted-foreground">
									<li>{migrationDialog.counts.fileSystem.recordings} recordings</li>
									<li>{migrationDialog.counts.fileSystem.transformations} transformations</li>
									<li>{migrationDialog.counts.fileSystem.runs} runs</li>
								</ul>
							</div>
						</div>
					</div>
				{/if}

				<!-- Migration Options -->
				<div class="space-y-3">
					<label class="mb-2 block text-sm font-medium">Options</label>
					<div class="flex items-center space-x-2">
						<Checkbox
							id="overwrite"
							checked={migrationDialog.overwriteExisting}
							onCheckedChange={migrationDialog.toggleOverwriteExisting}
						/>
						<label for="overwrite" class="text-sm">Overwrite existing items in destination</label>
					</div>
					<div class="flex items-center space-x-2">
						<Checkbox
							id="delete"
							checked={migrationDialog.deleteAfterMigration}
							onCheckedChange={migrationDialog.toggleDeleteAfterMigration}
						/>
						<label for="delete" class="text-sm">Delete items from source after migration</label>
					</div>
				</div>

				<!-- Start Migration Button -->
				<Button
					onclick={migrationDialog.startMigration}
					disabled={migrationDialog.isRunning}
					class="w-full"
				>
					{#if migrationDialog.isRunning}
						Migrating...
					{:else}
						Start Migration
					{/if}
				</Button>

				<!-- Logs Section -->
				{#if migrationDialog.logs.length > 0}
					<div class="space-y-2">
						<h3 class="text-sm font-semibold">Migration Logs</h3>
						<div
							bind:this={logsContainer}
							class="max-h-64 overflow-y-auto rounded-lg border bg-muted p-3 font-mono text-xs"
						>
							{#each migrationDialog.logs as log}
								<div class="mb-1">{log}</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Results Section -->
				{#if migrationDialog.results.recordings || migrationDialog.results.transformations || migrationDialog.results.runs}
					<div class="rounded-lg border p-4">
						<h3 class="mb-3 text-sm font-semibold">Migration Results</h3>
						<div class="space-y-2 text-sm">
							{#if migrationDialog.results.recordings}
								<div>
									<p class="font-medium">Recordings:</p>
									<p class="text-muted-foreground">
										Total: {migrationDialog.results.recordings.total} | Succeeded: {migrationDialog
											.results.recordings.succeeded} | Failed: {migrationDialog.results.recordings
											.failed} | Skipped: {migrationDialog.results.recordings.skipped} | Duration:
										{migrationDialog.results.recordings.duration.toFixed(2)}s
									</p>
								</div>
							{/if}
							{#if migrationDialog.results.transformations}
								<div>
									<p class="font-medium">Transformations:</p>
									<p class="text-muted-foreground">
										Total: {migrationDialog.results.transformations.total} | Succeeded: {migrationDialog
											.results.transformations.succeeded} | Failed: {migrationDialog.results
											.transformations.failed} | Skipped: {migrationDialog.results.transformations
											.skipped} | Duration: {migrationDialog.results.transformations.duration.toFixed(
											2
										)}s
									</p>
								</div>
							{/if}
							{#if migrationDialog.results.runs}
								<div>
									<p class="font-medium">Transformation Runs:</p>
									<p class="text-muted-foreground">
										Total: {migrationDialog.results.runs.total} | Succeeded: {migrationDialog.results
											.runs.succeeded} | Failed: {migrationDialog.results.runs.failed} | Skipped: {migrationDialog
											.results.runs.skipped} | Duration: {migrationDialog.results.runs.duration.toFixed(
											2
										)}s
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Dev-Only Seed Section -->
				{#if import.meta.env.DEV}
					<div
						class="rounded-lg border border-dashed border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950"
					>
						<h3 class="mb-3 text-sm font-semibold text-yellow-900 dark:text-yellow-100">
							Dev Tools (Testing Only)
						</h3>
						<div class="flex gap-2">
							<Button
								onclick={migrationDialog.seedMockData}
								disabled={migrationDialog.isSeeding || migrationDialog.isClearing}
								variant="outline"
								size="sm"
							>
								{#if migrationDialog.isSeeding}
									Seeding...
								{:else}
									Seed 5000 Recordings
								{/if}
							</Button>
							<Button
								onclick={migrationDialog.clearIndexedDB}
								disabled={migrationDialog.isSeeding || migrationDialog.isClearing}
								variant="outline"
								size="sm"
							>
								{#if migrationDialog.isClearing}
									Clearing...
								{:else}
									Clear IndexedDB
								{/if}
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<Dialog.Footer>
				<Button onclick={migrationDialog.close} variant="outline">Close</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
