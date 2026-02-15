<script lang="ts">
	import 'virtual:uno.css';
	import '$lib/styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/sidebar.svelte';
	import ConnectionPanel from '$lib/components/connection-panel.svelte';
	import Seo from '$lib/components/seo.svelte';
	import { themeStore } from '$lib/state/theme.svelte';
	import { historyStore } from '$lib/state/history.svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import {
		navigation,
		visibleNavigation,
		explore,
		getPageTitle,
		getPageDescription,
		siteConfig
	} from '$lib/config/site';
	import { ChevronDown, Sun, Moon, Monitor, Undo2, Redo2 } from 'lucide-svelte';
	import logo from '$lib/assets/logo.svg';

	const { children } = $props();

	let sidebarOpen = $state(false);

	onMount(() => {
		themeStore.init();
	});

	// Get current tool from URL
	const currentToolId = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/') return 'home';
		if (path === '/about' || path.startsWith('/about/')) return 'about';
		if (path.startsWith(explore.href)) return explore.id;
		const tool = navigation.find((t) => path.startsWith(t.href));
		return tool?.id ?? 'explore';
	});

	const currentToolName = $derived.by(() => {
		if (currentToolId === 'home') return 'Home';
		if (currentToolId === 'about') return 'About';
		if (currentToolId === explore.id) return explore.name;
		const tool = navigation.find((t) => t.id === currentToolId);
		return tool?.name ?? 'Tool';
	});

	// SEO - derived from current page
	const pageTitle = $derived(getPageTitle(currentToolId));
	const pageDescription = $derived(getPageDescription(currentToolId));
	const canonicalUrl = $derived(`${siteConfig.url}${page.url.pathname}`);

	// Only show undo/redo on actual tool pages
	const isToolPage = $derived(
		currentToolId !== 'home' && currentToolId !== 'about' && currentToolId !== explore.id
	);

	// Theme icon component based on current theme
	const ThemeIcon = $derived(
		themeStore.theme === 'light' ? Sun : themeStore.theme === 'dark' ? Moon : Monitor
	);

	// Global keyboard shortcut handler
	function handleKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod || !wwise.isConnected || !isToolPage) return;

		// Don't intercept when typing in inputs
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
			return;

		if (e.key === 'z') {
			e.preventDefault();
			wwise.undo();
		} else if (e.key === 'y') {
			e.preventDefault();
			wwise.redo();
		}
	}
</script>

<Seo title={pageTitle} description={pageDescription} canonical={canonicalUrl} />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="text-base font-sans bg-elevated flex h-screen overflow-hidden">
	<!-- Sidebar -->
	<Sidebar
		tools={visibleNavigation}
		{explore}
		currentTool={currentToolId}
		bind:sidebarOpen
		theme={themeStore.theme}
		onThemeChange={themeStore.setTheme}
	/>

	<div class="flex flex-1 flex-col min-w-0 overflow-hidden">
		<!-- Desktop header -->
		<header
			class="px-6 py-3 border-b border-base bg-base hidden items-center justify-between lg:flex"
		>
			<div class="flex gap-4 items-center">
				<h1 class="text-lg text-base font-bold m-0">{currentToolName}</h1>
				{#if wwise.isConnected && isToolPage}
					<div class="border-l border-base h-5"></div>
					<div class="flex gap-1 items-center">
						<button
							onclick={() => wwise.undo()}
							disabled={historyStore.isUndoing}
							title={historyStore.undoLabel ? `Undo: ${historyStore.undoLabel}` : 'Undo'}
							class="text-muted p-1.5 rounded-md transition-colors hover:text-surface-900 hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:text-surface-100 dark:hover:bg-surface-800 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
							aria-label="Undo"
						>
							<Undo2 class="h-4 w-4" />
						</button>
						<button
							onclick={() => wwise.redo()}
							disabled={historyStore.isRedoing}
							title={historyStore.redoLabel ? `Redo: ${historyStore.redoLabel}` : 'Redo'}
							class="text-muted p-1.5 rounded-md transition-colors hover:text-surface-900 hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:text-surface-100 dark:hover:bg-surface-800 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
							aria-label="Redo"
						>
							<Redo2 class="h-4 w-4" />
						</button>
					</div>
				{/if}
			</div>
			<ConnectionPanel />
		</header>

		<!-- Mobile header -->
		<header class="px-4 py-3 border-b border-base bg-base flex gap-2 items-center lg:hidden">
			<a href="/" class="flex shrink-0">
				<img src={logo} alt="Wwiser" class="h-7 w-7" />
			</a>
			<button
				class="text-muted px-2 py-1 rounded-lg bg-hover flex gap-1 transition-colors items-center hover:text-surface-900 -my-1 dark:hover:text-surface-100"
				onclick={() => (sidebarOpen = true)}
				aria-label="Open menu"
			>
				<span class="text-base font-semibold">{currentToolName}</span>
				<ChevronDown class="mt-0.5 h-4 w-4" />
			</button>
			<div class="flex-1"></div>
			{#if wwise.isConnected && isToolPage}
				<div class="flex gap-0.5 items-center">
					<button
						onclick={() => wwise.undo()}
						disabled={historyStore.isUndoing}
						title={historyStore.undoLabel ? `Undo: ${historyStore.undoLabel}` : 'Undo'}
						class="text-muted p-2 rounded-lg bg-hover transition-colors hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:text-surface-100"
						aria-label={historyStore.undoLabel ? `Undo: ${historyStore.undoLabel}` : 'Undo'}
					>
						<Undo2 class="h-4 w-4" />
					</button>
					<button
						onclick={() => wwise.redo()}
						disabled={historyStore.isRedoing}
						title={historyStore.redoLabel ? `Redo: ${historyStore.redoLabel}` : 'Redo'}
						class="text-muted p-2 rounded-lg bg-hover transition-colors hover:text-surface-900 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:text-surface-100"
						aria-label={historyStore.redoLabel ? `Redo: ${historyStore.redoLabel}` : 'Redo'}
					>
						<Redo2 class="h-4 w-4" />
					</button>
				</div>
			{/if}
			<ConnectionPanel />
			<button
				onclick={() => themeStore.toggle()}
				class="p-2 rounded-lg bg-hover"
				aria-label="Toggle theme"
			>
				<ThemeIcon class="h-5 w-5" />
			</button>
		</header>

		<!-- Scrollable Content Area -->
		<main class="p-4 bg-surface-50 flex-1 overflow-y-auto lg:p-8 md:p-6 dark:bg-surface-900">
			<div class="mx-auto flex flex-col h-full max-w-6xl">
				{@render children()}
			</div>
		</main>
	</div>
</div>
