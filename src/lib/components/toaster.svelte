<script lang="ts">
	import * as toast from '@zag-js/toast';
	import { normalizeProps, useMachine, portal } from '@zag-js/svelte';
	import { toaster } from '$lib/components/toast.svelte';
	import ToastItem from '$lib/components/toast-item.svelte';

	const id = $props.id();
	const service = useMachine(toast.group.machine, () => ({
		id,
		store: toaster
	}));

	const api = $derived(toast.group.connect(service, normalizeProps));
</script>

<div use:portal {...api.getGroupProps()} class="toast-group">
	{#each api.getToasts() as t, index (t.id)}
		<ToastItem toast={t} {index} parent={service} />
	{/each}
</div>
