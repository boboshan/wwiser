import { defineConfig, presetWind4 } from 'unocss';

export default defineConfig({
	presets: [
		presetWind4({
			preflights: {
				reset: true
			},
			dark: 'class'
		})
	],
	theme: {
		colors: {
			// Wwise Logo Blues
			wwise: {
				DEFAULT: '#3069ff',
				50: '#e8f0ff',
				100: '#d4e2ff',
				200: '#b0c8ff',
				300: '#8baeff',
				400: '#6895ff',
				500: '#3069ff',
				600: '#2654ff',
				700: '#2444f0',
				800: '#243dd8',
				900: '#1a2eb0'
			},
			// Surface colors - neutral with very subtle cool hint
			surface: {
				50: '#fafaf9',
				100: '#f5f5f4',
				200: '#e6e5e3',
				300: '#d5d4d1',
				400: '#a5a4a0',
				500: '#757471',
				600: '#545350',
				700: '#403f3d',
				800: '#2a2928',
				900: '#1c1b1a',
				950: '#121111'
			}
		}
	},
	shortcuts: {
		// Surface utilities - light/dark mode support
		'bg-base': 'bg-white dark:bg-surface-950',
		'bg-elevated': 'bg-surface-50 dark:bg-surface-900',
		'bg-muted': 'bg-surface-100 dark:bg-surface-800',
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
