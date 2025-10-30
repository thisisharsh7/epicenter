import { convertFileSrc } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import {
	exists,
	mkdir,
	readDir,
	readTextFile,
	remove,
	writeTextFile,
} from '@tauri-apps/plugin-fs';
import { type } from 'arktype';
import matter from 'gray-matter';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import { getExtensionFromMimeType } from '$lib/constants/mime';
import { PATHS } from '$lib/constants/paths';
import * as services from '$lib/services';
import type { Recording, Transformation, TransformationRun } from './models';
import type { DbService } from './types';
import { DbServiceErr } from './types';

/**
 * Schema validator for Recording front matter (everything except transcribedText)
 */
const RecordingFrontMatter = type({
	id: 'string',
	title: 'string',
	subtitle: 'string',
	timestamp: 'string',
	createdAt: 'string',
	updatedAt: 'string',
	transcriptionStatus: '"UNPROCESSED" | "TRANSCRIBING" | "DONE" | "FAILED"',
});

type RecordingFrontMatter = typeof RecordingFrontMatter.infer;

/**
 * Convert Recording to markdown format (frontmatter + body)
 */
function recordingToMarkdown(recording: Recording): string {
	const { transcribedText, ...frontMatter } = recording;
	return matter.stringify(transcribedText ?? '', frontMatter);
}

/**
 * Convert markdown file (YAML frontmatter + body) to Recording
 */
function markdownToRecording({
	frontMatter,
	body,
}: {
	frontMatter: RecordingFrontMatter;
	body: string;
}): Recording {
	return {
		...frontMatter,
		transcribedText: body,
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
			async getAll() {
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
								const frontMatter = RecordingFrontMatter(data);
								if (frontMatter instanceof type.errors) {
									return null; // Skip invalid recording, don't crash the app
								}

								return markdownToRecording({ frontMatter, body });
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

			async getLatest() {
				return tryAsync({
					try: async () => {
						const { data: recordings, error } = await this.getAll();
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

			async getTranscribingIds() {
				return tryAsync({
					try: async () => {
						const { data: recordings, error } = await this.getAll();
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

			async getById(id: string) {
				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();
						const mdPath = await join(recordingsPath, `${id}.md`);

						const fileExists = await exists(mdPath);
						if (!fileExists) return null;

						const content = await readTextFile(mdPath);
						const { data, content: body } = matter(content);

						// Validate the front matter schema
						const frontMatter = RecordingFrontMatter(data);
						if (frontMatter instanceof type.errors) {
							throw new Error(
								`Invalid recording front matter: ${frontMatter.summary}`,
							);
						}

						return markdownToRecording({ frontMatter, body });
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting recording by id from file system',
							context: { id },
							cause: error,
						}),
				});
			},

			async create({ recording, audio }) {
				const now = new Date().toISOString();
				const recordingWithTimestamps = {
					...recording,
					createdAt: 'createdAt' in recording ? recording.createdAt : now,
					updatedAt: 'updatedAt' in recording ? recording.updatedAt : now,
				} satisfies Recording;

				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();

						// Ensure directory exists
						await mkdir(recordingsPath, { recursive: true });

						// 1. Write audio file
						const extension = getExtensionFromMimeType(audio.type);
						const audioPath = await join(
							recordingsPath,
							`${recording.id}.${extension}`,
						);
						const arrayBuffer = await audio.arrayBuffer();
						await writeFile(audioPath, new Uint8Array(arrayBuffer));

						// 2. Create .md file with front matter
						const mdContent = recordingToMarkdown(recordingWithTimestamps);
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

			async update(recording) {
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
							throw new Error(
								`Cannot update recording ${recording.id}: file does not exist. Use create() to create new recordings.`,
							);
						}

						// Update .md file
						const mdContent = recordingToMarkdown(recordingWithTimestamp);

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

			async delete(recordings) {
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

			async cleanupExpired({ recordingRetentionStrategy, maxRecordingCount }) {
				switch (recordingRetentionStrategy) {
					case 'keep-forever': {
						return Ok(undefined);
					}
					case 'limit-count': {
						return tryAsync({
							try: async () => {
								const { data: recordings, error } = await this.getAll();
								if (error) throw error;

								const maxCount = Number.parseInt(maxRecordingCount);
								if (recordings.length <= maxCount) return;

								// Delete oldest recordings (already sorted newest first)
								const toDelete = recordings.slice(maxCount);
								await this.delete(toDelete);
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

			async getAudioBlob(recordingId: string) {
				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();
						const audioFile = await findAudioFile(recordingsPath, recordingId);

						if (!audioFile) {
							throw new Error(
								`Audio file not found for recording ${recordingId}`,
							);
						}

						const audioPath = await join(recordingsPath, audioFile);

						// Use existing services.fs.pathToBlob utility
						const { data: blob, error } =
							await services.fs.pathToBlob(audioPath);
						if (error) throw error;

						return blob;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting audio blob from file system',
							context: { recordingId },
							cause: error,
						}),
				});
			},

			async ensureAudioPlaybackUrl(recordingId: string) {
				return tryAsync({
					try: async () => {
						const recordingsPath = await PATHS.DB.RECORDINGS();
						const audioFile = await findAudioFile(recordingsPath, recordingId);

						if (!audioFile) {
							throw new Error(
								`Audio file not found for recording ${recordingId}`,
							);
						}

						const audioPath = await join(recordingsPath, audioFile);
						const assetUrl = convertFileSrc(audioPath);

						return assetUrl;
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error getting audio playback URL from file system',
							context: { recordingId },
							cause: error,
						}),
				});
			},

			revokeAudioUrl(_recordingId: string) {
				// No-op on desktop, URLs are asset:// protocol managed by Tauri
			},
		},

		transformations: {
			async getAll() {
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

			async getById(id: string) {
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

			async create(transformation: Transformation) {
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

			async update(transformation: Transformation) {
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

			async delete(transformations: Transformation | Transformation[]) {
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
			async getById(id: string) {
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

			async getByTransformationId(transformationId: string) {
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

			async getByRecordingId(recordingId: string) {
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

			async create({ transformationId, recordingId, input }) {
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

			async addStep(run, step) {
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

			async failStep(run, stepRunId, error) {
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

			async completeStep(run, stepRunId, output) {
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

			async complete(run, output) {
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

			async delete(runs) {
				return tryAsync({
					try: async () => {
						const runsPath = await PATHS.DB.TRANSFORMATION_RUNS();
						const runsArray = Array.isArray(runs) ? runs : [runs];

						// Delete each run's .md file
						await Promise.all(
							runsArray.map(async (run) => {
								const mdPath = await join(runsPath, `${run.id}.md`);
								const fileExists = await exists(mdPath);
								if (fileExists) {
									await remove(mdPath);
								}
							}),
						);
					},
					catch: (error) =>
						DbServiceErr({
							message: 'Error deleting transformation runs from file system',
							context: { runs },
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
