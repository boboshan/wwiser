import { browser } from '$app/environment';

function createThemeStore() {
	let theme = $state<'light' | 'dark' | 'system'>('system');
	let resolvedTheme = $state<'light' | 'dark'>('dark');

	function init() {
		if (!browser) return;

		const stored = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
		theme = stored || 'system';

		// Listen for system preference changes
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const updateResolved = () => {
			if (theme === 'system') {
				resolvedTheme = mediaQuery.matches ? 'dark' : 'light';
			} else {
				resolvedTheme = theme;
			}
			apply();
		};

		mediaQuery.addEventListener('change', updateResolved);
		updateResolved();
	}

	function apply() {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
	}

	function setTheme(newTheme: 'light' | 'dark' | 'system') {
		theme = newTheme;
		localStorage.setItem('theme', newTheme);

		if (theme === 'system') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			resolvedTheme = prefersDark ? 'dark' : 'light';
		} else {
			resolvedTheme = theme;
		}
		apply();
	}

	function toggle() {
		// Cycle: light -> dark -> system -> light
		if (theme === 'light') {
			setTheme('dark');
		} else if (theme === 'dark') {
			setTheme('system');
		} else {
			setTheme('light');
		}
	}

	return {
		get theme() {
			return theme;
		},
		get resolved() {
			return resolvedTheme;
		},
		get isDark() {
			return resolvedTheme === 'dark';
		},
		init,
		setTheme,
		toggle
	};
}

export const themeStore = createThemeStore();
