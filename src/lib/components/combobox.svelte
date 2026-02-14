<script lang="ts" module>
	export interface ComboboxItem {
		label: string;
		value: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import * as combobox from '@zag-js/combobox';
	import { portal, useMachine, normalizeProps } from '@zag-js/svelte';
	import { ChevronDown, Check } from 'lucide-svelte';

	interface Props {
		items: ComboboxItem[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id: string;
		allowCustomValue?: boolean;
		onchange?: (value: string) => void;
		variant?: 'default' | 'accent';
		compact?: boolean;
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
		compact = false,
		inputClass = '',
		itemClass = ''
	}: Props = $props();

	let filteredItems = $state.raw<ComboboxItem[]>([]);

	const currentItems = $derived.by(() => {
		if (filteredItems.length > 0) return filteredItems;
		return allItems;
	});

	const collection = $derived(
		combobox.collection({
			items: currentItems,
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
				filteredItems = filtered.length > 0 ? filtered : [];
			}
		},
		onOpenChange(details) {
			if (details.open) {
				filteredItems = [];
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
	<div {...api.getControlProps()} class="flex items-center relative">
		<input
			{...api.getInputProps()}
			{placeholder}
			spellcheck="false"
			autocomplete="off"
			class={[
				'text-sm pl-3 pr-10 border rounded-lg w-full transition-all focus-visible:border-wwise focus-visible:outline-none focus-visible:ring-2 dark:focus-visible:ring-wwise/30 bg-surface-50 dark:bg-surface-900 disabled:opacity-50 disabled:cursor-not-allowed',
				compact ? 'h-8' : 'h-10',
				variant === 'accent' && api.value.length > 0
					? 'text-wwise border-wwise/30'
					: 'text-base border-input',
				inputClass
			]}
		/>
		<button
			{...api.getTriggerProps()}
			tabindex={-1}
			class="text-muted flex w-10 transition-colors items-center inset-y-0 right-0 justify-center absolute hover:text-base"
		>
			<ChevronDown
				size={15}
				class={`transition-transform duration-200 ${api.open ? 'rotate-180' : ''}`}
			/>
		</button>
	</div>

	<div use:portal {...api.getPositionerProps()}>
		{#if api.open}
			{#if currentItems.length > 0}
				<ul {...api.getContentProps()} class="dropdown-content">
					{#each currentItems.slice(0, 50) as item (item.value)}
						<li
							{...api.getItemProps({ item })}
							class={['dropdown-item flex items-center justify-between', itemClass]}
						>
							<span {...api.getItemTextProps({ item })} class="truncate">{item.label}</span>
							<span {...api.getItemIndicatorProps({ item })} class="text-wwise ml-2 shrink-0">
								<Check size={14} />
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<div {...api.getContentProps()} class="dropdown-content py-8 text-center">
					<div class="text-sm text-muted">No matches found</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
