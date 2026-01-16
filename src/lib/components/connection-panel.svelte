<script lang="ts">
	import { Plug, PlugZap, LoaderCircle, CircleAlert, ChevronDown, Circle } from 'lucide-svelte';
	import { wwise } from '$lib/wwise/connection.svelte';

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
		class="px-3 border rounded-lg flex gap-2 h-9 cursor-pointer transition-all items-center {wwise.status ===
		'connected'
			? 'border-green-500/25 bg-green-500/10 hover:border-green-500/40 hover:bg-green-500/15'
			: wwise.status === 'connecting'
				? 'border-wwise/25 bg-wwise/10'
				: 'border-surface-200 bg-surface-100 dark:border-surface-700 hover:border-surface-300 dark:bg-surface-800 dark:hover:border-surface-600'}"
	>
		{#if wwise.status === 'connecting'}
			<LoaderCircle size={14} class="text-wwise animate-spin" />
			<span class="text-sm text-wwise font-medium">Connecting...</span>
		{:else if wwise.status === 'connected'}
			<span class="flex h-2 w-2 relative">
				<span
					class="rounded-full bg-green-400 opacity-75 inline-flex h-full w-full absolute animate-ping"
				></span>
				<span class="rounded-full bg-green-500 inline-flex h-2 w-2 relative"></span>
			</span>
			<span class="text-sm text-green-600 font-medium max-w-32 truncate dark:text-green-400">
				{wwise.project?.name || 'Connected'}
			</span>
		{:else}
			<Circle size={8} class="text-surface-400 fill-surface-400" />
			<span class="text-sm text-muted font-medium">Offline</span>
		{/if}
		<ChevronDown
			size={14}
			class="text-muted transition-transform {showPanel ? 'rotate-180' : ''}"
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
		></div>
		<div
			class="mt-2 border border-base rounded-xl bg-base w-72 shadow-xl right-0 top-full absolute z-50 overflow-hidden"
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
							class="rounded-lg bg-surface-100 flex h-10 w-10 items-center justify-center dark:bg-surface-800"
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
								class="text-sm text-base px-3 border border-base rounded-lg bg-surface-50 h-9 w-full transition-all focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
							/>
						</div>
						<div>
							<label for="conn-port" class="text-xs text-muted mb-1.5 block">Port</label>
							<input
								id="conn-port"
								type="number"
								bind:value={port}
								placeholder="8080"
								class="text-sm text-base px-3 border border-base rounded-lg bg-surface-50 h-9 w-full transition-all focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
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
						Add <code class="text-wwise px-1 py-0.5 rounded bg-wwise/10">https://wwiser.app</code>
						to
						<strong>User Preferences → Allow browser connections from</strong>.
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
