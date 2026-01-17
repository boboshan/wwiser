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
	import {
		navigation,
		explore,
		getPageTitle,
		getPageDescription,
		siteConfig
	} from '$lib/config/site';
	import { ChevronDown, Sun, Moon, Monitor } from 'lucide-svelte';
	import logo from '$lib/assets/logo.svg';

	const { children } = $props();

	let sidebarOpen = $state(false);

	onMount(() => {
		themeStore.init();
	});

	// Get current tool from URL
	const currentToolId = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith(explore.href)) return explore.id;
		const tool = navigation.find((t) => path.startsWith(t.href));
		return tool?.id ?? 'wrap';
	});

	const currentToolName = $derived.by(() => {
		if (currentToolId === explore.id) return explore.name;
		const tool = navigation.find((t) => t.id === currentToolId);
		return tool?.name ?? 'Tool';
	});

	// SEO - derived from current page
	const pageTitle = $derived(getPageTitle(currentToolId));
	const pageDescription = $derived(getPageDescription(currentToolId));
	const canonicalUrl = $derived(`${siteConfig.url}${page.url.pathname}`);

	// Theme icon component based on current theme
	const ThemeIcon = $derived(
		themeStore.theme === 'light' ? Sun : themeStore.theme === 'dark' ? Moon : Monitor
	);
</script>

<Seo title={pageTitle} description={pageDescription} canonical={canonicalUrl} />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="text-base font-sans bg-elevated flex h-screen overflow-hidden">
	<!-- Sidebar -->
	<Sidebar
		tools={navigation}
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
			<h1 class="text-lg text-base font-bold m-0">{currentToolName}</h1>
			<ConnectionPanel />
		</header>

		<!-- Mobile header -->
		<header class="px-4 py-3 border-b border-base bg-base flex items-center lg:hidden">
			<a href="/" class="flex shrink-0">
				<img src={logo} alt="Wwiser" class="h-7 w-7" />
			</a>
			<button
				class="text-muted px-2 py-1 rounded-lg bg-hover flex gap-1 transition-colors items-center hover:text-base -my-1"
				onclick={() => (sidebarOpen = true)}
				aria-label="Open menu"
			>
				<span class="text-base font-semibold">{currentToolName}</span>
				<ChevronDown class="mt-0.5 h-4 w-4" />
			</button>
			<div class="flex-1"></div>
			<button
				onclick={() => themeStore.toggle()}
				class="p-2 rounded-lg bg-hover -mr-2"
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
