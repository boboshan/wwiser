<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		index: number;
		icon?: Component<{ size?: number; class?: string }>;
		name: string;
		badge?: string;
		target?: string;
		skipped?: boolean;
		arrow?: '→' | '—';
	}

	let { index, icon: Icon, name, badge, target, skipped = false, arrow = '→' }: Props = $props();
</script>

<div
	class={[
		'flex items-center gap-3 px-2 py-2.5 border-t border-line text-sm last:border-b',
		skipped && 'opacity-50'
	]}
>
	<span class="text-xs text-fg-dim shrink-0 w-5 tabular-nums">{String(index).padStart(2, '0')}</span
	>
	{#if Icon}
		<Icon size={14} class="text-muted shrink-0" />
	{:else}
		<span class="rounded-sm bg-wwise-500/15 shrink-0 h-3.5 w-3.5" aria-hidden="true"></span>
	{/if}
	<span class="text-fg font-medium flex-1 min-w-0 truncate">{name}</span>
	{#if badge}
		<span
			class="text-xs text-muted px-2 py-0.5 border border-line-strong rounded bg-base shrink-0"
		>
			{badge}
		</span>
	{/if}
	{#if target}
		<span class="text-xs text-fg-dim font-mono shrink-0">{arrow}</span>
		<span
			class={[
				'text-xs shrink-0 max-w-[280px] truncate',
				skipped ? 'text-fg-dim italic' : 'text-wwise font-medium'
			]}>{target}</span
		>
	{/if}
</div>
