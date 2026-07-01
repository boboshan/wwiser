<script lang="ts">
	import type { Snippet } from 'svelte';

	export type ToolLayout = 'standard' | 'wide';

	interface Props {
		toolbar: Snippet;
		config?: Snippet;
		list: Snippet;
		action?: Snippet;
		layout?: ToolLayout;
	}

	let { toolbar, config, list, action, layout = 'standard' }: Props = $props();
</script>

<div class={['flex flex-col flex-1 min-h-0 w-full', layout === 'wide' && 'lg:min-w-[1280px]']}>
	{@render toolbar()}

	{#if config}
		<div class="border-b border-line shrink-0">
			{@render config()}
		</div>
	{/if}

	<div class="flex-1 min-h-0 overflow-auto">
		{@render list()}
	</div>

	{#if action}
		{@render action()}
	{/if}
</div>
