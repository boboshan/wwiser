<script lang="ts">
	import { TriangleAlert, Info, CircleCheck, CircleX } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	type Variant = 'info' | 'success' | 'warning' | 'error';

	interface Props {
		variant?: Variant;
		children: Snippet;
		class?: string;
	}

	const { variant = 'info', children, class: className = '' }: Props = $props();

	const styles: Record<Variant, string> = {
		info: 'text-wwise border-wwise/20 bg-wwise/10',
		success: 'text-green-600 dark:text-green-400 border-green-500/20 bg-green-500/10',
		warning: 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10',
		error: 'text-red-600 dark:text-red-400 border-red-500/20 bg-red-500/10'
	};

	const icons = {
		info: Info,
		success: CircleCheck,
		warning: TriangleAlert,
		error: CircleX
	};

	const Icon = $derived(icons[variant]);
</script>

<div
	class="text-sm px-4 py-3 border rounded-lg flex gap-3 items-start {styles[variant]} {className}"
>
	<Icon size={16} class="mt-0.5 shrink-0" />
	<div class="flex-1">
		{@render children()}
	</div>
</div>
