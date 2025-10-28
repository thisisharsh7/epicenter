import { join } from '@tauri-apps/api/path';
import {
	exists,
	mkdir,
	readDir,
	readTextFile,
	remove,
	writeTextFile,
} from '@tauri-apps/plugin-fs';
import matter from 'gray-matter';
import { type } from 'arktype';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import { PATHS } from '$lib/constants/paths';
import type { Recording, Transformation, TransformationRun } from './models';
import type { DbService } from './types';
import { DbServiceErr } from './types';

/**
 * Schema validator for Recording front matter (everything except transcribedText and blob)
 * Note: YAML uses snake_case, TypeScript uses camelCase
 */
const RecordingFrontMatter = type({
	id: 'string',
	title: 'string',
	subtitle: 'string',
	timestamp: 'string',
	created_at: 'string',
	updated_at: 'string',
	transcription_status: '"UNPROCESSED" | "TRANSCRIBING" | "DONE" | "FAILED"',
});

/**
 * Convert Recording from TypeScript (camelCase) to YAML frontmatter (snake_case)
 */
function recordingToFrontMatter(recording: Omit<Recording, 'transcribedText' | 'blob'>) {
	return {
		id: recording.id,
		title: recording.title,
		subtitle: recording.subtitle,
		timestamp: recording.timestamp,
		created_at: recording.createdAt,
		updated_at: recording.updatedAt,
		transcription_status: recording.transcriptionStatus,
	};
}

/**
 * Convert markdown file (YAML frontmatter + body) to Recording
 */
function markdownToRecording(
	frontMatter: {
		id: string;
		title: string;
		subtitle: string;
		timestamp: string;
		created_at: string;
		updated_at: string;
		transcription_status: 'UNPROCESSED' | 'TRANSCRIBING' | 'DONE' | 'FAILED';
	},
	body: string,
): Recording {
	return {
		id: frontMatter.id,
		title: frontMatter.title,
		subtitle: frontMatter.subtitle,
		timestamp: frontMatter.timestamp,
		createdAt: frontMatter.created_at,
		updatedAt: frontMatter.updated_at,
		transcriptionStatus: frontMatter.transcription_status,
		transcribedText: body,
		blob: undefined,
	};
}

/**
 * File system-based database implementation for desktop.
 * Stores data as markdown files with YAML front matter.
 *
 * Directory structure:
 * - recordings/
 *   - {id}.md (metadata with YAML front matter + transcribed text)
 *   - {id}.{ext} (audio file: .wav, .opus, .mp3, etc.)
 * - transformations/
 *   - {id}.md (transformation configuration)
 * - transformation-runs/
 *   - {id}.md (execution history)
 */
export function createFileSystemDb(): DbService {
	return {
		recordings: {
			getAll: async () => {
				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();

						// Ensure directory exists
						const dirExists = await exists(recordingsPath);
						if (!dirExists) {
							await mkdir(recordingsPath, { recursive: true });
							return [];
						}

						// List all .md files
						const entries = await readDir(recordingsPath);
						const mdFiles = entries.filter((entry) =>
							entry.name?.endsWith('.md'),
						);

						// Parse each file
						const recordings = await Promise.all(
							mdFiles.map(async (entry) => {
								if (!entry.name) return null;

					const filePath = await join(recordingsPath, entry.name);
					
					const content = await readTextFile(filePath);
					
					const { data, content: body } = matter(content);
					
					// Check if data exists
					if (!data || typeof data !== 'object') {
						return null; // Skip invalid recording, don't crash the app
					}
					
					// Validate the front matter schema
					const validation = RecordingFrontMatter(data);
					if (validation instanceof type.errors) {
						return null; // Skip invalid recording, don't crash the app
					}

					return markdownToRecording(validation, body);
							}),
						);

						// Filter out any null entries and sort by timestamp (newest first)
						const validRecordings = recordings.filter(
							(r): r is Recording => r !== null,
						);
						validRecordings.sort(
							(a, b) =>
								new Date(b.timestamp).getTime() -
								new Date(a.timestamp).getTime(),
						);

						return validRecordings;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting all recordings from file system',
							cause: error,
						}),
				});
			},

			getLatest: async () => {
				return tryAsync({
					try: async () => {
						const { data: recordings, error } =
							await createFileSystemDb().recordings.getAll();
						if (error) throw error;

						if (recordings.length === 0) return null;
						return recordings[0]; // Already sorted by timestamp desc
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting latest recording from file system',
							cause: error,
						}),
				});
			},

			getTranscribingIds: async () => {
				return tryAsync({
					try: async () => {
						const { data: recordings, error } =
							await createFileSystemDb().recordings.getAll();
						if (error) throw error;

						return recordings
							.filter((r) => r.transcriptionStatus === 'TRANSCRIBING')
							.map((r) => r.id);
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error getting transcribing recording ids from file system',
							cause: error,
						}),
				});
			},

			getById: async (id: string) => {
				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();
						const mdPath = await join(recordingsPath, `${id}.md`);

						const fileExists = await exists(mdPath);
						if (!fileExists) return null;

					const content = await readTextFile(mdPath);
					const { data, content: body } = matter(content);

					// Validate the front matter schema
					const validation = RecordingFrontMatter(data);
					if (validation instanceof type.errors) {
						throw new Error(`Invalid recording front matter: ${validation.summary}`);
					}

					return markdownToRecording(validation, body);
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting recording by id from file system',
							context: { id },
							cause: error,
						}),
				});
			},

			create: async (recording: Recording) => {
				const now = new Date().toISOString();
				const recordingWithTimestamps = {
					...recording,
					createdAt: now,
					updatedAt: now,
				} satisfies Recording;

				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();

						// Ensure directory exists
						await mkdir(recordingsPath, { recursive: true });

						// 1. Write audio file if blob provided
						if (recording.blob) {
							// Try to determine extension from blob type
							const extension = getExtensionFromBlobType(recording.blob.type);
							const audioPath = await join(
								recordingsPath,
								`${recording.id}.${extension}`,
							);
							const arrayBuffer = await recording.blob.arrayBuffer();
							await writeFile(audioPath, new Uint8Array(arrayBuffer));
						}

						// 2. Create .md file with front matter
						const { transcribedText, blob, ...metadata } =
							recordingWithTimestamps;
						// Convert camelCase to snake_case for YAML
						const frontMatter = recordingToFrontMatter(metadata);
						const mdContent = matter.stringify(transcribedText || '', frontMatter);
						const mdPath = await join(recordingsPath, `${recording.id}.md`);

						// Write to temp file first, then rename (atomic operation)
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return recordingWithTimestamps;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error creating recording in file system',
							context: { recording },
							cause: error,
						}),
				});
			},

			update: async (recording: Recording) => {
				const now = new Date().toISOString();
				const recordingWithTimestamp = {
					...recording,
					updatedAt: now,
				} satisfies Recording;

				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();
						const mdPath = await join(recordingsPath, `${recording.id}.md`);

						// Check if file exists
						const fileExists = await exists(mdPath);
						if (!fileExists) {
							// Not in file system yet, create it
							const { data, error } =
								await createFileSystemDb().recordings.create(
									recordingWithTimestamp,
								);
							if (error) throw error;
							return data;
						}

						// Update .md file
						const { transcribedText, blob, ...metadata } =
							recordingWithTimestamp;
						// Convert camelCase to snake_case for YAML
						const frontMatter = recordingToFrontMatter(metadata);
						const mdContent = matter.stringify(transcribedText || '', frontMatter);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						// Note: We don't update audio files on update
						// Audio files are immutable once created

						return recordingWithTimestamp;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error updating recording in file system',
							context: { recording },
							cause: error,
						}),
				});
			},

			delete: async (recordings: Recording | Recording[]) => {
				const recordingsArray = Array.isArray(recordings)
					? recordings
					: [recordings];

				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();

						for (const recording of recordingsArray) {
							// Delete metadata file
							const mdPath = await join(recordingsPath, `${recording.id}.md`);
							const mdExists = await exists(mdPath);
							if (mdExists) {
								await remove(mdPath);
							}

							// Delete audio file (try all possible extensions)
							const audioFile = await findAudioFile(
								recordingsPath,
								recording.id,
							);
							if (audioFile) {
								const audioPath = await join(recordingsPath, audioFile);
								await remove(audioPath);
							}
						}
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error deleting recordings from file system',
							context: { recordings },
							cause: error,
						}),
				});
			},

			cleanupExpired: async ({
				recordingRetentionStrategy,
				maxRecordingCount,
			}) => {
				switch (recordingRetentionStrategy) {
					case 'keep-forever': {
						return Ok(undefined);
					}
					case 'limit-count': {
						return tryAsync({
							try: async () => {
								const { data: recordings, error } =
									await createFileSystemDb().recordings.getAll();
								if (error) throw error;

								const maxCount = Number.parseInt(maxRecordingCount);
								if (recordings.length <= maxCount) return;

								// Delete oldest recordings (already sorted newest first)
								const toDelete = recordings.slice(maxCount);
								await createFileSystemDb().recordings.delete(toDelete);
							},
							catch: (error) =>
								DbServiceErr({
									message: 'Error cleaning up expired recordings',
									context: { recordingRetentionStrategy, maxRecordingCount },
									cause: error,
								}),
						});
					}
				}
			},
		},

		transformations: {
			getAll: async () => {
				return tryAsync({
					try: async () => {
						const transformationsPath = await PATHS.DB.TRANSFORMATIONS();

						// Ensure directory exists
						const dirExists = await exists(transformationsPath);
						if (!dirExists) {
							await mkdir(transformationsPath, { recursive: true });
							return [];
						}

						// List all .md files
						const entries = await readDir(transformationsPath);
						const mdFiles = entries.filter(
							(entry) => entry.name && entry.name.endsWith('.md'),
						);

						// Parse each file
						const transformations = await Promise.all(
							mdFiles.map(async (entry) => {
								if (!entry.name) return null;

								const filePath = await join(transformationsPath, entry.name);
								const content = await readTextFile(filePath);
								const { data } = matter(content);

								return data as Transformation;
							}),
						);

						return transformations.filter(
							(t): t is Transformation => t !== null,
						);
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting all transformations from file system',
							cause: error,
						}),
				});
			},

			getById: async (id: string) => {
				return tryAsync({
					try: async () => {
						const transformationsPath = await PATHS.DB.TRANSFORMATIONS();
						const mdPath = await join(transformationsPath, `${id}.md`);

						const fileExists = await exists(mdPath);
						if (!fileExists) return null;

						const content = await readTextFile(mdPath);
						const { data } = matter(content);

						return data as Transformation;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting transformation by id from file system',
							context: { id },
							cause: error,
						}),
				});
			},

			create: async (transformation: Transformation) => {
				return tryAsync({
					try: async () => {
						const transformationsPath = await PATHS.DB.TRANSFORMATIONS();

						// Ensure directory exists
						await mkdir(transformationsPath, { recursive: true });

						// Create .md file with front matter
						const mdContent = matter.stringify('', transformation);
						const mdPath = await join(
							transformationsPath,
							`${transformation.id}.md`,
						);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return transformation;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error creating transformation in file system',
							context: { transformation },
							cause: error,
						}),
				});
			},

			update: async (transformation: Transformation) => {
				const now = new Date().toISOString();
				const transformationWithTimestamp = {
					...transformation,
					updatedAt: now,
				} satisfies Transformation;

				return tryAsync({
					try: async () => {
						const transformationsPath = await PATHS.DB.TRANSFORMATIONS();
						const mdPath = await join(
							transformationsPath,
							`${transformation.id}.md`,
						);

						// Create .md file with front matter
						const mdContent = matter.stringify('', transformationWithTimestamp);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return transformationWithTimestamp;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error updating transformation in file system',
							context: { transformation },
							cause: error,
						}),
				});
			},

			delete: async (transformations: Transformation | Transformation[]) => {
				const transformationsArray = Array.isArray(transformations)
					? transformations
					: [transformations];

				return tryAsync({
					try: async () => {
						const transformationsPath = await PATHS.DB.TRANSFORMATIONS();

						for (const transformation of transformationsArray) {
							const mdPath = await join(
								transformationsPath,
								`${transformation.id}.md`,
							);
							const fileExists = await exists(mdPath);
							if (fileExists) {
								await remove(mdPath);
							}
						}
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error deleting transformations from file system',
							context: { transformations },
							cause: error,
						}),
				});
			},
		},

		runs: {
			getById: async (id: string) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();
						const mdPath = await join(runsPath, `${id}.md`);

						const fileExists = await exists(mdPath);
						if (!fileExists) return null;

						const content = await readTextFile(mdPath);
						const { data } = matter(content);

						return data as TransformationRun;
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error getting transformation run by id from file system',
							context: { id },
							cause: error,
						}),
				});
			},

			getByTransformationId: async (transformationId: string) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						// Ensure directory exists
						const dirExists = await exists(runsPath);
						if (!dirExists) {
							await mkdir(runsPath, { recursive: true });
							return [];
						}

						// List all .md files
						const entries = await readDir(runsPath);
						const mdFiles = entries.filter(
							(entry) => entry.name && entry.name.endsWith('.md'),
						);

						// Parse each file and filter by transformationId
						const runs: TransformationRun[] = [];
						for (const entry of mdFiles) {
							if (!entry.name) continue;

							const filePath = await join(runsPath, entry.name);
							const content = await readTextFile(filePath);
							const { data } = matter(content);
							const run = data as TransformationRun;

							if (run.transformationId === transformationId) {
								runs.push(run);
							}
						}

						// Sort by startedAt (newest first)
						runs.sort(
							(a, b) =>
								new Date(b.startedAt).getTime() -
								new Date(a.startedAt).getTime(),
						);

						return runs;
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error getting transformation runs by transformation id from file system',
							context: { transformationId },
							cause: error,
						}),
				});
			},

			getByRecordingId: async (recordingId: string) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						// Ensure directory exists
						const dirExists = await exists(runsPath);
						if (!dirExists) {
							await mkdir(runsPath, { recursive: true });
							return [];
						}

						// List all .md files
						const entries = await readDir(runsPath);
						const mdFiles = entries.filter(
							(entry) => entry.name && entry.name.endsWith('.md'),
						);

						// Parse each file and filter by recordingId
						const runs: TransformationRun[] = [];
						for (const entry of mdFiles) {
							if (!entry.name) continue;

							const filePath = await join(runsPath, entry.name);
							const content = await readTextFile(filePath);
							const { data } = matter(content);
							const run = data as TransformationRun;

							if (run.recordingId === recordingId) {
								runs.push(run);
							}
						}

						// Sort by startedAt (newest first)
						runs.sort(
							(a, b) =>
								new Date(b.startedAt).getTime() -
								new Date(a.startedAt).getTime(),
						);

						return runs;
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error getting transformation runs by recording id from file system',
							context: { recordingId },
							cause: error,
						}),
				});
			},

			create: async ({ transformationId, recordingId, input }) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						// Ensure directory exists
						await mkdir(runsPath, { recursive: true });

						const now = new Date().toISOString();
						const { nanoid } = await import('nanoid/non-secure');
						const transformationRun = {
							id: nanoid(),
							transformationId,
							recordingId,
							input,
							startedAt: now,
							completedAt: null,
							status: 'running',
							stepRuns: [],
						} as TransformationRun;

						// Create .md file with front matter
						const mdContent = matter.stringify('', transformationRun);
						const mdPath = await join(runsPath, `${transformationRun.id}.md`);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return transformationRun;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error creating transformation run in file system',
							context: { transformationId, recordingId, input },
							cause: error,
						}),
				});
			},

			addStep: async (run, step) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						const now = new Date().toISOString();
						const { nanoid } = await import('nanoid/non-secure');
						const newTransformationStepRun = {
							id: nanoid(),
							stepId: step.id,
							input: step.input,
							startedAt: now,
							completedAt: null,
							status: 'running',
						} as const;

						const updatedRun: TransformationRun = {
							...run,
							stepRuns: [...run.stepRuns, newTransformationStepRun],
						};

						// Update .md file
						const mdContent = matter.stringify('', updatedRun);
						const mdPath = await join(runsPath, `${run.id}.md`);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return newTransformationStepRun;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error adding step to transformation run in file system',
							context: { run, step },
							cause: error,
						}),
				});
			},

			failStep: async (run, stepRunId, error) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						const now = new Date().toISOString();

						const failedRun = {
							...run,
							status: 'failed' as const,
							completedAt: now,
							error,
							stepRuns: run.stepRuns.map((stepRun) => {
								if (stepRun.id === stepRunId) {
									return {
										...stepRun,
										status: 'failed' as const,
										completedAt: now,
										error,
									};
								}
								return stepRun;
							}),
						};

						// Update .md file
						const mdContent = matter.stringify('', failedRun);
						const mdPath = await join(runsPath, `${run.id}.md`);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return failedRun;
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error failing step in transformation run in file system',
							context: { run, stepRunId, error },
							cause: error,
						}),
				});
			},

			completeStep: async (run, stepRunId, output) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						const now = new Date().toISOString();

						const updatedRun: TransformationRun = {
							...run,
							stepRuns: run.stepRuns.map((stepRun) => {
								if (stepRun.id === stepRunId) {
									return {
										...stepRun,
										status: 'completed',
										completedAt: now,
										output,
									};
								}
								return stepRun;
							}),
						};

						// Update .md file
						const mdContent = matter.stringify('', updatedRun);
						const mdPath = await join(runsPath, `${run.id}.md`);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return updatedRun;
					},
					catch: (error) =>
						DbServiceErr({
							message:
								'Error completing step in transformation run in file system',
							context: { run, stepRunId, output },
							cause: error,
						}),
				});
			},

			complete: async (run, output) => {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();

						const now = new Date().toISOString();

						const completedRun = {
							...run,
							status: 'completed' as const,
							completedAt: now,
							output,
						};

						// Update .md file
						const mdContent = matter.stringify('', completedRun);
						const mdPath = await join(runsPath, `${run.id}.md`);

						// Atomic write
						const tmpPath = `${mdPath}.tmp`;
						await writeTextFile(tmpPath, mdContent);
						await rename(tmpPath, mdPath);

						return completedRun;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error completing transformation run in file system',
							context: { run, output },
							cause: error,
						}),
				});
			},
		},
	};
}

/**
 * Helper function to find audio file by ID.
 * Tries multiple extensions: .wav, .opus, .mp3, .ogg
 */
async function findAudioFile(dir: string, id: string): Promise<string | null> {
	const extensions = ['.wav', '.opus', '.mp3', '.ogg'];
	for (const ext of extensions) {
		const filename = `${id}${ext}`;
		const filePath = await join(dir, filename);
		const fileExists = await exists(filePath);
		if (fileExists) return filename;
	}
	return null;
}

/**
 * Get file extension from blob type
 */
function getExtensionFromBlobType(blobType: string): string {
	const mapping: Record<string, string> = {
		'audio/wav': 'wav',
		'audio/wave': 'wav',
		'audio/x-wav': 'wav',
		'audio/opus': 'opus',
		'audio/ogg': 'ogg',
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
	};

	return mapping[blobType] || 'wav'; // Default to wav
}

/**
 * Rename/move a file atomically.
 * This is a wrapper around Tauri's fs plugin.
 */
async function rename(oldPath: string, newPath: string): Promise<void> {
	const { rename: tauriRename } = await import('@tauri-apps/plugin-fs');
	await tauriRename(oldPath, newPath);
}

/**
 * Write a file from ArrayBuffer.
 * This is a wrapper around Tauri's fs plugin.
 */
async function writeFile(path: string, data: Uint8Array): Promise<void> {
	const { writeFile: tauriWriteFile } = await import('@tauri-apps/plugin-fs');
	await tauriWriteFile(path, data);
}
