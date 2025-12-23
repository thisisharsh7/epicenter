import mime from 'mime';

/**
 * Gets the file extension for an audio MIME type, falling back to 'mp3' for unknown types.
 *
 * The 'mp3' fallback is intentional: transcription APIs (OpenAI, Groq, Mistral, etc.)
 * require a recognized audio extension to properly decode the file. MP3 is universally
 * supported and most APIs can auto-detect the actual format from the file contents.
 *
 * In practice, this fallback is rarely hit since audio blobs from MediaRecorder
 * always have valid MIME types like 'audio/webm' or 'audio/mp4'.
 */
export function getAudioExtension(mimeType: string): string {
	return mime.getExtension(mimeType) ?? 'mp3';
}
