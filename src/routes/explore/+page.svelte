<script lang="ts">
	import { onDestroy } from 'svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import {
		Play,
		Radio,
		Square,
		Trash2,
		Copy,
		Plug,
		LoaderCircle,
		CircleAlert
	} from 'lucide-svelte';
	import MonacoEditor from '$lib/components/monaco-editor.svelte';
	import Combobox from '$lib/components/combobox.svelte';
	import Select from '$lib/components/select.svelte';
	import JSON5 from 'json5';

	// Types
	interface WaapiItem {
		uri: string;
	}

	interface LogEntry {
		id: number;
		type: 'call' | 'subscribe' | 'result' | 'event' | 'error';
		timestamp: Date;
		uri?: string;
		data: unknown;
	}

	interface ActiveSubscription {
		uri: string;
		unsubscribe: () => Promise<void>;
	}

	// Connection state
	let host = $state('localhost');
	let port = $state(8080);

	async function handleConnect() {
		await wwise.connect(host, port);
	}

	// State
	let mode = $state<'call' | 'subscribe'>('call');
	let functions = $state<WaapiItem[]>([]);
	let topics = $state<WaapiItem[]>([]);
	let selectedUri = $state('');
	let selectedRecipe = $state('');
	let argsCode = $state('{}');
	let optionsCode = $state('{}');
	let isLoading = $state(false);
	let logs = $state<LogEntry[]>([]);
	let subscriptions = $state<ActiveSubscription[]>([]);
	let logIdCounter = 0;

	// Monaco editor refs
	let argsEditor = $state<MonacoEditor | null>(null);
	let optionsEditor = $state<MonacoEditor | null>(null);

	// Recipes for quick start
	const recipes = [
		{
			name: 'Get Selected Objects',
			uri: 'ak.wwise.ui.getSelectedObjects',
			args: '{}',
			options: `{
  return: ["id", "name", "type", "path"]
}`,
			mode: 'call' as const
		},
		{
			name: 'Get Project Info',
			uri: 'ak.wwise.core.getInfo',
			args: '{}',
			options: '{}',
			mode: 'call' as const
		},
		{
			name: 'Search by Name',
			uri: 'ak.wwise.core.object.get',
			args: `{
  from: {
    search: ["name:MySound"]
  }
}`,
			options: `{
  return: ["id", "name", "type", "path"]
}`,
			mode: 'call' as const
		},
		{
			name: 'Get Object by ID',
			uri: 'ak.wwise.core.object.get',
			args: `{
  from: {
    id: ["paste-object-id-here"]
  }
}`,
			options: `{
  return: ["id", "name", "type", "@Volume", "@Pitch"]
}`,
			mode: 'call' as const
		},
		{
			name: 'Selection Changed',
			uri: 'ak.wwise.ui.selectionChanged',
			args: '{}',
			options: `{
  return: ["id", "name", "type"]
}`,
			mode: 'subscribe' as const
		},
		{
			name: 'Object Created',
			uri: 'ak.wwise.core.object.created',
			args: '{}',
			options: `{
  return: ["id", "name", "type", "path"]
}`,
			mode: 'subscribe' as const
		}
	];

	// Recipe items for Select component based on current mode
	const recipeItems = $derived(
		recipes
			.filter((r) => r.mode === mode)
			.map((r) => ({ label: r.name, value: r.name, description: r.uri }))
	);

	// Available items based on mode for Combobox
	const comboboxItems = $derived(
		(mode === 'call' ? functions : topics).map((item) => ({
			label: item.uri,
			value: item.uri
		}))
	);

	// Fetch available functions and topics
	async function fetchWaapiSchema() {
		if (!wwise.isConnected) return;

		try {
			const [funcs, tops] = await Promise.all([wwise.getFunctions(), wwise.getTopics()]);
			functions = (funcs ?? []).filter((f) => f?.uri).sort((a, b) => a.uri.localeCompare(b.uri));
			topics = (tops ?? []).filter((t) => t?.uri).sort((a, b) => a.uri.localeCompare(b.uri));

			// Set default selection
			if (!selectedUri && functions.length > 0) {
				selectedUri = 'ak.wwise.core.getInfo';
			}
		} catch (e) {
			addLog('error', { message: 'Failed to fetch WAAPI schema', error: String(e) });
		}
	}

	// Add log entry
	function addLog(type: LogEntry['type'], data: unknown, uri?: string) {
		logs = [
			{
				id: logIdCounter++,
				type,
				timestamp: new Date(),
				uri,
				data
			},
			...logs
		].slice(0, 100); // Keep last 100 entries
	}

	// Execute call
	async function executeCall() {
		if (!wwise.isConnected || !selectedUri) return;

		isLoading = true;

		try {
			const args = JSON5.parse(argsCode);
			const options = JSON5.parse(optionsCode);

			addLog('call', { args, options }, selectedUri);

			const result = await wwise.call(selectedUri, args, options);
			addLog('result', result, selectedUri);
		} catch (e) {
			addLog('error', { message: String(e) }, selectedUri);
		} finally {
			isLoading = false;
		}
	}

	// Execute subscription
	async function executeSubscribe() {
		if (!wwise.isConnected || !selectedUri) return;

		// Check if already subscribed
		if (subscriptions.some((s) => s.uri === selectedUri)) {
			addLog('error', { message: 'Already subscribed to this topic' }, selectedUri);
			return;
		}

		isLoading = true;

		try {
			const options = JSON5.parse(optionsCode);

			addLog('subscribe', { options }, selectedUri);

			const sub = await wwise.subscribe(
				selectedUri,
				(data) => {
					addLog('event', data, selectedUri);
				},
				options
			);

			subscriptions = [...subscriptions, { uri: selectedUri, unsubscribe: sub.unsubscribe }];
		} catch (e) {
			addLog('error', { message: String(e) }, selectedUri);
		} finally {
			isLoading = false;
		}
	}

	// Unsubscribe
	async function unsubscribe(uri: string) {
		const sub = subscriptions.find((s) => s.uri === uri);
		if (sub) {
			await sub.unsubscribe();
			subscriptions = subscriptions.filter((s) => s.uri !== uri);
			addLog('result', { message: 'Unsubscribed' }, uri);
		}
	}

	// Unsubscribe all
	async function unsubscribeAll() {
		for (const sub of subscriptions) {
			await sub.unsubscribe();
		}
		subscriptions = [];
		addLog('result', { message: 'Unsubscribed from all topics' });
	}

	// Clear logs
	function clearLogs() {
		logs = [];
	}

	// Copy to clipboard
	async function copyToClipboard(text: string) {
		await navigator.clipboard.writeText(text);
	}

	// Apply recipe values (uri, args, options) to the UI
	function applyRecipeValues(recipe: (typeof recipes)[number]) {
		selectedUri = recipe.uri;
		argsCode = recipe.args;
		optionsCode = recipe.options;
		argsEditor?.setValue(recipe.args);
		optionsEditor?.setValue(recipe.options);
	}

	// Apply recipe by name (called from Select onchange)
	function applyRecipe(recipeName: string) {
		const recipe = recipes.find((r) => r.name === recipeName);
		if (!recipe) return;
		if (recipe.mode) mode = recipe.mode;
		applyRecipeValues(recipe);
	}

	// Format timestamp
	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
	}

	// Get log color
	function getLogColor(type: LogEntry['type']): string {
		switch (type) {
			case 'call':
				return 'text-blue-500';
			case 'subscribe':
				return 'text-purple-500';
			case 'result':
				return 'text-green-500';
			case 'event':
				return 'text-wwise';
			case 'error':
				return 'text-red-500';
			default:
				return 'text-muted';
		}
	}

	// Watch connection changes
	$effect(() => {
		if (wwise.isConnected) {
			fetchWaapiSchema();
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		// Unsubscribe from all
		for (const sub of subscriptions) {
			sub.unsubscribe();
		}
	});
</script>

<div class="flex flex-col gap-6 h-full">
	{#if !wwise.isConnected}
		<!-- Inline Connect Form -->
		<div class="max-w-sm w-full">
			<div class="p-6 border border-base rounded-2xl bg-base space-y-5">
				<div class="flex gap-3 items-center">
					<div
						class="rounded-lg bg-surface-200 flex shrink-0 h-10 w-10 items-center justify-center dark:bg-surface-800"
					>
						<Plug size={20} class="text-muted" />
					</div>
					<div>
						<p class="text-sm text-base font-medium m-0">Connect to Wwise</p>
						<p class="text-xs text-muted m-0">Enter WAAPI server details</p>
					</div>
				</div>

				<div class="space-y-3">
					<div>
						<label for="explore-host" class="text-xs text-muted mb-1.5 block">Host</label>
						<input
							id="explore-host"
							type="text"
							bind:value={host}
							placeholder="localhost"
							class="input-base text-base px-3 h-9"
						/>
					</div>
					<div>
						<label for="explore-port" class="text-xs text-muted mb-1.5 block">Port</label>
						<input
							id="explore-port"
							type="number"
							bind:value={port}
							placeholder="8080"
							class="input-base text-base px-3 h-9"
						/>
					</div>
				</div>

				{#if wwise.status === 'error' && wwise.error}
					<div class="p-3 border border-red-500/20 rounded-lg bg-red-500/10 flex gap-2 items-start">
						<CircleAlert size={14} class="text-red-500 mt-0.5 shrink-0" />
						<p class="text-xs text-red-500 m-0">{wwise.error}</p>
					</div>
				{/if}

				<button
					onclick={handleConnect}
					disabled={wwise.status === 'connecting'}
					class="btn-action h-9 w-full"
				>
					{#if wwise.status === 'connecting'}
						<LoaderCircle size={14} class="animate-spin" />
						<span>Connecting...</span>
					{:else}
						<Plug size={14} />
						<span>Connect</span>
					{/if}
				</button>

				<p class="text-xs text-muted leading-relaxed m-0">
					Add <code class="text-wwise px-1 py-0.5 rounded bg-wwise/10">https://wwiser.net</code>
					to
					<strong>User Preferences → Allow browser connections from</strong>. Do not include
					<code class="text-amber-500 px-1 py-0.5 rounded bg-amber-500/20">/</code> at the end.
				</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 flex-col gap-4 min-h-0">
			<!-- Mode Toggle & URI Selection -->
			<div class="flex flex-wrap gap-3 items-start">
				<!-- Mode Toggle -->
				<div class="p-1 rounded-lg bg-surface-200 flex dark:bg-surface-800">
					<button
						onclick={() => {
							mode = 'call';
							const recipe = recipes.find((r) => r.name === selectedRecipe && r.mode === 'call');
							if (recipe) {
								applyRecipeValues(recipe);
							} else {
								selectedUri = '';
							}
						}}
						class={[
							'px-4 h-8 rounded-md text-sm font-medium transition-all',
							mode === 'call'
								? 'bg-base text-surface-900 dark:text-surface-100 shadow-sm'
								: 'text-muted hover:text-surface-900 dark:hover:text-surface-100'
						]}
					>
						Call
					</button>
					<button
						onclick={() => {
							mode = 'subscribe';
							const recipe = recipes.find(
								(r) => r.name === selectedRecipe && r.mode === 'subscribe'
							);
							if (recipe) {
								applyRecipeValues(recipe);
							} else {
								selectedUri = '';
							}
						}}
						class={[
							'px-4 h-8 rounded-md text-sm font-medium transition-all',
							mode === 'subscribe'
								? 'bg-base text-surface-900 dark:text-surface-100 shadow-sm'
								: 'text-muted hover:text-surface-900 dark:hover:text-surface-100'
						]}
					>
						Subscribe
					</button>
				</div>

				<!-- URI Selection -->
				<div class="flex-1 min-w-64">
					<Combobox
						id="uri-selector"
						items={comboboxItems}
						bind:value={selectedUri}
						placeholder="Search {mode === 'call' ? 'functions' : 'topics'}..."
						allowCustomValue={true}
						variant="accent"
						inputClass="font-mono"
						itemClass="font-mono"
					/>
				</div>

				<!-- Recipes -->
				<div class="w-48">
					<Select
						id="recipe-selector"
						items={recipeItems}
						bind:value={selectedRecipe}
						placeholder="Recipes"
						onchange={applyRecipe}
					/>
				</div>

				<!-- Execute Button -->
				{#if mode === 'call'}
					<button onclick={executeCall} disabled={!selectedUri || isLoading} class="btn-action">
						<Play size={16} />
						{isLoading ? 'Calling...' : 'Execute'}
					</button>
				{:else}
					<button
						onclick={executeSubscribe}
						disabled={!selectedUri || isLoading}
						class="text-sm text-white font-medium px-5 rounded-lg bg-purple-600 flex gap-2 h-10 transition-colors items-center hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Radio size={16} />
						{isLoading ? 'Subscribing...' : 'Subscribe'}
					</button>
				{/if}
			</div>

			<!-- Editors -->
			<div class="gap-4 grid grid-cols-1 lg:grid-cols-2">
				<!-- Arguments Editor -->
				<div class="space-y-2">
					<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
						Arguments
					</span>
					<MonacoEditor
						bind:this={argsEditor}
						value={argsCode}
						onchange={(v) => (argsCode = v)}
						height="8rem"
					/>
				</div>

				<!-- Options Editor -->
				<div class="space-y-2">
					<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
						Options
					</span>
					<MonacoEditor
						bind:this={optionsEditor}
						value={optionsCode}
						onchange={(v) => (optionsCode = v)}
						height="8rem"
					/>
				</div>
			</div>

			<!-- Active Subscriptions -->
			{#if subscriptions.length > 0}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
							Active Subscriptions ({subscriptions.length})
						</span>
						<button
							onclick={unsubscribeAll}
							class="text-xs text-red-500 transition-colors hover:text-red-400"
						>
							Unsubscribe All
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each subscriptions as sub (sub.uri)}
							<div
								class="text-xs text-purple-600 font-mono px-2 py-1 rounded-full bg-purple-500/10 flex gap-2 items-center dark:text-purple-400"
							>
								<Radio size={12} class="animate-pulse" />
								{sub.uri}
								<button
									onclick={() => unsubscribe(sub.uri)}
									aria-label="Unsubscribe"
									class="transition-colors hover:text-red-500"
								>
									<Square size={12} />
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Console Output -->
			<div class="flex flex-1 flex-col min-h-0">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
						Console ({logs.length})
					</span>
					<button
						onclick={clearLogs}
						class="text-xs text-muted flex gap-1 transition-colors items-center hover:text-surface-900 dark:hover:text-surface-100"
					>
						<Trash2 size={12} />
						Clear
					</button>
				</div>
				<div
					class="text-xs font-mono p-3 border border-base rounded-lg bg-surface-100 flex-1 min-h-48 overflow-y-auto space-y-2 dark:bg-surface-950"
				>
					{#if logs.length === 0}
						<div class="text-surface-400">No logs yet. Execute a call or subscribe to a topic.</div>
					{:else}
						{#each logs as log (log.id)}
							<div class="group">
								<div class="flex gap-2 items-start">
									<span class="text-surface-400 shrink-0 dark:text-surface-500"
										>{formatTime(log.timestamp)}</span
									>
									<span class={[getLogColor(log.type), 'shrink-0 uppercase font-semibold']}>
										[{log.type}]
									</span>
									{#if log.uri}
										<span class="text-surface-500 shrink-0 dark:text-surface-400">{log.uri}</span>
									{/if}
									<button
										onclick={() => copyToClipboard(JSON.stringify(log.data, null, 2))}
										aria-label="Copy to clipboard"
										class="text-surface-400 opacity-0 transition-opacity hover:text-surface-600 group-hover:opacity-100 dark:hover:text-surface-300"
									>
										<Copy size={12} />
									</button>
								</div>
								<pre
									class="text-surface-700 mt-1 pl-20 whitespace-pre-wrap break-all dark:text-surface-300">{JSON.stringify(
										log.data,
										null,
										2
									)}</pre>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
