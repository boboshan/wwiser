<script lang="ts">
	import * as toast from '@zag-js/toast';
	import { normalizeProps, useMachine } from '@zag-js/svelte';
	import { CircleCheck, CircleX, Info, Loader, X } from 'lucide-svelte';

	interface Props {
		toast: toast.Options;
		index: number;
		parent: toast.GroupService;
	}

	const { toast: toastOptions, index, parent }: Props = $props();

	const machineProps = $derived({ ...toastOptions, parent, index });
	const service = useMachine(toast.machine, () => machineProps);
	const api = $derived(toast.connect(service, normalizeProps));

	const icons = {
		info: Info,
		success: CircleCheck,
		error: CircleX,
		loading: Loader
	} as const;

	const Icon = $derived(icons[api.type as keyof typeof icons]);
</script>

<div
	{...api.getRootProps()}
	class="toast-root text-sm border border-base rounded-lg bg-base w-[min(28rem,calc(100vw-2rem))] pointer-events-auto shadow-lg"
>
	<div class="px-3.5 py-3 flex gap-3 items-start">
		{#if Icon}
			<div
				class="mt-0.5 shrink-0"
				class:text-wwise={api.type === 'info'}
				class:text-green-600={api.type === 'success'}
				class:text-red-600={api.type === 'error'}
				class:text-surface-500={api.type === 'loading'}
				class:dark:text-green-400={api.type === 'success'}
				class:dark:text-red-400={api.type === 'error'}
			>
				<Icon size={16} class={api.type === 'loading' ? 'animate-spin' : ''} />
			</div>
		{/if}

		<div class="flex-1 min-w-0">
			{#if api.title}
				<p {...api.getTitleProps()} class="text-base leading-snug font-medium">{api.title}</p>
			{/if}
			{#if api.description}
				<p {...api.getDescriptionProps()} class="text-muted leading-snug mt-0.5">
					{api.description}
				</p>
			{/if}
		</div>

		<button
			onclick={() => api.dismiss()}
			class="text-muted p-1 rounded-md shrink-0 transition-colors hover:text-base -mr-1 -mt-0.5 hover:bg-surface-200 dark:hover:bg-surface-800"
			aria-label="Dismiss toast"
		>
			<X size={14} />
		</button>
	</div>
</div>
