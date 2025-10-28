/**
 * Recording intermediate representation.
 *
 * This type represents the unified interface for recordings across the application.
 * It is NOT the storage format - different storage implementations use different formats:
 *
 * - Desktop: Stores metadata in markdown files (.md) and audio in separate files (.webm, .mp3)
 * - Web: Stores in IndexedDB with serialized audio (see RecordingStoredInIndexedDB)
 *
 * Both implementations read their storage format and convert it to this intermediate
 * representation for use in the UI layer.
 *
 * @property blob - Audio data as a Blob. Populated by reading from storage:
 *   - Desktop: Reads audio file from disk and converts to Blob
 *   - Web: Deserializes serializedAudio from IndexedDB to Blob
 */
export type Recording = {
	id: string;
	title: string;
	subtitle: string;
	timestamp: string;
	createdAt: string;
	updatedAt: string;
	transcribedText: string;
	blob: Blob | undefined;
	/**
	 * Recording lifecycle status:
	 * 1. Begins in 'UNPROCESSED' state
	 * 2. Moves to 'TRANSCRIBING' while audio is being transcribed
	 * 3. Marked as 'DONE' when transcription completes
	 * 4. Marked as 'FAILED' if transcription fails
	 */
	transcriptionStatus: 'UNPROCESSED' | 'TRANSCRIBING' | 'DONE' | 'FAILED';
};

/**
 * How a recording is actually stored in IndexedDB (storage format).
 *
 * This is NOT the intermediate representation used by the UI (see Recording type).
 *
 * Key differences from Recording:
 * - No `blob` field (IndexedDB can't reliably store Blob objects)
 * - Has `serializedAudio` instead: { arrayBuffer, blobType }
 * - When reading, we deserialize this back to a Blob for the Recording type
 */
type RecordingStoredInIndexedDB = Omit<Recording, 'blob'> & {
	serializedAudio: { arrayBuffer: ArrayBuffer; blobType: string } | undefined;
};

export type RecordingsDbSchemaV5 = {
	recordings: RecordingStoredInIndexedDB;
};

export type RecordingsDbSchemaV4 = {
	recordings: Recording;
};

export type RecordingsDbSchemaV3 = {
	recordings: RecordingsDbSchemaV1['recordings'];
};

export type RecordingsDbSchemaV2 = {
	recordingMetadata: Omit<RecordingsDbSchemaV1['recordings'], 'blob'>;
	recordingBlobs: { id: string; blob: Blob | undefined };
};

export type RecordingsDbSchemaV1 = {
	recordings: {
		id: string;
		title: string;
		subtitle: string;
		timestamp: string;
		transcribedText: string;
		blob: Blob | undefined;
		/**
		 * A recording
		 * 1. Begins in an 'UNPROCESSED' state
		 * 2. Moves to 'TRANSCRIBING' while the audio is being transcribed
		 * 3. Finally is marked as 'DONE' when the transcription is complete.
		 * 4. If the transcription fails, it is marked as 'FAILED'
		 */
		transcriptionStatus: 'UNPROCESSED' | 'TRANSCRIBING' | 'DONE' | 'FAILED';
	};
};
