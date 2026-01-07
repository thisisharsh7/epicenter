export const PATHS = {
	MODELS: {
		async WHISPER() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'models', 'whisper');
		},
		async PARAKEET() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'models', 'parakeet');
		},
		async MOONSHINE() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'models', 'moonshine');
		},
	},
	DB: {
		async RECORDINGS() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'recordings');
		},
		async RECORDING_MD(id: string) {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'recordings', `${id}.md`);
		},
		async RECORDING_AUDIO(id: string, extension: string) {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'recordings', `${id}.${extension}`);
		},
		async RECORDING_FILE(filename: string) {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'recordings', filename);
		},
		async TRANSFORMATIONS() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'transformations');
		},
		async TRANSFORMATION_MD(id: string) {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'transformations', `${id}.md`);
		},
		async TRANSFORMATION_RUNS() {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'transformation-runs');
		},
		async TRANSFORMATION_RUN_MD(id: string) {
			const { appDataDir, join } = await import('@tauri-apps/api/path');
			const dir = await appDataDir();
			return await join(dir, 'transformation-runs', `${id}.md`);
		},
	},
};
