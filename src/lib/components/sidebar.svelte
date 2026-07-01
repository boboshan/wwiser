<script lang="ts">
	import {
		Package,
		X,
		Sun,
		Moon,
		Monitor,
		Terminal,
		Ellipsis,
		Info,
		CircleHelp,
		Globe,
		Film
	} from '@lucide/svelte';
	import logo from '$lib/assets/logo.svg';
	import wwiserTitle from '$lib/assets/wwiser.svg';
	import { type NavItem, siteConfig, iconMap } from '$lib/config/site';
	import Menu, { type MenuItem } from '$lib/components/menu.svelte';

	interface Props {
		tools: NavItem[];
		explore?: NavItem;
		currentTool: string;
		sidebarOpen?: boolean;
		onClose?: () => void;
		theme?: 'light' | 'dark' | 'system';
		onThemeChange?: (theme: 'light' | 'dark' | 'system') => void;
	}

	let {
		tools,
		explore,
		currentTool,
		sidebarOpen = $bindable(false),
		onClose,
		theme = 'system',
		onThemeChange
	}: Props = $props();

	const menuItems: MenuItem[] = [
		{ value: 'about', label: 'About Wwiser', href: '/about', icon: Info, onclick: closeSidebar },
		{ value: 'faq', label: 'FAQ', href: '/faq', icon: CircleHelp, onclick: closeSidebar },
		{ value: 'sep', label: '', separator: true },
		{
			value: 'website',
			label: 'boboshan.com',
			href: 'https://boboshan.com',
			icon: Globe,
			external: true
		},
		{
			value: 'roll',
			label: 'Roll - Video toolset',
			href: 'https://roll.wwiser.app/',
			icon: Film,
			external: true
		}
	];

	function closeSidebar() {
		sidebarOpen = false;
		onClose?.();
	}

	function setTheme(newTheme: 'light' | 'dark' | 'system') {
		onThemeChange?.(newTheme);
	}
</script>

<!-- Mobile overlay -->
{#if sidebarOpen}
	<div
		class="bg-black/50 inset-0 fixed z-40 backdrop-blur-sm lg:hidden"
		onclick={closeSidebar}
		onkeydown={(e) => e.key === 'Escape' && closeSidebar()}
		role="button"
		tabindex="0"
		aria-label="Close sidebar"
	></div>
{/if}

<!-- Sidebar -->
<aside
	class={[
		'fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0',
		'bg-base border-r border-line flex flex-col shadow-xl lg:shadow-none',
		sidebarOpen ? 'translate-x-0' : '-translate-x-full'
	]}
>
	<!-- Logo -->
	<div class="p-5 border-b border-line flex items-center justify-between">
		<a href="/" class="group no-underline flex gap-3 items-center">
			<div class="flex shrink-0 h-10 w-10">
				<img src={logo} alt="Wwiser" class="h-full w-full" />
			</div>
			<div class="mt-1 flex flex-col gap-1.5 items-start">
				<img src={wwiserTitle} alt="Wwiser" class="h-4 w-auto dark:invert" />
				<p class="text-xs text-muted leading-none m-0">{siteConfig.tagline}</p>
			</div>
		</a>
		<!-- Mobile close button -->
		<button
			class="text-muted p-2 rounded-lg hover:bg-hover transition-colors hover:text-fg lg:hidden"
			onclick={closeSidebar}
			aria-label="Close menu"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<!-- Navigation -->
	<nav class="p-3 flex-1 overflow-y-auto">
		<!-- Explore Section -->
		{#if explore}
			{@const Icon = iconMap[explore.icon] ?? Terminal}
			<p class="text-xs text-fg-dim tracking-wider font-semibold mb-2 px-3 uppercase">Explore</p>
			<a
				href={explore.href}
				onclick={closeSidebar}
				class={[
					'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ease-out no-underline mb-4',
					currentTool === explore.id
						? 'bg-wwise/10 text-wwise'
						: 'text-muted hover:text-fg hover:bg-hover'
				]}
			>
				<span
					class={[
						'absolute left-0 top-1/2 -mt-2.5 h-5 w-0.5 rounded-full bg-wwise origin-center transition-transform duration-200 ease-out',
						currentTool === explore.id ? 'scale-y-100' : 'scale-y-0'
					]}
					aria-hidden="true"
				></span>
				<div
					class={[
						'rounded-md p-2 transition-all duration-200 ease-out',
						currentTool === explore.id
							? 'bg-wwise/15 text-wwise'
							: 'bg-hover text-muted group-hover:text-fg group-hover:scale-[1.06]'
					]}
				>
					<Icon class="h-4 w-4" />
				</div>
				<div class="flex-1 min-w-0">
					<span class="block truncate">{explore.name}</span>
					<span class="text-xs text-muted/60 block truncate">{explore.shortDescription}</span>
				</div>
			</a>
		{/if}

		<!-- Tools Section -->
		<p class="text-xs text-fg-dim tracking-wider font-semibold mb-2 px-3 uppercase">Tools</p>
		<div class="space-y-1">
			{#each tools as tool (tool.id)}
				{@const Icon = iconMap[tool.icon] ?? Package}
				<a
					href={tool.href}
					onclick={closeSidebar}
					class={[
						'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ease-out no-underline',
						currentTool === tool.id
							? 'bg-wwise/10 text-wwise'
							: 'text-muted hover:text-fg hover:bg-hover'
					]}
				>
					<span
						class={[
							'absolute left-0 top-1/2 -mt-2.5 h-5 w-0.5 rounded-full bg-wwise origin-center transition-transform duration-200 ease-out',
							currentTool === tool.id ? 'scale-y-100' : 'scale-y-0'
						]}
						aria-hidden="true"
					></span>
					<div
						class={[
							'rounded-md p-2 transition-all duration-200 ease-out',
							currentTool === tool.id
								? 'bg-wwise/15 text-wwise'
								: 'bg-hover text-muted group-hover:text-fg group-hover:scale-[1.06]'
						]}
					>
						<Icon class="h-4 w-4" />
					</div>
					<div class="flex-1 min-w-0">
						<span class="block truncate">{tool.name}</span>
						<span class="text-xs text-muted/60 block truncate">{tool.shortDescription}</span>
					</div>
				</a>
			{/each}
		</div>
	</nav>

	<!-- Footer -->
	<div class="px-3 py-3 border-t border-line">
		<!-- More menu & theme toggle -->
		<div class="flex items-center justify-between">
			<!-- More menu trigger -->
			<Menu id="footer-menu" items={menuItems}>
				{#snippet trigger({ props, open })}
					<button
						{...props}
						class={[
							'text-sm text-muted px-2 py-1.5 rounded-lg hover:bg-hover flex gap-1.5 transition-colors items-center ring-focus hover:text-fg',
							open && 'text-fg bg-hover'
						]}
					>
						<Ellipsis class="h-4 w-4" />
						<span>More</span>
					</button>
				{/snippet}
			</Menu>

			<!-- Theme toggle -->
			<div class="p-0.5 rounded-lg bg-hover flex">
				<button
					onclick={() => setTheme('light')}
					class={[
						'p-1.5 rounded-md transition-all duration-200 ease-out',
						theme === 'light' ? 'bg-base text-fg shadow-sm' : 'text-muted hover:text-fg'
					]}
					aria-label="Light theme"
				>
					<Sun class="h-4 w-4" />
				</button>
				<button
					onclick={() => setTheme('dark')}
					class={[
						'p-1.5 rounded-md transition-all duration-200 ease-out',
						theme === 'dark' ? 'bg-base text-fg shadow-sm' : 'text-muted hover:text-fg'
					]}
					aria-label="Dark theme"
				>
					<Moon class="h-4 w-4" />
				</button>
				<button
					onclick={() => setTheme('system')}
					class={[
						'p-1.5 rounded-md transition-all duration-200 ease-out',
						theme === 'system' ? 'bg-base text-fg shadow-sm' : 'text-muted hover:text-fg'
					]}
					aria-label="System theme"
				>
					<Monitor class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</aside>
