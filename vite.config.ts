import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from 'unocss/vite';

export default defineConfig({
	plugins: [sveltekit(), UnoCSS()],

	build: {
		// Monaco editor core is ~1-2.5 MB per chunk even with ESM tree-shaking (JSON-only).
		// It's lazily loaded on /explore only, so this is acceptable.
		chunkSizeWarningLimit: 2700
	},

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
