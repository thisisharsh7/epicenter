<script module lang="ts">
	import { createFileSystemDb } from '$lib/services/db/file-system';
	import {
		getMigrationCounts,
		migrateRecordings,
		migrateTransformationRuns,
		migrateTransformations,
		type MigrationDirection,
		type MigrationResult,
	} from '$lib/services/db/migration';
	import { createDbServiceWeb } from '$lib/services/db/web';
	import { nanoid } from 'nanoid/non-secure';
	import type {
		Recording,
		RecordingStoredInIndexedDB,
		SerializedAudio,
		Transformation,
		TransformationRun,
	} from '../services/db/models';
	import {
		generateDefaultTransformation,
		generateDefaultTransformationStep,
	} from '../services/db/models';
	import { DownloadServiceLive } from '../services/download';

	const testData = createMigrationTestData();
	const migrationDialog = createMigrationDialog();

	function createMigrationTestData() {
		/**
		 * Generate a mock recording with realistic data.
		 */
		function generateMockRecording(options: {
			index: number;
			baseTimestamp: Date;
		}): RecordingStoredInIndexedDB {
			const { index, baseTimestamp } = options;

			// Vary timestamps across last 6 months
			const daysAgo = Math.floor(Math.random() * 180);
			const timestamp = new Date(baseTimestamp);
			timestamp.setDate(timestamp.getDate() - daysAgo);
			const timestampStr = timestamp.toISOString();

			// Vary transcription status
			const statuses = [
				'DONE',
				'DONE',
				'DONE',
				'UNPROCESSED',
				'FAILED',
			] as const;
			const transcriptionStatus = statuses[index % statuses.length];

			// Generate varied transcribed text lengths
			const textLengths = [
				'Short recording text.',
				'This is a medium-length recording with a bit more content to transcribe and process.',
				`This is a longer recording transcript. It contains multiple sentences and paragraphs of content. ${Array(10).fill('Lorem ipsum dolor sit amet, consectetur adipiscing elit.').join(' ')}`,
			];
			const transcribedText = textLengths[index % textLengths.length];

			const id = nanoid();
			const now = new Date().toISOString();

			return {
				id,
				title: `Recording ${index + 1}`,
				subtitle: `Mock recording #${index + 1} for testing`,
				timestamp: timestampStr,
				createdAt: now,
				updatedAt: now,
				transcribedText,
				transcriptionStatus,
				serializedAudio: generateMockAudio(),
			};
		}

		/**
		 * Generate a small mock audio ArrayBuffer (~1KB).
		 * This creates a minimal valid audio buffer for testing purposes.
		 */
		function generateMockAudio(): SerializedAudio {
			// Create a small buffer (1024 bytes = 1KB)
			const size = 1024;
			const buffer = new ArrayBuffer(size);
			const view = new Uint8Array(buffer);

			// Fill with some pseudo-random data to simulate audio
			for (let i = 0; i < size; i++) {
				view[i] = Math.floor(Math.random() * 256);
			}

			return {
				arrayBuffer: buffer,
				blobType: 'audio/webm',
			};
		}

		/**
		 * Generate a mock transformation.
		 */
		function generateMockTransformation(options: {
			index: number;
		}): Transformation {
			const { index } = options;

			const transformation = generateDefaultTransformation();

			// Vary between different transformation types
			const types = [
				{
					title: 'Summarize',
					description: 'Create a summary of the transcript',
				},
				{
					title: 'Translate to Spanish',
					description: 'Translate the text to Spanish',
				},
				{
					title: 'Extract Action Items',
					description: 'Extract action items from the meeting',
				},
				{
					title: 'Correct Grammar',
					description: 'Fix grammar and spelling errors',
				},
			];

			const type = types[index % types.length];

			transformation.title = `${type.title} ${index + 1}`;
			transformation.description = type.description;

			// Add 1-3 steps
			const numSteps = (index % 3) + 1;
			for (let i = 0; i < numSteps; i++) {
				const step = generateDefaultTransformationStep();
				step.type = i % 2 === 0 ? 'prompt_transform' : 'find_replace';

				if (step.type === 'prompt_transform') {
					step['prompt_transform.systemPromptTemplate'] =
						'You are a helpful assistant.';
					step['prompt_transform.userPromptTemplate'] =
						`${type.description} for the following text: {{input}}`;
				} else {
					step['find_replace.findText'] = 'um';
					step['find_replace.replaceText'] = '';
					step['find_replace.useRegex'] = false;
				}

				transformation.steps.push(step);
			}

			return transformation;
		}

		/**
		 * Generate a mock transformation run.
		 */
		function generateMockTransformationRun(options: {
			index: number;
			recordingIds: string[];
			transformationIds: string[];
		}): TransformationRun {
			const { index, recordingIds, transformationIds } = options;

			// Link to existing recordings and transformations
			const recordingId = recordingIds[index % recordingIds.length];
			const transformationId =
				transformationIds[index % transformationIds.length];

			const id = nanoid();
			const startedAt = new Date(
				Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
			).toISOString();

			// Vary status
			const statuses = [
				'completed',
				'completed',
				'completed',
				'failed',
				'running',
			] as const;
			const status = statuses[index % statuses.length];

			const input = `Input text for transformation run ${index + 1}. This is the snapshot of the recording at the time of transformation.`;

			const stepRuns = [];

			// Add 1-2 step runs
			const numSteps = (index % 2) + 1;
			for (let i = 0; i < numSteps; i++) {
				const stepId = nanoid();
				const stepStartedAt = new Date(
					new Date(startedAt).getTime() + i * 1000,
				).toISOString();

				if (i < numSteps - 1 || status === 'completed') {
					// Completed step
					stepRuns.push({
						id: nanoid(),
						stepId,
						startedAt: stepStartedAt,
						completedAt: new Date(
							new Date(stepStartedAt).getTime() + 500,
						).toISOString(),
						status: 'completed' as const,
						input: i === 0 ? input : `Output from step ${i}`,
						output: `Output from step ${i + 1}`,
					});
				} else if (status === 'failed') {
					// Failed step
					stepRuns.push({
						id: nanoid(),
						stepId,
						startedAt: stepStartedAt,
						completedAt: new Date(
							new Date(stepStartedAt).getTime() + 500,
						).toISOString(),
						status: 'failed' as const,
						input: i === 0 ? input : `Output from step ${i}`,
						error: 'Mock error: API rate limit exceeded',
					});
				} else {
					// Running step
					stepRuns.push({
						id: nanoid(),
						stepId,
						startedAt: stepStartedAt,
						completedAt: null,
						status: 'running' as const,
						input: i === 0 ? input : `Output from step ${i}`,
					});
				}
			}

			if (status === 'completed') {
				return {
					id,
					transformationId,
					recordingId,
					startedAt,
					completedAt: new Date(
						new Date(startedAt).getTime() + numSteps * 1000,
					).toISOString(),
					status: 'completed',
					input,
					stepRuns,
					output: stepRuns[stepRuns.length - 1]?.output || input,
				};
			}

			if (status === 'failed') {
				return {
					id,
					transformationId,
					recordingId,
					startedAt,
					completedAt: new Date(
						new Date(startedAt).getTime() + numSteps * 1000,
					).toISOString(),
					status: 'failed',
					input,
					stepRuns,
					error: 'Mock error: Transformation failed',
				};
			}

			// Running
			return {
				id,
				transformationId,
				recordingId,
				startedAt,
				completedAt: null,
				status: 'running',
				input,
				stepRuns,
			};
		}

		return {
			/**
			 * Seed IndexedDB with mock data for testing migration performance.
			 *
			 * @param options Configuration for seeding
			 * @param options.recordingCount Number of recordings to create (default: 5000)
			 * @param options.transformationCount Number of transformations to create (default: 50)
			 * @param options.runCount Number of transformation runs to create (default: 500)
			 * @returns Promise with counts of created items
			 */
			async seedIndexedDB({
				recordingCount,
				transformationCount,
				runCount,
				onProgress,
			}: {
				recordingCount: number;
				transformationCount: number;
				runCount: number;
				onProgress: (message: string) => void;
			}): Promise<{
				recordings: number;
				transformations: number;
				runs: number;
			}> {
				const startTime = performance.now();
				onProgress(
					`Starting to seed IndexedDB with ${recordingCount} recordings, ${transformationCount} transformations, and ${runCount} runs...`,
				);

				// Use the DbService interface
				const db = createDbServiceWeb({ DownloadService: DownloadServiceLive });

				const baseTimestamp = new Date();

				// Generate recordings
				onProgress(`Generating ${recordingCount} mock recordings...`);
				const recordings: RecordingStoredInIndexedDB[] = [];
				for (let i = 0; i < recordingCount; i++) {
					recordings.push(generateMockRecording({ index: i, baseTimestamp }));

					if ((i + 1) % 1000 === 0) {
						onProgress(`Generated ${i + 1}/${recordingCount} recordings`);
					}
				}

				// Convert recordings to format expected by create() method
				const recordingParams = recordings.map((rec) => {
					const { serializedAudio, ...recording } = rec as Recording & {
						serializedAudio: SerializedAudio;
					};
					return {
						recording: recording as Recording,
						audio: new Blob([serializedAudio.arrayBuffer], {
							type: serializedAudio.blobType,
						}),
					};
				});

				// Bulk insert recordings
				onProgress('Inserting recordings into IndexedDB...');
				const { error: recordingsError } =
					await db.recordings.create(recordingParams);
				if (recordingsError) {
					throw new Error(
						`Failed to insert recordings: ${recordingsError.message}`,
					);
				}
				onProgress(`✓ Inserted ${recordings.length} recordings`);

				const recordingIds = recordings.map((r) => r.id);

				// Generate transformations
				onProgress(`Generating ${transformationCount} mock transformations...`);
				const transformations: Transformation[] = [];
				for (let i = 0; i < transformationCount; i++) {
					transformations.push(generateMockTransformation({ index: i }));
				}

				// Bulk insert transformations
				onProgress('Inserting transformations into IndexedDB...');
				const { error: transformationsError } =
					await db.transformations.create(transformations);
				if (transformationsError) {
					throw new Error(
						`Failed to insert transformations: ${transformationsError.message}`,
					);
				}
				onProgress(`✓ Inserted ${transformations.length} transformations`);

				const transformationIds = transformations.map((t) => t.id);

				// Generate transformation runs
				onProgress(`Generating ${runCount} mock transformation runs...`);
				const runs: TransformationRun[] = [];
				for (let i = 0; i < runCount; i++) {
					runs.push(
						generateMockTransformationRun({
							index: i,
							recordingIds,
							transformationIds,
						}),
					);

					if ((i + 1) % 100 === 0) {
						onProgress(`Generated ${i + 1}/${runCount} runs`);
					}
				}

				// Bulk insert runs
				onProgress('Inserting transformation runs into IndexedDB...');
				const runsParams = runs.map((run) => ({ run }));
				const { error: runsError } = await db.runs.create(runsParams);
				if (runsError) {
					throw new Error(
						`Failed to insert transformation runs: ${runsError.message}`,
					);
				}
				onProgress(`✓ Inserted ${runs.length} transformation runs`);

				const endTime = performance.now();
				const duration = ((endTime - startTime) / 1000).toFixed(2);

				onProgress(`✓ Seeding complete in ${duration}s!`);
				onProgress(`  - ${recordings.length} recordings`);
				onProgress(`  - ${transformations.length} transformations`);
				onProgress(`  - ${runs.length} transformation runs`);

				return {
					recordings: recordings.length,
					transformations: transformations.length,
					runs: runs.length,
				};
			},

			/**
			 * Clear all data from IndexedDB (useful for testing).
			 */
			async clearIndexedDB({
				onProgress,
			}: {
				onProgress: (message: string) => void;
			}): Promise<void> {
				onProgress('Clearing IndexedDB...');

				const db = createDbServiceWeb({ DownloadService: DownloadServiceLive });

				// Clear all tables in parallel
				const [recordingsResult, transformationsResult, runsResult] =
					await Promise.all([
						db.recordings.clear(),
						db.transformations.clear(),
						db.runs.clear(),
					]);

				// Check for errors
				if (recordingsResult.error) {
					throw new Error(
						`Failed to clear recordings: ${recordingsResult.error.message}`,
					);
				}
				onProgress('✓ Cleared recordings');

				if (transformationsResult.error) {
					throw new Error(
						`Failed to clear transformations: ${transformationsResult.error.message}`,
					);
				}
				onProgress('✓ Cleared transformations');

				if (runsResult.error) {
					throw new Error(
						`Failed to clear transformation runs: ${runsResult.error.message}`,
					);
				}
				onProgress('✓ Cleared transformation runs');

				onProgress('✓ IndexedDB cleared successfully');
			},
		};
	}

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
			runs: null,
		});
		let isSeeding = $state(false);
		let isClearing = $state(false);

		const fileSystemDb = createFileSystemDb();
		const indexedDb = createDbServiceWeb({
			DownloadService: DownloadServiceLive,
		});

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
				`[Counts] IndexedDB: ${data.indexedDb.recordings} recordings, ${data.indexedDb.transformations} transformations, ${data.indexedDb.runs} runs`,
			);
			addLog(
				`[Counts] File System: ${data.fileSystem.recordings} recordings, ${data.fileSystem.transformations} transformations, ${data.fileSystem.runs} runs`,
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
				onProgress: addLog,
			};

			// Migrate recordings
			const recordingsResult = await migrateRecordings(
				indexedDb,
				fileSystemDb,
				options,
			);
			if (recordingsResult.error) {
				addLog(
					`[Migration] ❌ Recordings migration failed: ${recordingsResult.error.message}`,
				);
			} else {
				results.recordings = recordingsResult.data;
			}

			// Migrate transformations
			const transformationsResult = await migrateTransformations(
				indexedDb,
				fileSystemDb,
				options,
			);
			if (transformationsResult.error) {
				addLog(
					`[Migration] ❌ Transformations migration failed: ${transformationsResult.error.message}`,
				);
			} else {
				results.transformations = transformationsResult.data;
			}

			// Migrate transformation runs
			const runsResult = await migrateTransformationRuns(
				indexedDb,
				fileSystemDb,
				options,
			);
			if (runsResult.error) {
				addLog(
					`[Migration] ❌ Runs migration failed: ${runsResult.error.message}`,
				);
			} else {
				results.runs = runsResult.data;
			}

			await loadCounts();
			isRunning = false;
			addLog('[Migration] Migration process complete!');
		}

		async function seedMockData() {
			if (isSeeding) return;

			isSeeding = true;
			clearLogs();
			addLog('[Seed] Starting mock data seeding...');

			const result = await testData.seedIndexedDB({
				recordingCount: 5000,
				transformationCount: 50,
				runCount: 500,
				onProgress: addLog,
			});

			addLog(
				`[Seed] ✅ Seeded ${result.recordings} recordings, ${result.transformations} transformations, ${result.runs} runs`,
			);

			await loadCounts();
			isSeeding = false;
		}

		async function clearIndexedDB() {
			if (isClearing) return;

			isClearing = true;
			clearLogs();
			addLog('[Clear] Clearing IndexedDB...');

			await testData.clearIndexedDB({ onProgress: addLog });

			addLog('[Clear] ✅ IndexedDB cleared');
			await loadCounts();
			isClearing = false;
		}

		return {
			get isOpen() {
				return isOpen;
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
			clearIndexedDB,
		};
	}
</script>

<script lang="ts">
	import { Database } from '@lucide/svelte';
	import { Button } from '@repo/ui/button';
	import { Checkbox } from '@repo/ui/checkbox';
	import * as Dialog from '@repo/ui/dialog';
	import { Switch } from '@repo/ui/switch';

	let logsContainer: HTMLDivElement;

	// Auto-scroll logs to bottom
	$effect(() => {
		if (logsContainer && migrationDialog.logs.length > 0) {
			logsContainer.scrollTop = logsContainer.scrollHeight;
		}
	});
</script>

<button
	class="fixed bottom-24 right-4 rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-transform hover:scale-110"
	onclick={migrationDialog.open}
	aria-label="Open Migration Manager"
>
	<Database class="h-5 w-5" />
</button>

<Dialog.Root
	open={migrationDialog.isOpen}
	onOpenChange={(open) =>
		open ? migrationDialog.open() : migrationDialog.close()}
>
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
					<div class="text-sm font-medium">Migration Direction</div>
					<p class="text-sm text-muted-foreground">
						{migrationDialog.direction === 'idb-to-fs'
							? 'IndexedDB → File System'
							: 'File System → IndexedDB'}
					</p>
				</div>
				<Switch
					checked={migrationDialog.direction === 'idb-to-fs'}
					onCheckedChange={(checked: boolean) => {
						const newDirection: MigrationDirection = checked
							? 'idb-to-fs'
							: 'fs-to-idb';
						migrationDialog.setDirection(newDirection);
					}}
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
								<li>
									{migrationDialog.counts.indexedDb.recordings} recordings
								</li>
								<li>
									{migrationDialog.counts.indexedDb.transformations} transformations
								</li>
								<li>{migrationDialog.counts.indexedDb.runs} runs</li>
							</ul>
						</div>
						<div>
							<p class="font-medium">File System:</p>
							<ul class="ml-4 list-disc text-muted-foreground">
								<li>
									{migrationDialog.counts.fileSystem.recordings} recordings
								</li>
								<li>
									{migrationDialog.counts.fileSystem.transformations} transformations
								</li>
								<li>{migrationDialog.counts.fileSystem.runs} runs</li>
							</ul>
						</div>
					</div>
				</div>
			{/if}

			<!-- Migration Options -->
			<div class="space-y-3">
				<div class="mb-2 text-sm font-medium">Options</div>
				<div class="flex items-center space-x-2">
					<Checkbox
						id="overwrite"
						checked={migrationDialog.overwriteExisting}
						onCheckedChange={migrationDialog.toggleOverwriteExisting}
					/>
					<label for="overwrite" class="text-sm"
						>Overwrite existing items in destination</label
					>
				</div>
				<div class="flex items-center space-x-2">
					<Checkbox
						id="delete"
						checked={migrationDialog.deleteAfterMigration}
						onCheckedChange={migrationDialog.toggleDeleteAfterMigration}
					/>
					<label for="delete" class="text-sm"
						>Delete items from source after migration</label
					>
				</div>
			</div>

			<Button
				onclick={migrationDialog.startMigration}
				disabled={migrationDialog.isRunning}
				class="w-full"
			>
				{migrationDialog.isRunning ? 'Migrating...' : 'Start Migration'}
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
							{@const r = migrationDialog.results.recordings}
							<div>
								<p class="font-medium">Recordings:</p>
								<p class="text-muted-foreground">
									Total: {r.total} | Succeeded: {r.succeeded} | Failed: {r.failed}
									| Skipped: {r.skipped} | Duration: {r.duration.toFixed(2)}s
								</p>
							</div>
						{/if}
						{#if migrationDialog.results.transformations}
							{@const t = migrationDialog.results.transformations}
							<div>
								<p class="font-medium">Transformations:</p>
								<p class="text-muted-foreground">
									Total: {t.total} | Succeeded: {t.succeeded} | Failed: {t.failed}
									| Skipped: {t.skipped} | Duration: {t.duration.toFixed(2)}s
								</p>
							</div>
						{/if}
						{#if migrationDialog.results.runs}
							{@const r = migrationDialog.results.runs}
							<div>
								<p class="font-medium">Transformation Runs:</p>
								<p class="text-muted-foreground">
									Total: {r.total} | Succeeded: {r.succeeded} | Failed: {r.failed}
									| Skipped: {r.skipped} | Duration: {r.duration.toFixed(2)}s
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
					<h3
						class="mb-3 text-sm font-semibold text-yellow-900 dark:text-yellow-100"
					>
						Dev Tools (Testing Only)
					</h3>
					<div class="flex gap-2">
						<Button
							onclick={migrationDialog.seedMockData}
							disabled={migrationDialog.isSeeding || migrationDialog.isClearing}
							variant="outline"
							size="sm"
						>
							{migrationDialog.isSeeding
								? 'Seeding...'
								: 'Seed 5000 Recordings'}
						</Button>
						<Button
							onclick={migrationDialog.clearIndexedDB}
							disabled={migrationDialog.isSeeding || migrationDialog.isClearing}
							variant="outline"
							size="sm"
						>
							{migrationDialog.isClearing ? 'Clearing...' : 'Clear IndexedDB'}
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
