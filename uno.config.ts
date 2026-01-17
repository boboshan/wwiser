import { defineConfig, presetWind4, presetWebFonts } from 'unocss';

export default defineConfig({
	presets: [
		presetWind4({
			preflights: {
				reset: true
			},
			dark: 'class'
		}),
		presetWebFonts({
			provider: 'google',
			fonts: {
				sans: {
					name: 'Open Sans',
					weights: ['100', '400', '500', '600', '700', '900'],
				},
			},
		})
	],
	theme: {
		colors: {
			// Wwise Logo Blues - Primary brand color
			wwise: {
				DEFAULT: '#3069ff',
				50: '#eff4ff',
				100: '#dbe6ff',
				200: '#bfd3ff',
				300: '#93b4ff',
				400: '#6090ff',
				500: '#3069ff',
				600: '#1a4ff5',
				700: '#1340e1',
				800: '#1635b6',
				900: '#18318f',
				950: '#141f57'
			},
			// Surface colors - neutral grays for modern look
			surface: {
				50: '#fafafa',
				100: '#f4f4f5',
				200: '#e4e4e7',
				300: '#d4d4d8',
				400: '#a1a1aa',
				500: '#71717a',
				600: '#52525b',
				700: '#3f3f46',
				800: '#27272a',
				900: '#18181b',
				950: '#09090b'
			}
		}
	},
	shortcuts: {
		// Surface utilities - light/dark mode support
		'bg-base': 'bg-white dark:bg-surface-950',
		'bg-elevated': 'bg-surface-50 dark:bg-surface-900',
		'bg-muted': 'bg-surface-200 dark:bg-surface-800',
		'border-base': 'border-surface-200 dark:border-surface-800',
		'border-subtle': 'border-surface-100 dark:border-surface-800/50',
		// Text utilities - proper hierarchy with light/dark mode
		'text-base': 'text-surface-900 dark:text-surface-100',
		'text-muted': 'text-surface-500 dark:text-surface-400',
		'text-muted/60': 'text-surface-500/60 dark:text-surface-400/60',
		'text-muted/50': 'text-surface-500/50 dark:text-surface-400/50',
		'text-muted/40': 'text-surface-500/40 dark:text-surface-400/40',
		'text-muted/30': 'text-surface-500/30 dark:text-surface-400/30',
		'text-subtle': 'text-surface-400 dark:text-surface-500',
		// Interactive states
		'bg-hover': 'hover:bg-surface-100 dark:hover:bg-surface-800',
		'bg-active': 'bg-wwise/10',
		// Button variants
		'btn-primary':
			'bg-wwise hover:bg-wwise-400 active:bg-wwise-600 text-white font-semibold px-4 py-2.5 rounded-xl transition-all active:scale-98',
		'btn-ghost':
			'text-muted hover:text-base bg-hover px-4 py-2 rounded-xl transition-colors font-medium',
		// Card
		card: 'bg-base border border-base rounded-2xl shadow-sm',
		'card-elevated': 'bg-elevated border border-base rounded-2xl'
	}
});
