import { bootstrap } from '$lib/services/bootstrap';
import type { LayoutLoad } from './$types';

// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html for SPA mode
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
export const ssr = false;

/**
 * Root layout load function.
 *
 * Bootstraps the app by loading the registry and all workspace schemas.
 * This runs once when the app starts.
 */
export const load: LayoutLoad = async () => {
	await bootstrap();
	return {};
};
