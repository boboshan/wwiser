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
	import { portal, useMachine, normalizeProps } from '@zag-js/svelte';
	import { ChevronDown, Check } from 'lucide-svelte';

	interface Props {
		items: SelectItem[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		id: string;
		onchange?: (value: string) => void;
		compact?: boolean;
		triggerClass?: string;
	}

	let {
		items,
		value = $bindable(),
		placeholder = 'Select...',
		disabled = false,
		id,
		onchange,
		compact = false,
		triggerClass = ''
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
			class={[
				'text-sm text-base pl-3 pr-9 border rounded-lg bg-surface-50 flex w-full transition-all items-center disabled:opacity-50 disabled:cursor-not-allowed dark:bg-surface-900 border-input ring-focus',
				compact ? 'h-8' : 'h-10',
				triggerClass
			]}
		>
			<span {...api.getValueTextProps()} class={['truncate', !api.valueAsString && 'text-muted']}>
				{api.valueAsString || placeholder}
			</span>
			<ChevronDown
				size={15}
				class="text-muted transition-transform duration-200 right-3 absolute {api.open
					? 'rotate-180'
					: ''}"
			/>
		</button>
	</div>

	<div use:portal {...api.getPositionerProps()}>
		{#if api.open}
			<ul {...api.getContentProps()} class="dropdown-content">
				{#each items as item (item.value)}
					<li
						{...api.getItemProps({ item })}
						class="dropdown-item flex items-center justify-between"
					>
						<div class="flex flex-col min-w-0">
							<span class="text-sm" {...api.getItemTextProps({ item })}>{item.label}</span>
							{#if item.description}
								<span class="text-[11px] text-muted font-mono truncate">{item.description}</span>
							{/if}
						</div>
						<span {...api.getItemIndicatorProps({ item })} class="text-wwise ml-2 shrink-0">
							<Check size={14} />
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
