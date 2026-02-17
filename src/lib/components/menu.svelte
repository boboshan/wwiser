<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface MenuItem {
		value: string;
		label: string;
		href?: string;
		icon?: typeof import('lucide-svelte').Info;
		external?: boolean;
		separator?: boolean;
		onclick?: () => void;
	}
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import * as menu from '@zag-js/menu';
	import { portal, useMachine, normalizeProps } from '@zag-js/svelte';

	interface Props {
		id: string;
		items: MenuItem[];
		placement?: string;
		trigger: Snippet<[{ props: HTMLButtonAttributes; open: boolean }]>;
		onselect?: (value: string) => void;
	}

	let { id, items, placement = 'top-start', trigger, onselect }: Props = $props();

	const service = useMachine(menu.machine, () => ({
		id,
		positioning: { placement: placement as 'top-start' },
		onSelect(details) {
			onselect?.(details.value);
		}
	}));

	const api = $derived(menu.connect(service, normalizeProps));
</script>

<div>
	{@render trigger({ props: api.getTriggerProps(), open: api.open })}

	<div use:portal {...api.getPositionerProps()}>
		{#if api.open}
			<div {...api.getContentProps()} class="menu-content">
				{#each items as item (item.value)}
					{#if item.separator}
						<div class="mx-1.5 my-2 border-t border-input"></div>
					{:else if item.href}
						<a
							{...api.getItemProps({ value: item.value })}
							href={item.href}
							target={item.external ? '_blank' : undefined}
							rel={item.external ? 'noopener noreferrer' : undefined}
							onclick={item.onclick}
							class="menu-item"
						>
							{#if item.icon}
								{@const Icon = item.icon}
								<Icon class="h-4 w-4" />
							{/if}
							<span>{item.label}</span>
						</a>
					{:else}
						<button
							{...api.getItemProps({ value: item.value })}
							onclick={item.onclick}
							class="menu-item"
						>
							{#if item.icon}
								{@const Icon = item.icon}
								<Icon class="h-4 w-4" />
							{/if}
							<span>{item.label}</span>
						</button>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>
