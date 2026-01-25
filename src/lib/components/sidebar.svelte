<script lang="ts">
	import {
		Package,
		FilePen,
		X,
		Sun,
		Moon,
		Monitor,
		Volume2,
		Terminal,
		GitBranch,
		MoreHorizontal,
		Info,
		Globe,
		Film
	} from 'lucide-svelte';
	import logo from '$lib/assets/logo.svg';
	import wwiserTitle from '$lib/assets/wwiser.svg';
	import { type NavItem, siteConfig } from '$lib/config/site';
	import * as menu from '@zag-js/menu';
	import { portal, useMachine, normalizeProps } from '@zag-js/svelte';

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

	// Map icon names to components
	const iconMap: Record<string, typeof Package> = {
		package: Package,
		edit: FilePen,
		volume: Volume2,
		terminal: Terminal,
		'git-branch': GitBranch
	};

	// Menu machine for footer links
	const menuService = useMachine(menu.machine, () => ({
		id: 'footer-menu',
		positioning: { placement: 'top-start' as 'top-start' }
	}));
	const menuApi = $derived(menu.connect(menuService, normalizeProps));

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
		'bg-base border-r border-base flex flex-col shadow-xl lg:shadow-none',
		sidebarOpen ? 'translate-x-0' : '-translate-x-full'
	]}
>
	<!-- Logo -->
	<div class="p-5 border-b border-base flex items-center justify-between">
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
			class="hover-bg text-muted p-2 rounded-lg transition-colors hover:text-base lg:hidden"
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
			<p class="text-xs text-muted tracking-wider font-semibold mb-2 px-3 uppercase">Explore</p>
			<a
				href={explore.href}
				onclick={closeSidebar}
				class={[
					'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all no-underline mb-4',
					currentTool === explore.id
						? 'bg-wwise/10 text-wwise'
						: 'text-muted hover:text-base hover-bg'
				]}
			>
				<div
					class={[
						'rounded-md p-2 transition-colors',
						currentTool === explore.id
							? 'bg-wwise/15 text-wwise'
							: 'bg-surface-200 dark:bg-surface-800 text-surface-500'
					]}
				>
					<Icon class="h-4 w-4" />
				</div>
				<div class="flex-1 min-w-0">
					<span class="block truncate">{explore.name}</span>
					<span class="text-xs text-muted block truncate">{explore.description}</span>
				</div>
			</a>
		{/if}

		<!-- Tools Section -->
		<p class="text-xs text-muted tracking-wider font-semibold mb-2 px-3 uppercase">Tools</p>
		<div class="space-y-1">
			{#each tools as tool (tool.id)}
				{@const Icon = iconMap[tool.icon] ?? Package}
				<a
					href={tool.href}
					onclick={closeSidebar}
					class={[
						'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all no-underline',
						currentTool === tool.id
							? 'bg-wwise/10 text-wwise'
							: 'text-muted hover:text-base hover-bg'
					]}
				>
					<div
						class={[
							'rounded-md p-2 transition-colors',
							currentTool === tool.id
								? 'bg-wwise/15 text-wwise'
								: 'bg-surface-200 dark:bg-surface-800 text-surface-500'
						]}
					>
						<Icon class="h-4 w-4" />
					</div>
					<div class="flex-1 min-w-0">
						<span class="block truncate">{tool.name}</span>
						<span class="text-xs text-muted block truncate">{tool.description}</span>
					</div>
				</a>
			{/each}
		</div>
	</nav>

	<!-- Footer -->
	<div class="px-3 py-3 border-t border-base">
		<!-- More menu & theme toggle -->
		<div class="flex items-center justify-between">
			<!-- More menu trigger -->
			<div>
				<button
					{...menuApi.getTriggerProps()}
					class="px-2 py-1.5 rounded-lg text-sm text-muted flex items-center gap-1.5 transition-colors hover:text-base hover-bg data-[state=open]:text-base data-[state=open]:bg-surface-200 dark:data-[state=open]:bg-surface-800"
				>
					<MoreHorizontal class="h-4 w-4" />
					<span>More</span>
				</button>

				<!-- Menu popover -->
				<div use:portal {...menuApi.getPositionerProps()}>
					{#if menuApi.open}
						<div
							{...menuApi.getContentProps()}
							class="bg-base border border-base rounded-lg shadow-lg py-1 min-w-48 z-50"
						>
							<!-- About -->
							<a
								{...menuApi.getItemProps({ value: 'about' })}
								href="/about"
								onclick={closeSidebar}
								class="flex items-center gap-3 px-3 py-2 text-sm text-muted no-underline transition-colors hover:text-base hover:bg-surface-100 dark:hover:bg-surface-800 data-[highlighted]:bg-surface-100 dark:data-[highlighted]:bg-surface-800 data-[highlighted]:text-base"
							>
								<Info class="h-4 w-4" />
								<span>About Wwiser</span>
							</a>

							<div class="my-1 border-t border-base"></div>

							<!-- External Links -->
							<a
								{...menuApi.getItemProps({ value: 'website' })}
								href="https://boboshan.com"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-3 px-3 py-2 text-sm text-muted no-underline transition-colors hover:text-base hover:bg-surface-100 dark:hover:bg-surface-800 data-[highlighted]:bg-surface-100 dark:data-[highlighted]:bg-surface-800 data-[highlighted]:text-base"
							>
								<Globe class="h-4 w-4" />
								<span>boboshan.com</span>
							</a>
							<a
								{...menuApi.getItemProps({ value: 'roll' })}
								href="https://roll.wwiser.net/"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-3 px-3 py-2 text-sm text-muted no-underline transition-colors hover:text-base hover:bg-surface-100 dark:hover:bg-surface-800 data-[highlighted]:bg-surface-100 dark:data-[highlighted]:bg-surface-800 data-[highlighted]:text-base"
							>
								<Film class="h-4 w-4" />
								<span>Roll - Video toolset</span>
							</a>
						</div>
					{/if}
				</div>
			</div>

			<!-- Theme toggle -->
			<div class="p-0.5 rounded-lg bg-surface-200 flex dark:bg-surface-800">
				<button
					onclick={() => setTheme('light')}
					class={[
						'p-1.5 rounded-md transition-all',
						theme === 'light' ? 'bg-base text-base shadow-sm' : 'text-muted hover:text-base'
					]}
					aria-label="Light theme"
				>
					<Sun class="h-4 w-4" />
				</button>
				<button
					onclick={() => setTheme('dark')}
					class={[
						'p-1.5 rounded-md transition-all',
						theme === 'dark' ? 'bg-base text-base shadow-sm' : 'text-muted hover:text-base'
					]}
					aria-label="Dark theme"
				>
					<Moon class="h-4 w-4" />
				</button>
				<button
					onclick={() => setTheme('system')}
					class={[
						'p-1.5 rounded-md transition-all',
						theme === 'system' ? 'bg-base text-base shadow-sm' : 'text-muted hover:text-base'
					]}
					aria-label="System theme"
				>
					<Monitor class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</aside>
