<script lang="ts" module>
	// Re-export from centralized constants for backward compatibility
	export { TYPE_DISPLAY_NAMES, getTypeDisplayName } from '$lib/wwise/constants';

	export type BadgeVariant = 'default' | 'wwise' | 'purple' | 'blue' | 'green' | 'red' | 'amber';
</script>

<script lang="ts">
	interface Props {
		variant?: BadgeVariant;
		class?: string;
		children: import('svelte').Snippet;
	}

	let { variant = 'default', class: className = '', children }: Props = $props();

	const variantClasses: Record<BadgeVariant, string> = {
		default: 'text-muted bg-surface-200 dark:bg-surface-700',
		wwise: 'text-wwise bg-wwise/10',
		purple: 'text-purple-600 bg-purple-500/10 dark:text-purple-400',
		blue: 'text-blue-600 bg-blue-500/10 dark:text-blue-400',
		green: 'text-green-600 bg-green-500/10 dark:text-green-400',
		red: 'text-red-600 bg-red-500/10 dark:text-red-400',
		amber: 'text-amber-600 bg-amber-500/10 dark:text-amber-400'
	};
</script>

<span
	class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 {variantClasses[
		variant
	]} {className}"
>
	{@render children()}
</span>
