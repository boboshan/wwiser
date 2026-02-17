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
			inlineImports: true,
			fonts: {
				sans: {
					name: 'Open Sans',
					weights: ['100', '400', '500', '600', '700', '900']
				}
			}
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
		'border-input': 'border-surface-200 dark:border-surface-700',
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
		// Focus & ring — unified across all inputs, selects, dropdowns, cards
		'ring-focus':
			'focus-visible:border-wwise focus-visible:outline-none focus-visible:ring-2 ring-wwise/20 dark:focus-visible:ring-wwise/30',
		'ring-accent': 'border-wwise ring-2 ring-wwise/20 dark:ring-wwise/30',
		'ring-accent-selected': 'border-wwise bg-wwise/5 ring-2 ring-wwise/20 dark:ring-wwise/30',
		// Input — base styling for text inputs, textareas, selects
		'input-base':
			'text-sm border border-input rounded-lg bg-surface-50 w-full transition-all ring-focus dark:bg-surface-900',
		// Dropdown — popover panel and items
		'dropdown-content':
			'mt-1.5 border rounded-xl max-h-72 w-full overflow-x-hidden overflow-y-auto p-1 border-input ring-focus bg-white shadow-lg dark:bg-surface-900 dark:shadow-2xl dark:shadow-black/40',
		'dropdown-item':
			'text-sm px-2.5 py-1.5 cursor-pointer rounded-lg transition-colors data-[highlighted]:text-wwise data-[highlighted]:bg-wwise/10 dark:data-[highlighted]:bg-wwise/15 data-[state=checked]:text-wwise data-[state=checked]:font-medium data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed',
		// Menu — popover menu panel and items
		'menu-content':
			'p-1 border rounded-xl min-w-48 border-input bg-white shadow-lg dark:bg-surface-900 dark:shadow-2xl dark:shadow-black/40 ring-focus',
		'menu-item':
			'text-sm text-muted px-2.5 py-1.5 no-underline flex gap-3 rounded-lg transition-colors items-center data-[highlighted]:text-wwise hover:text-wwise data-[highlighted]:bg-wwise/10 hover:bg-wwise/10 dark:data-[highlighted]:bg-wwise/15 dark:hover:bg-wwise/15',
		// Button variants
		'btn-action':
			'text-sm text-white font-medium px-5 rounded-lg bg-wwise flex gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 disabled:cursor-not-allowed',
		'btn-secondary':
			'text-sm text-base font-medium px-4 rounded-lg bg-surface-200 flex gap-2 h-10 transition-colors items-center justify-center dark:bg-surface-800 hover:bg-surface-300 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-surface-700',
		'btn-accent-sm':
			'text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed',
		'btn-danger-sm':
			'text-xs text-red-500 font-medium px-3 py-1.5 rounded-md bg-red-500/10 flex gap-1.5 transition-colors items-center hover:bg-red-500/20',
		'btn-cancel':
			'text-muted p-1.5 rounded-md transition-colors hover:bg-surface-200 dark:hover:bg-surface-700',
		'btn-ghost':
			'text-muted hover:text-surface-900 dark:hover:text-surface-100 bg-hover px-4 py-2 rounded-xl transition-colors font-medium',
		// Card
		card: 'bg-base border border-base rounded-2xl shadow-sm',
		'card-elevated': 'bg-elevated border border-base rounded-2xl'
	}
});
