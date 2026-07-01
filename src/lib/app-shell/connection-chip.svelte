<script lang="ts">
	import { wwise } from '$lib/wwise/connection.svelte';
	import ConnectionPanel from '$lib/components/connection-panel.svelte';
	import { fade } from 'svelte/transition';

	let open = $state(false);

	const dotColor = $derived(
		wwise.status === 'connected'
			? 'bg-green'
			: wwise.status === 'connecting'
				? 'bg-warn'
				: 'bg-fg-dim'
	);

	// Subtle pulse on live/connecting only — matches spec's motion guidance.
	const dotPulse = $derived(
		wwise.status === 'connected' || wwise.status === 'connecting' ? 'animate-pulse' : ''
	);

	const label = $derived(
		wwise.status === 'connected'
			? `Connected · ${wwise.project?.name ?? '—'}`
			: wwise.status === 'connecting'
				? 'Connecting…'
				: 'Offline · open Wwise'
	);

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-connection-chip]')) open = false;
	}

	$effect(() => {
		if (open) {
			window.addEventListener('mousedown', handleClickOutside);
			return () => window.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

<div class="relative" data-connection-chip>
	<button
		onclick={() => (open = !open)}
		aria-label="Connection status"
		aria-expanded={open}
		class="text-xs text-muted px-2.5 rounded-md bg-hover flex gap-2 h-7 transition-colors items-center"
	>
		<span class="rounded-full h-1.5 w-1.5 {dotColor} {dotPulse}" aria-hidden="true"></span>
		<span class="text-fg font-medium max-w-[160px] truncate">{label}</span>
	</button>

	{#if open}
		<div
			transition:fade={{ duration: 120 }}
			class="p-3 border border-line-strong rounded-lg bg-base w-80 shadow-lg right-0 top-9 absolute z-50 dark:shadow-2xl dark:shadow-black/40"
		>
			<ConnectionPanel />
		</div>
	{/if}
</div>
