<script lang="ts">
	import '$lib/styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/sidebar.svelte';
	import Seo from '$lib/components/seo.svelte';
	import { themeStore } from '$lib/state/theme.svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import {
		navigation,
		explore,
		getPageTitle,
		getPageDescription,
		siteConfig
	} from '$lib/config/site';
	import Toaster from '$lib/components/toaster.svelte';
	import AppHeader from '$lib/app-shell/app-header.svelte';
	import StatusBar from '$lib/app-shell/status-bar.svelte';

	const FULL_BLEED_TOOLS = new Set(['assign']);

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
		if (path === '/faq' || path.startsWith('/faq/')) return 'faq';
		if (path.startsWith(explore.href)) return explore.id;
		const tool = navigation.find((t) => path.startsWith(t.href));
		return tool?.id ?? 'explore';
	});

	const currentToolName = $derived.by(() => {
		if (currentToolId === 'home') return 'Home';
		if (currentToolId === 'about') return 'About';
		if (currentToolId === 'faq') return 'FAQ';
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
		currentToolId !== 'home' &&
			currentToolId !== 'about' &&
			currentToolId !== 'faq' &&
			currentToolId !== explore.id
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
<Toaster />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div
	class="text-fg font-sans bg-page grid grid-cols-[1fr] grid-rows-[minmax(0,1fr)_24px] h-screen overflow-hidden lg:grid-cols-[18rem_1fr]"
>
	<Sidebar
		tools={navigation}
		{explore}
		currentTool={currentToolId}
		bind:sidebarOpen
		theme={themeStore.theme}
		onThemeChange={themeStore.setTheme}
	/>

	<div class="flex flex-col min-w-0 overflow-hidden">
		<AppHeader
			{currentToolName}
			{isToolPage}
			bind:sidebarOpen
			theme={themeStore.theme}
			onThemeToggle={themeStore.toggle}
		/>

		<main class="bg-page flex flex-1 flex-col min-h-0 overflow-y-auto">
			{#if FULL_BLEED_TOOLS.has(currentToolId)}
				{@render children()}
			{:else}
				<div
					class="mx-auto flex w-full flex-col max-w-6xl p-4 pb-8 lg:p-8 lg:pb-12 md:p-6 md:pb-10"
				>
					{@render children()}
				</div>
			{/if}
		</main>
	</div>

	<StatusBar />
</div>
