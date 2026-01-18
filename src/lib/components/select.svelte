<script lang="ts" module>
	export interface SelectItem {
		label: string;
		value: string;
		description?: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import * as select from '@zag-js/select';
	import { useMachine, normalizeProps } from '@zag-js/svelte';
	import { ChevronDown, Check } from 'lucide-svelte';

	interface Props {
		items: SelectItem[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id: string;
		onchange?: (value: string) => void;
	}

	let {
		items,
		value = $bindable(),
		placeholder = 'Select...',
		disabled = false,
		id,
		onchange
	}: Props = $props();

	const collection = $derived(
		select.collection({
			items,
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => item.disabled ?? false
		})
	);

	const service = useMachine(select.machine, () => ({
		id,
		collection,
		value: value ? [value] : [],
		onValueChange(details) {
			const newValue = details.value[0];
			value = newValue;
			onchange?.(newValue);
		},
		disabled,
		positioning: {
			sameWidth: true,
			placement: 'bottom' as const
		}
	}));

	const api = $derived(select.connect(service, normalizeProps));
</script>

<div {...api.getRootProps()} class="relative">
	<div {...api.getControlProps()}>
		<button
			{...api.getTriggerProps()}
			class="text-sm text-base px-3 pr-8 border border-base rounded-lg bg-surface-50 flex h-10 w-full transition-colors items-center focus:outline-none focus:border-wwise dark:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-wwise/20"
		>
			<span {...api.getValueTextProps()} class="truncate">
				{api.valueAsString || placeholder}
			</span>
			<ChevronDown
				size={14}
				class="text-muted transition-transform right-3 absolute {api.open ? 'rotate-180' : ''}"
			/>
		</button>
	</div>

	<div {...api.getPositionerProps()}>
		{#if api.open}
			<ul
				{...api.getContentProps()}
				class="mt-1 border border-base rounded-lg bg-base max-h-64 w-full shadow-lg z-50 overflow-x-hidden overflow-y-auto"
			>
				{#each items as item (item.value)}
					<li
						{...api.getItemProps({ item })}
						class="data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed text-sm px-3 py-2 flex cursor-pointer transition-colors items-center justify-between data-[highlighted]:text-wwise data-[state=checked]:text-wwise data-[highlighted]:bg-wwise/20 data-[state=checked]:bg-wwise/10"
					>
						<div class="flex flex-col min-w-0">
							<span class="text-sm" {...api.getItemTextProps({ item })}>{item.label}</span>
							{#if item.description}
								<span class="text-[11px] text-muted font-mono truncate">{item.description}</span>
							{/if}
						</div>
						<span {...api.getItemIndicatorProps({ item })} class="shrink-0">
							<Check size={14} />
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
