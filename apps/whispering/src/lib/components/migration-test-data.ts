import { nanoid } from 'nanoid/non-secure';
import { DownloadServiceLive } from '../services/download';
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
import { createDbServiceWeb } from '../services/db/web';

export function createMigrationTestData() {
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
		const statuses = ['DONE', 'DONE', 'DONE', 'UNPROCESSED', 'FAILED'] as const;
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
	 * Generate a mock transformation.
	 */
	function generateMockTransformation(options: {
		index: number;
	}): Transformation {
		const { index } = options;

		const transformation = generateDefaultTransformation();

		// Vary between different transformation types
		const types = [
			{ title: 'Summarize', description: 'Create a summary of the transcript' },
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
		const transformationId = transformationIds[index % transformationIds.length];

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
		async seedIndexedDB(
			options: {
				recordingCount?: number;
				transformationCount?: number;
				runCount?: number;
				onProgress?: (message: string) => void;
			} = {},
		): Promise<{
			recordings: number;
			transformations: number;
			runs: number;
		}> {
			const {
				recordingCount = 5000,
				transformationCount = 50,
				runCount = 500,
				onProgress = console.log,
			} = options;

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
				throw new Error(`Failed to insert recordings: ${recordingsError.message}`);
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
		async clearIndexedDB(
			options: { onProgress?: (message: string) => void } = {},
		): Promise<void> {
			const { onProgress = console.log } = options;

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
