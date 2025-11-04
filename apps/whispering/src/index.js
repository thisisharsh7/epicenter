// Simple worker for serving static SPA assets
export default {
	async fetch(request, env) {
		return env.ASSETS.fetch(request);
	},
};
