<script lang="ts" module>
	export interface ComboboxItem {
		label: string;
		value: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import * as combobox from '@zag-js/combobox';
	import { useMachine, normalizeProps } from '@zag-js/svelte';

	interface Props {
		items: ComboboxItem[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id: string;
		allowCustomValue?: boolean;
		onchange?: (value: string) => void;
		variant?: 'default' | 'accent';
		inputClass?: string;
		itemClass?: string;
	}

	let {
		items: allItems,
		value = $bindable(),
		placeholder = 'Search...',
		disabled = false,
		id,
		allowCustomValue = true,
		onchange,
		variant = 'default',
		inputClass = '',
		itemClass = ''
	}: Props = $props();

	let filteredItems = $state.raw<ComboboxItem[]>(allItems);

	const collection = $derived(
		combobox.collection({
			items: filteredItems,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => item.disabled ?? false
		})
	);

	// Derive the display label from the current value
	const displayLabel = $derived(allItems.find((item) => item.value === value)?.label ?? '');

	const service = useMachine(combobox.machine, () => ({
		id,
		collection,
		openOnClick: true,
		value: value ? [value] : [],
		inputValue: displayLabel,
		allowCustomValue,
		inputBehavior: 'autohighlight' as const,
		onValueChange(details) {
			const newValue = details.value[0];
			value = newValue;
			onchange?.(newValue);
		},
		onInputValueChange({ inputValue, reason }) {
			if (reason === 'input-change') {
				const query = inputValue.toLowerCase();
				const filtered = allItems.filter(
					(item) =>
						item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
				);
				filteredItems = filtered.length > 0 ? filtered : allItems;
			}
		},
		onOpenChange(details) {
			if (details.open) {
				filteredItems = allItems;
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
				variant === 'accent' && api.value.length > 0
					? 'text-wwise border-wwise/30'
					: 'text-base border-base',
				inputClass
			]}
		/>
	</div>

	<div {...api.getPositionerProps()}>
		{#if api.open}
			{#if filteredItems.length > 0}
				<ul
					{...api.getContentProps()}
					class="mt-1 border border-base rounded-lg bg-base max-h-64 w-full shadow-lg z-50 overflow-x-hidden overflow-y-auto"
				>
					{#each filteredItems.slice(0, 50) as item (item.value)}
						<li
							{...api.getItemProps({ item })}
							class={[
								'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed text-sm px-3 py-2 cursor-pointer transition-colors data-[highlighted]:text-wwise data-[state=checked]:text-wwise data-[highlighted]:bg-wwise/20 data-[state=checked]:bg-wwise/10',
								itemClass
							]}
						>
							<span {...api.getItemTextProps({ item })}>{item.label}</span>
						</li>
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
