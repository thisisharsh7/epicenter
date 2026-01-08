import { defineConfig } from 'jsrepo';

export default defineConfig({
	// configure where stuff comes from here
	registries: ['@ieedan/shadcn-svelte-extras'],
	// configure where stuff goes here
	paths: {
		ui: 'src',
		lib: 'src',
		util: 'src/utils',
		hook: 'src/hooks',
		hooks: 'src/hooks',
		$UI$: '#',
		$COMPONENTS$: '#',
		$LIB$: '#',
	},
});
