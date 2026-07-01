<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		// The tool name lives in the app-header breadcrumb, so the toolbar carries
		// only a short context line + counters + actions (no duplicate title).
		tagline?: string;
		counters?: Snippet;
		actions?: Snippet;
	}

	let { tagline, counters, actions }: Props = $props();
</script>

<div class="px-4 border-b border-line bg-base flex shrink-0 gap-3 h-9 items-center">
	{#if tagline}
		<span class="text-[13px] text-muted hidden truncate sm:block">{tagline}</span>
	{/if}

	<div class="flex-1"></div>

	{#if counters}
		<div class="text-[12px] text-muted flex gap-3 items-center">
			{@render counters()}
		</div>
	{/if}

	{#if actions}
		<div class="flex gap-1.5 items-center">
			{@render actions()}
		</div>
	{/if}
</div>
