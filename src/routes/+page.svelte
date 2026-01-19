<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Client-side redirect for PWA/prerender compatibility
	onMount(() => {
		goto('/explore', { replaceState: true });
	});
</script>

<div class="text-muted bg-base flex h-screen items-center justify-center">
	<p>Redirecting...</p>
</div>
