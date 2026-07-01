<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		tagline?: string;
		counters?: Snippet;
		actions?: Snippet;
	}

	let { title, tagline, counters, actions }: Props = $props();
</script>

<div class="px-4 border-b border-line bg-base flex shrink-0 gap-3 h-[36px] items-center">
	<span class="text-[14px] text-fg tracking-[-0.01em] font-semibold">{title}</span>
	{#if tagline}
		<span class="text-[12px] text-muted hidden truncate sm:block">{tagline}</span>
	{/if}

	<div class="flex-1"></div>

	{#if counters}
		<div class="text-[12px] text-muted flex gap-3 items-center">
			{@render counters()}
		</div>
	{/if}

	{#if actions}
		<div class="flex gap-1 items-center">
			{@render actions()}
		</div>
	{/if}
</div>
