<script lang="ts" module>
	export interface GroupedComboboxItem {
		label: string;
		value: string;
		disabled?: boolean;
	}

	export interface GroupedComboboxGroup {
		label: string;
		items: GroupedComboboxItem[];
	}
</script>

<script lang="ts">
	import * as combobox from '@zag-js/combobox';
	import { useMachine, normalizeProps } from '@zag-js/svelte';

	interface Props {
		groups: GroupedComboboxGroup[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id: string;
		allowCustomValue?: boolean;
		onchange?: (value: string) => void;
	}

	let {
		groups,
		value = $bindable(),
		placeholder = 'Search...',
		disabled = false,
		id,
		allowCustomValue = false,
		onchange
	}: Props = $props();

	// Flatten groups for filtering
	const allItems = $derived(
		groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })))
	);

	// Initialize filtered groups from derived
	const initialGroups = $derived(
		groups.map((g) => ({ ...g, items: g.items.map((item) => ({ ...item, group: g.label })) }))
	);

	let filterQuery = $state('');

	const filteredGroups = $derived.by(() => {
		if (!filterQuery) return initialGroups;
		const query = filterQuery.toLowerCase();
		const filtered = initialGroups
			.map((g) => ({
				...g,
				items: g.items.filter(
					(item) =>
						item.label.toLowerCase().includes(query) ||
						item.value.toLowerCase().includes(query)
				)
			}))
			.filter((g) => g.items.length > 0);
		return filtered.length > 0 ? filtered : initialGroups;
	});

	const flatFiltered = $derived(filteredGroups.flatMap((g) => g.items));

	const collection = $derived(
		combobox.collection({
			items: flatFiltered,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => item.disabled ?? false
		})
	);

	const service = useMachine(combobox.machine, () => ({
		id,
		collection,
		openOnClick: true,
		value: value ? [value] : [],
		inputValue: allItems.find((i) => i.value === value)?.label ?? '',
		allowCustomValue,
		inputBehavior: 'autohighlight' as const,
		onValueChange(details) {
			const newValue = details.value[0];
			value = newValue;
			onchange?.(newValue);
		},
		onInputValueChange({ inputValue, reason }) {
			if (reason === 'input-change') {
				filterQuery = inputValue;
			}
		},
		onOpenChange(details) {
			if (details.open) {
				filterQuery = '';
			}
		},
		disabled,
		positioning: {
			sameWidth: true,
			placement: 'bottom' as const
		},
		selectionBehavior: 'replace' as const
	}));

	const api = $derived(combobox.connect(service, normalizeProps));
</script>

<div {...api.getRootProps()} class="relative">
	<div {...api.getControlProps()}>
		<input
			{...api.getInputProps()}
			{placeholder}
			spellcheck="false"
			autocomplete="off"
			class={[
				'text-sm px-3 border rounded-lg bg-surface-50 h-10 w-full transition-colors focus:outline-none focus:border-wwise dark:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-wwise/20',
				api.value.length > 0 ? 'text-wwise border-wwise/30' : 'text-base border-base'
			]}
		/>
	</div>

	<div {...api.getPositionerProps()}>
		{#if api.open}
			{#if flatFiltered.length > 0}
				<ul
					{...api.getContentProps()}
					class="mt-1 border border-base rounded-lg bg-base max-h-64 w-full shadow-lg z-50 overflow-x-hidden overflow-y-auto"
				>
					{#each filteredGroups as group (group.label)}
						<li class="px-3 py-1.5 text-[10px] text-muted tracking-wider font-medium uppercase bg-surface-50 sticky top-0 dark:bg-surface-800 border-b border-base">
							{group.label}
						</li>
						{#each group.items as item (item.value)}
							<li
								{...api.getItemProps({ item })}
								class="data-disabled:opacity-50 data-disabled:cursor-not-allowed text-sm px-3 py-2 cursor-pointer transition-colors data-highlighted:text-wwise data-[state=checked]:text-wwise data-highlighted:bg-wwise/20 data-[state=checked]:bg-wwise/10"
							>
								<span {...api.getItemTextProps({ item })}>{item.label}</span>
							</li>
						{/each}
					{/each}
				</ul>
			{:else}
				<div
					{...api.getContentProps()}
					class="mt-1 p-2 border border-base rounded-lg bg-base w-full shadow-lg z-50"
				>
					<div class="text-sm text-muted px-1 py-1">No matches found</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
