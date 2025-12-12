import { defineConfig } from 'jsrepo';

export default defineConfig({
	registries: ['@ieedan/shadcn-svelte-extras'],
	paths: {
		ui: 'src',
		utils: 'src/utils',
		hooks: 'src/hooks',
		actions: 'src/actions',
	},
});
