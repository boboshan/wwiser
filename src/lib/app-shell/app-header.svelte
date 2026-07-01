<script lang="ts">
	import { ChevronDown, Sun, Moon, Monitor, Undo2, Redo2 } from '@lucide/svelte';
	import logo from '$lib/assets/logo.svg';
	import { wwise } from '$lib/wwise/connection.svelte';
	import { historyStore } from '$lib/state/history.svelte';
	import ConnectionChip from './connection-chip.svelte';

	interface Props {
		currentToolName: string;
		isToolPage: boolean;
		sidebarOpen?: boolean;
		onSidebarOpen?: () => void;
		theme: 'light' | 'dark' | 'system';
		onThemeToggle: () => void;
	}

	let {
		currentToolName,
		isToolPage,
		// eslint-disable-next-line no-useless-assignment
		sidebarOpen = $bindable(false),
		onSidebarOpen,
		theme,
		onThemeToggle
	}: Props = $props();

	const ThemeIcon = $derived(theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor);

	const undoTitle = $derived(historyStore.undoLabel ? `Undo: ${historyStore.undoLabel}` : 'Undo');
	const redoTitle = $derived(historyStore.redoLabel ? `Redo: ${historyStore.redoLabel}` : 'Redo');

	function openSidebar() {
		sidebarOpen = true;
		onSidebarOpen?.();
	}
</script>

{#snippet undoRedoButtons()}
	<button
		onclick={() => wwise.undo()}
		disabled={historyStore.isUndoing}
		title={undoTitle}
		aria-label={undoTitle}
		class="text-muted rounded-md bg-hover flex h-7 w-7 transition-colors items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
	>
		<Undo2 class="h-3.5 w-3.5" />
	</button>
	<button
		onclick={() => wwise.redo()}
		disabled={historyStore.isRedoing}
		title={redoTitle}
		aria-label={redoTitle}
		class="text-muted rounded-md bg-hover flex h-7 w-7 transition-colors items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
	>
		<Redo2 class="h-3.5 w-3.5" />
	</button>
{/snippet}

<!-- Desktop · 44px chrome row, aligned with sidebar header -->
<header
	class="px-4 border-b border-line bg-base shrink-0 h-11 hidden items-center justify-between md:flex"
>
	<div class="text-[13px] flex gap-2 items-center">
		<span class="text-fg-dim">Tools</span>
		<span class="text-fg-dim/60">/</span>
		<span class="text-fg font-medium">{currentToolName}</span>
	</div>
	<div class="flex gap-1.5 items-center">
		{#if wwise.isConnected && isToolPage}
			{@render undoRedoButtons()}
			<div class="bg-line mx-1 h-4 w-px" aria-hidden="true"></div>
		{/if}
		<ConnectionChip />
	</div>
</header>

<!-- Mobile · 44px chrome row -->
<header class="px-3 border-b border-line bg-base flex shrink-0 gap-2 h-11 items-center md:hidden">
	<a href="/" class="flex shrink-0">
		<img src={logo} alt="Wwiser" class="h-6 w-6" />
	</a>
	<button
		class="text-muted px-2 rounded-md bg-hover flex gap-1 h-7 transition-colors items-center"
		onclick={openSidebar}
		aria-label="Open menu"
	>
		<span class="text-[13px] font-medium">{currentToolName}</span>
		<ChevronDown class="h-3.5 w-3.5" />
	</button>
	<div class="flex-1"></div>
	{#if wwise.isConnected && isToolPage}
		<div class="flex gap-1 items-center">{@render undoRedoButtons()}</div>
	{/if}
	<ConnectionChip />
	<button
		onclick={onThemeToggle}
		class="text-muted rounded-md bg-hover flex h-7 w-7 items-center justify-center"
		aria-label="Toggle theme"
	>
		<ThemeIcon class="h-3.5 w-3.5" />
	</button>
</header>
