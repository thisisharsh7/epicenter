import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
	srcDir: 'src',
	modules: ['@wxt-dev/module-svelte'],
	manifest: {
		name: 'Tab Manager',
		description: 'Manage browser tabs with Epicenter',
		permissions: ['tabs', 'storage'],
		// host_permissions needed for favicons and tab info
		host_permissions: ['<all_urls>'],
	},
	vite: () => ({
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				$lib: resolve(import.meta.dirname!, 'src/lib'),
			},
		},
	}),
});
