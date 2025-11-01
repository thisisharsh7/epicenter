import { tryAsync, type Result } from 'wellcrafted/result';
import type { DbService, DbServiceError } from './types';
import { DbServiceErr } from './types';

/**
 * Direction of migration: IndexedDB to File System (or vice versa in future)
 */
export type MigrationDirection = 'idb-to-fs';

/**
 * Options for migration operations
 */
export type MigrationOptions = {
	direction: MigrationDirection;
	overwriteExisting: boolean;
	deleteAfterMigration: boolean;
	onProgress?: (message: string) => void;
};

/**
 * Result of a migration operation
 */
export type MigrationResult = {
	total: number;
	succeeded: number;
	failed: number;
	skipped: number;
	duration: number;
};

/**
 * Batch size for processing items (prevents memory issues with large datasets)
 */
const BATCH_SIZE = 100;

/**
 * Migrate recordings between IndexedDB and file system.
 * Processes items in batches of 100 to prevent memory issues.
 *
 * @param indexedDb - IndexedDB service instance
 * @param fileSystemDb - File system service instance
 * @param options - Migration configuration
 * @returns Result with counts and timing
 */
export async function migrateRecordings(
	indexedDb: DbService,
	fileSystemDb: DbService,
	options: MigrationOptions,
): Promise<Result<MigrationResult, DbServiceError>> {
	const { direction, overwriteExisting, deleteAfterMigration, onProgress } = options;
	const startTime = performance.now();

	return tryAsync({
		try: async () => {
			if (direction !== 'idb-to-fs') {
				throw new Error(`Direction ${direction} not yet implemented for recordings`);
			}

			onProgress?.('[Migration] Starting recordings migration (IDB → FS)...');

			// Get all recordings from source
			const { data: recordings, error: getError } = await indexedDb.recordings.getAll();

			if (getError) {
				throw getError;
			}

			if (!recordings || recordings.length === 0) {
				onProgress?.('[Migration] No recordings to migrate');
				return {
					total: 0,
					succeeded: 0,
					failed: 0,
					skipped: 0,
					duration: (performance.now() - startTime) / 1000,
				};
			}

			const total = recordings.length;
			let succeeded = 0;
			let failed = 0;
			let skipped = 0;

			onProgress?.(`[Migration] Found ${total} recordings in IndexedDB`);
			onProgress?.(`[Migration] Processing in batches of ${BATCH_SIZE}...`);

			// Process in batches
			for (let i = 0; i < recordings.length; i += BATCH_SIZE) {
				const batch = recordings.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(recordings.length / BATCH_SIZE);

				onProgress?.(`[Migration] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);

				for (const recording of batch) {
					// Check if already exists in destination
					const { data: existing } = await fileSystemDb.recordings.getById(recording.id);

					if (existing && !overwriteExisting) {
						skipped++;
						continue;
					}

					// Get audio blob from IndexedDB
					const { data: audio, error: audioError } = await indexedDb.recordings.getAudioBlob(recording.id);

					if (audioError || !audio) {
						onProgress?.(`[Migration] ⚠️  Failed to get audio for recording ${recording.id}`);
						failed++;
						continue;
					}

					// Create in file system
					const { error: createError } = await fileSystemDb.recordings.create({
						recording,
						audio,
					});

					if (createError) {
						onProgress?.(`[Migration] ⚠️  Failed to create recording ${recording.id} in file system`);
						failed++;
						continue;
					}

					// Success!
					succeeded++;

					// Delete from source if requested
					if (deleteAfterMigration) {
						await indexedDb.recordings.delete([recording]);
					}
				}

				// Log batch completion
				const processed = Math.min(i + BATCH_SIZE, recordings.length);
				onProgress?.(`[Migration] Progress: ${processed}/${total} processed (${succeeded} succeeded, ${failed} failed, ${skipped} skipped)`);
			}

			const duration = (performance.now() - startTime) / 1000;
			const successRate = ((succeeded / total) * 100).toFixed(1);

			onProgress?.('[Migration] ==========================================');
			onProgress?.(`[Migration] Recordings migration complete in ${duration.toFixed(2)}s`);
			onProgress?.(`[Migration] Total: ${total} | Succeeded: ${succeeded} | Failed: ${failed} | Skipped: ${skipped}`);
			onProgress?.(`[Migration] Success rate: ${successRate}%`);
			onProgress?.('[Migration] ==========================================');

			return {
				total,
				succeeded,
				failed,
				skipped,
				duration,
			};
		},
		catch: (error) => {
			onProgress?.(`[Migration] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			throw DbServiceErr({
				message: 'Failed to migrate recordings',
				cause: error,
			});
		},
	});
}

/**
 * Migrate transformations between IndexedDB and file system.
 * Processes items in batches of 100 to prevent memory issues.
 */
export async function migrateTransformations(
	indexedDb: DbService,
	fileSystemDb: DbService,
	options: MigrationOptions,
): Promise<Result<MigrationResult, DbServiceError>> {
	const { direction, overwriteExisting, deleteAfterMigration, onProgress } = options;
	const startTime = performance.now();

	return tryAsync({
		try: async () => {
			if (direction !== 'idb-to-fs') {
				throw new Error(`Direction ${direction} not yet implemented for transformations`);
			}

			onProgress?.('[Migration] Starting transformations migration (IDB → FS)...');

			// Get all transformations from source
			const { data: transformations, error: getError } = await indexedDb.transformations.getAll();

			if (getError) {
				throw getError;
			}

			if (!transformations || transformations.length === 0) {
				onProgress?.('[Migration] No transformations to migrate');
				return {
					total: 0,
					succeeded: 0,
					failed: 0,
					skipped: 0,
					duration: (performance.now() - startTime) / 1000,
				};
			}

			const total = transformations.length;
			let succeeded = 0;
			let failed = 0;
			let skipped = 0;

			onProgress?.(`[Migration] Found ${total} transformations in IndexedDB`);
			onProgress?.(`[Migration] Processing in batches of ${BATCH_SIZE}...`);

			// Process in batches
			for (let i = 0; i < transformations.length; i += BATCH_SIZE) {
				const batch = transformations.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(transformations.length / BATCH_SIZE);

				onProgress?.(`[Migration] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);

				for (const transformation of batch) {
					// Check if already exists in destination
					const { data: existing } = await fileSystemDb.transformations.getById(transformation.id);

					if (existing && !overwriteExisting) {
						skipped++;
						continue;
					}

					// Create in file system
					const { error: createError } = await fileSystemDb.transformations.create(transformation);

					if (createError) {
						onProgress?.(`[Migration] ⚠️  Failed to create transformation ${transformation.id} in file system`);
						failed++;
						continue;
					}

					// Success!
					succeeded++;

					// Delete from source if requested
					if (deleteAfterMigration) {
						await indexedDb.transformations.delete([transformation]);
					}
				}

				// Log batch completion
				const processed = Math.min(i + BATCH_SIZE, transformations.length);
				onProgress?.(`[Migration] Progress: ${processed}/${total} processed (${succeeded} succeeded, ${failed} failed, ${skipped} skipped)`);
			}

			const duration = (performance.now() - startTime) / 1000;
			const successRate = ((succeeded / total) * 100).toFixed(1);

			onProgress?.('[Migration] ==========================================');
			onProgress?.(`[Migration] Transformations migration complete in ${duration.toFixed(2)}s`);
			onProgress?.(`[Migration] Total: ${total} | Succeeded: ${succeeded} | Failed: ${failed} | Skipped: ${skipped}`);
			onProgress?.(`[Migration] Success rate: ${successRate}%`);
			onProgress?.('[Migration] ==========================================');

			return {
				total,
				succeeded,
				failed,
				skipped,
				duration,
			};
		},
		catch: (error) => {
			onProgress?.(`[Migration] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			throw DbServiceErr({
				message: 'Failed to migrate transformations',
				cause: error,
			});
		},
	});
}

/**
 * Migrate transformation runs between IndexedDB and file system.
 * Processes items in batches of 100 to prevent memory issues.
 */
export async function migrateTransformationRuns(
	indexedDb: DbService,
	fileSystemDb: DbService,
	options: MigrationOptions,
): Promise<Result<MigrationResult, DbServiceError>> {
	const { direction, overwriteExisting, deleteAfterMigration, onProgress } = options;
	const startTime = performance.now();

	return tryAsync({
		try: async () => {
			if (direction !== 'idb-to-fs') {
				throw new Error(`Direction ${direction} not yet implemented for transformation runs`);
			}

			onProgress?.('[Migration] Starting transformation runs migration (IDB → FS)...');

			// Get all runs from source
			const { data: runs, error: getError } = await indexedDb.runs.getAll();

			if (getError) {
				throw getError;
			}

			if (!runs || runs.length === 0) {
				onProgress?.('[Migration] No transformation runs to migrate');
				return {
					total: 0,
					succeeded: 0,
					failed: 0,
					skipped: 0,
					duration: (performance.now() - startTime) / 1000,
				};
			}

			const total = runs.length;
			let succeeded = 0;
			let failed = 0;
			let skipped = 0;

			onProgress?.(`[Migration] Found ${total} transformation runs in IndexedDB`);
			onProgress?.(`[Migration] Processing in batches of ${BATCH_SIZE}...`);

			// Process in batches
			for (let i = 0; i < runs.length; i += BATCH_SIZE) {
				const batch = runs.slice(i, i + BATCH_SIZE);
				const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(runs.length / BATCH_SIZE);

				onProgress?.(`[Migration] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)...`);

				for (const run of batch) {
					// Check if already exists in destination
					const { data: existing } = await fileSystemDb.runs.getById(run.id);

					if (existing && !overwriteExisting) {
						skipped++;
						continue;
					}

					// Create in file system
					const { error: createError } = await fileSystemDb.runs.create({
						transformationId: run.transformationId,
						recordingId: run.recordingId,
						input: run.input,
					});

					if (createError) {
						onProgress?.(`[Migration] ⚠️  Failed to create transformation run ${run.id} in file system`);
						failed++;
						continue;
					}

					// Success!
					succeeded++;

					// Delete from source if requested
					if (deleteAfterMigration) {
						await indexedDb.runs.delete([run]);
					}
				}

				// Log batch completion
				const processed = Math.min(i + BATCH_SIZE, runs.length);
				onProgress?.(`[Migration] Progress: ${processed}/${total} processed (${succeeded} succeeded, ${failed} failed, ${skipped} skipped)`);
			}

			const duration = (performance.now() - startTime) / 1000;
			const successRate = ((succeeded / total) * 100).toFixed(1);

			onProgress?.('[Migration] ==========================================');
			onProgress?.(`[Migration] Transformation runs migration complete in ${duration.toFixed(2)}s`);
			onProgress?.(`[Migration] Total: ${total} | Succeeded: ${succeeded} | Failed: ${failed} | Skipped: ${skipped}`);
			onProgress?.(`[Migration] Success rate: ${successRate}%`);
			onProgress?.('[Migration] ==========================================');

			return {
				total,
				succeeded,
				failed,
				skipped,
				duration,
			};
		},
		catch: (error) => {
			onProgress?.(`[Migration] ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			throw DbServiceErr({
				message: 'Failed to migrate transformation runs',
				cause: error,
			});
		},
	});
}

/**
 * Get counts of items in both storage systems.
 * Useful for showing users what data exists where.
 */
export async function getMigrationCounts(
	indexedDb: DbService,
	fileSystemDb: DbService,
): Promise<
	Result<
		{
			indexedDb: {
				recordings: number;
				transformations: number;
				runs: number;
			};
			fileSystem: {
				recordings: number;
				transformations: number;
				runs: number;
			};
		},
		DbServiceError
	>
> {
	return tryAsync({
		try: async () => {
			// Get IndexedDB counts
			const [idbRecordings, idbTransformations, idbRuns] = await Promise.all([
				indexedDb.recordings.getCount(),
				indexedDb.transformations.getCount(),
				indexedDb.runs.getCount(),
			]);

			// Get File System counts
			const [fsRecordings, fsTransformations, fsRuns] = await Promise.all([
				fileSystemDb.recordings.getCount(),
				fileSystemDb.transformations.getCount(),
				fileSystemDb.runs.getCount(),
			]);

			return {
				indexedDb: {
					recordings: idbRecordings.data ?? 0,
					transformations: idbTransformations.data ?? 0,
					runs: idbRuns.data ?? 0,
				},
				fileSystem: {
					recordings: fsRecordings.data ?? 0,
					transformations: fsTransformations.data ?? 0,
					runs: fsRuns.data ?? 0,
				},
			};
		},
		catch: (error) => {
			throw DbServiceErr({
				message: 'Failed to get migration counts',
				cause: error,
			});
		},
	});
}
