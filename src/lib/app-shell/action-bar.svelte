<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		summary?: Snippet;
		actions: Snippet;
	}

	let { summary, actions }: Props = $props();
</script>

<div
	class="bg-page/95 px-6 border-t border-line flex shrink-0 gap-4 h-[52px] items-center bottom-0 sticky z-30 backdrop-blur-sm"
>
	{#if summary}
		<div class="text-[13px] text-muted flex-1 min-w-0 truncate">{@render summary()}</div>
	{:else}
		<div class="flex-1"></div>
	{/if}
	<div class="flex shrink-0 gap-2 items-center">{@render actions()}</div>
</div>
