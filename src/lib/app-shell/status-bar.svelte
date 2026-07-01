<script lang="ts">
	import { Package } from '@lucide/svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import { historyStore } from '$lib/state/history.svelte';

	const dotColor = $derived(
		wwise.status === 'connected'
			? 'bg-green'
			: wwise.status === 'connecting'
				? 'bg-warn'
				: 'bg-fg-dim'
	);

	const statusLabel = $derived(
		wwise.status === 'connected'
			? 'Connected'
			: wwise.status === 'connecting'
				? 'Connecting'
				: wwise.status === 'error'
					? 'Error'
					: 'Offline'
	);

	const projectFile = $derived(
		wwise.project ? `${wwise.project.name}.wproj${wwise.project.isDirty ? ' •' : ''}` : null
	);
</script>

<footer
	class="text-[11px] text-muted px-3 border-t border-line bg-base flex shrink-0 gap-4 col-span-full h-[24px] items-center"
>
	<span class="flex gap-1.5 items-center">
		<span class="rounded-full h-1.5 w-1.5 {dotColor}" aria-hidden="true"></span>
		<strong class="text-fg font-medium">{statusLabel}</strong>
	</span>

	{#if projectFile}
		<span class="flex gap-1.5 items-center">
			<Package class="h-2.5 w-2.5" />
			<span class="font-mono tabular-nums">{projectFile}</span>
		</span>
	{/if}

	{#if historyStore.undoLabel}
		<span class="flex gap-1.5 max-w-[40%] min-w-0 items-center">
			<span class="text-fg-dim">last:</span>
			<span class="truncate">{historyStore.undoLabel}</span>
		</span>
	{/if}

	<div class="flex-1"></div>

	<div class="flex gap-3 items-center">
		<span class="flex gap-1 items-center">
			<kbd class="text-[10px] px-1 py-0.5 border border-line-strong rounded bg-base">⌘Z</kbd>
			<span>undo</span>
		</span>
	</div>
</footer>
