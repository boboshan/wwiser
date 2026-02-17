<script lang="ts">
	import { Plug, PlugZap, LoaderCircle, CircleAlert, ChevronDown, Circle } from 'lucide-svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut, cubicIn } from 'svelte/easing';

	let host = $state('localhost');
	let port = $state(8080);
	let showPanel = $state(false);

	async function handleConnect() {
		await wwise.connect(host, port);
	}

	function handleDisconnect() {
		wwise.disconnect();
	}
</script>

<!-- Connection Status Button -->
<div class="relative">
	<button
		onclick={() => (showPanel = !showPanel)}
		aria-label="Connection status"
		class="p-2 rounded-lg flex cursor-pointer transition-all items-center justify-center lg:px-3 lg:border lg:gap-2 lg:h-9 {wwise.status ===
		'connected'
			? 'bg-hover lg:border-green-500/25 lg:bg-green-500/10 hover:lg:border-green-500/40 hover:lg:bg-green-500/15'
			: wwise.status === 'connecting'
				? 'bg-hover lg:border-wwise/25 lg:bg-wwise/10'
				: 'bg-hover lg:border-surface-200 lg:bg-surface-100 hover:lg:border-surface-300 lg:dark:border-surface-700 lg:dark:bg-surface-800 lg:dark:hover:border-surface-600'}"
	>
		{#if wwise.status === 'connecting'}
			<LoaderCircle size={14} class="text-wwise animate-spin" />
			<span class="text-sm text-wwise font-medium hidden lg:inline">Connecting...</span>
		{:else if wwise.status === 'connected'}
			<span class="flex h-2 w-2 relative">
				<span
					class="rounded-full bg-green-400 opacity-75 inline-flex h-full w-full absolute animate-ping"
				></span>
				<span class="rounded-full bg-green-500 inline-flex h-2 w-2 relative"></span>
			</span>
			<span
				class="text-sm text-green-600 font-medium max-w-32 hidden truncate dark:text-green-400 lg:inline"
			>
				{wwise.project?.name || 'Connected'}
			</span>
		{:else}
			<Circle size={8} class="text-surface-400 fill-surface-400" />
			<span class="text-sm text-muted font-medium hidden lg:inline">Offline</span>
		{/if}
		<ChevronDown
			size={14}
			class="text-muted hidden transition-transform lg:block {showPanel ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Floating Panel -->
	{#if showPanel}
		<div
			class="inset-0 fixed z-40"
			onclick={() => (showPanel = false)}
			onkeydown={(e) => e.key === 'Escape' && (showPanel = false)}
			role="button"
			tabindex="-1"
			aria-label="Close"
			transition:fade={{ duration: 100 }}
		></div>
		<div
			class="mt-2 border border-base rounded-xl bg-base w-72 shadow-xl right-0 top-full absolute z-50 overflow-hidden"
			in:scale={{ duration: 150, start: 0.96, opacity: 0, easing: cubicOut }}
			out:scale={{ duration: 100, start: 0.96, opacity: 0, easing: cubicIn }}
		>
			{#if wwise.status === 'connected'}
				<!-- Connected Panel -->
				<div class="p-4">
					<div class="mb-4 flex gap-3 items-center">
						<div class="rounded-lg bg-green-500/15 flex h-10 w-10 items-center justify-center">
							<PlugZap size={20} class="text-green-500" />
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm text-base font-medium m-0 truncate">
								{wwise.project?.name || 'Wwise Project'}
							</p>
							<p class="text-xs text-green-600 m-0 dark:text-green-400">
								Connected to {host}:{port}
							</p>
						</div>
					</div>

					{#if wwise.project?.path}
						<div class="mb-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
							<p class="text-xs text-muted mb-1">Project Path</p>
							<p class="text-xs text-base leading-relaxed m-0 break-all">{wwise.project.path}</p>
						</div>
					{/if}

					<button
						onclick={handleDisconnect}
						class="text-sm text-red-500 font-medium border border-red-500/25 rounded-lg bg-red-500/10 h-9 w-full cursor-pointer transition-colors hover:text-white hover:border-red-500 hover:bg-red-500"
					>
						Disconnect
					</button>
				</div>
			{:else}
				<!-- Disconnected Panel -->
				<div class="p-4">
					<div class="mb-4 flex gap-3 items-center">
						<div
							class="rounded-lg bg-surface-200 flex h-10 w-10 items-center justify-center dark:bg-surface-800"
						>
							<Plug size={20} class="text-muted" />
						</div>
						<div>
							<p class="text-sm text-base font-medium m-0">Connect to Wwise</p>
							<p class="text-xs text-muted m-0">Enter WAAPI server details</p>
						</div>
					</div>

					<div class="mb-4 space-y-3">
						<div>
							<label for="conn-host" class="text-xs text-muted mb-1.5 block">Host</label>
							<input
								id="conn-host"
								type="text"
								bind:value={host}
								placeholder="localhost"
								class="input-base text-base px-3 h-9"
							/>
						</div>
						<div>
							<label for="conn-port" class="text-xs text-muted mb-1.5 block">Port</label>
							<input
								id="conn-port"
								type="number"
								bind:value={port}
								placeholder="8080"
								class="input-base text-base px-3 h-9"
							/>
						</div>
					</div>

					{#if wwise.status === 'error' && wwise.error}
						<div
							class="mb-4 p-3 border border-red-500/20 rounded-lg bg-red-500/10 flex gap-2 items-start"
						>
							<CircleAlert size={14} class="text-red-500 mt-0.5 shrink-0" />
							<p class="text-xs text-red-500 m-0">{wwise.error}</p>
						</div>
					{/if}

					<button
						onclick={handleConnect}
						disabled={wwise.status === 'connecting'}
						class="text-sm text-white font-medium rounded-lg bg-wwise flex gap-2 h-9 w-full cursor-pointer transition-colors items-center justify-center active:bg-wwise-600 hover:bg-wwise-400 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if wwise.status === 'connecting'}
							<LoaderCircle size={14} class="animate-spin" />
							<span>Connecting...</span>
						{:else}
							<Plug size={14} />
							<span>Connect</span>
						{/if}
					</button>

					<p class="text-xs text-muted leading-relaxed mb-0 mt-3">
						Add <code class="text-wwise px-1 py-0.5 rounded bg-wwise/10">https://wwiser.net</code>
						to
						<strong>User Preferences → Allow browser connections from</strong>. Do not include
						<code class="text-amber-500 px-1 py-0.5 rounded bg-amber-500/20">/</code> at the end.
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
