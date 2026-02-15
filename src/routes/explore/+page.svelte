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
		CircleAlert,
		CircleStop
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
		type: 'call' | 'subscribe' | 'log' | 'result' | 'event' | 'error' | 'info';
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

	// =========================================================================
	// Shared state
	// =========================================================================
	let mode = $state<'call' | 'subscribe' | 'free'>('call');
	let logs = $state<LogEntry[]>([]);
	let subscriptions = $state<ActiveSubscription[]>([]);
	let logIdCounter = 0;
	let isLoading = $state(false);

	// =========================================================================
	// Call / Subscribe mode state
	// =========================================================================
	let functions = $state<WaapiItem[]>([]);
	let topics = $state<WaapiItem[]>([]);
	const DEFAULT_CALL_URI = 'ak.wwise.core.getInfo';
	const DEFAULT_SUBSCRIBE_URI = 'ak.wwise.ui.selectionChanged';

	// Per-mode state so each tab remembers its own selections
	let modeState = $state({
		call: { uri: DEFAULT_CALL_URI, recipe: '', args: '{}', options: '{}' },
		subscribe: { uri: DEFAULT_SUBSCRIBE_URI, recipe: '', args: '{}', options: '{}' },
		free: { uri: '', recipe: '', args: '{}', options: '{}' }
	});

	let current = $derived(modeState[mode]);

	// Editor refs for Call/Subscribe
	let argsEditor = $state<MonacoEditor | null>(null);
	let optionsEditor = $state<MonacoEditor | null>(null);

	// Call/Subscribe recipes
	const callRecipes = [
		{
			name: 'Get Selected Objects',
			uri: 'ak.wwise.ui.getSelectedObjects',
			args: '{}',
			options: `{\n\t"return": ["id", "name", "type", "path"]\n}`,
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
			args: `{\n\t"from": {\n\t\t"search": ["name:MySound"]\n\t}\n}`,
			options: `{\n\t"return": ["id", "name", "type", "path"]\n}`,
			mode: 'call' as const
		},
		{
			name: 'Get Object by ID',
			uri: 'ak.wwise.core.object.get',
			args: `{\n\t"from": {\n\t\t"id": ["paste-object-id-here"]\n\t}\n}`,
			options: `{\n\t"return": ["id", "name", "type", "@Volume", "@Pitch"]\n}`,
			mode: 'call' as const
		},
		{
			name: 'Selection Changed',
			uri: 'ak.wwise.ui.selectionChanged',
			args: '{}',
			options: `{\n\t"return": ["id", "name", "type"]\n}`,
			mode: 'subscribe' as const
		},
		{
			name: 'Object Created',
			uri: 'ak.wwise.core.object.created',
			args: '{}',
			options: `{\n\t"return": ["id", "name", "type", "path"]\n}`,
			mode: 'subscribe' as const
		}
	];

	const callRecipeItems = $derived(
		callRecipes
			.filter((r) => r.mode === mode)
			.map((r) => ({ label: r.name, value: r.name, description: r.uri }))
	);

	const comboboxItems = $derived(
		(mode === 'call' ? functions : topics).map((item) => ({
			label: item.uri,
			value: item.uri
		}))
	);

	// =========================================================================
	// Free mode state
	// =========================================================================
	let abortController: AbortController | null = null;
	let codeEditor = $state<MonacoEditor | null>(null);

	const defaultCode = `// Write JavaScript to interact with Wwise via WAAPI
// Available: wwise.call(uri, args?, options?), wwise.subscribe(uri, callback, options?)
//            log(...args), sleep(ms)

const info = await wwise.call('ak.wwise.core.getInfo');
log('Project info:', info);
`;

	let code = $state(defaultCode);

	const freeRecipes = [
		{
			name: 'Get Selected Objects',
			description: 'Fetch currently selected objects with properties',
			code: `\
const result = await wwise.call(
	'ak.wwise.ui.getSelectedObjects',
	{},
	{ return: ['id', 'name', 'type', 'path'] }
);

log('Selected objects:', result.objects);
`
		},
		{
			name: 'Get Project Info',
			description: 'Retrieve project name and path',
			code: `\
const info = await wwise.call('ak.wwise.core.getInfo');
log('Project:', info);
`
		},
		{
			name: 'Search by Name',
			description: 'Find objects matching a name pattern',
			code: `\
const result = await wwise.call(
	'ak.wwise.core.object.get',
	{ from: { search: ['name:MySound'] } },
	{ return: ['id', 'name', 'type', 'path'] }
);

log('Found', result.return.length, 'objects:');
for (const obj of result.return) {
	log(' ', obj.type, obj.name, obj.path);
}
`
		},
		{
			name: 'Get Object Properties',
			description: 'Read Volume and Pitch from selected objects',
			code: `\
// First get selected objects
const sel = await wwise.call(
	'ak.wwise.ui.getSelectedObjects',
	{},
	{ return: ['id', 'name', 'type', '@Volume', '@Pitch'] }
);

if (sel.objects.length === 0) {
	log('No objects selected');
} else {
	for (const obj of sel.objects) {
		log(obj.name, '- Volume:', obj['@Volume'], '- Pitch:', obj['@Pitch']);
	}
}
`
		},
		{
			name: 'Watch Selection Changes',
			description: 'Subscribe to selection change events',
			code: `\
const sub = await wwise.subscribe(
	'ak.wwise.ui.selectionChanged',
	(data) => {
		log('Selection changed:', data);
	},
	{ return: ['id', 'name', 'type'] }
);

log('Listening for selection changes...');
`
		},
		{
			name: 'Batch Set Volume',
			description: 'Set volume on all selected objects',
			code: `\
// Set volume on all selected objects
const sel = await wwise.call(
	'ak.wwise.ui.getSelectedObjects',
	{},
	{ return: ['id', 'name', 'type'] }
);

if (sel.objects.length === 0) {
	log('No objects selected');
} else {
	const volume = -6; // dB
	for (const obj of sel.objects) {
		await wwise.call('ak.wwise.core.object.setProperty', {
			object: obj.id,
			property: 'Volume',
			value: volume
		});
		log('Set', obj.name, 'volume to', volume, 'dB');
	}
	log('Done! Updated', sel.objects.length, 'objects');
}
`
		},
		{
			name: 'List All Events',
			description: 'Get all Event objects in the project',
			code: `\
const result = await wwise.call(
	'ak.wwise.core.object.get',
	{ from: { ofType: ['Event'] } },
	{ return: ['id', 'name', 'path'] }
);

log('Found', result.return.length, 'events:');
for (const evt of result.return) {
	log(' ', evt.name, '-', evt.path);
}
`
		}
	];

	const freeRecipeItems = freeRecipes.map((r) => ({
		label: r.name,
		value: r.name,
		description: r.description
	}));

	// Type definitions for Monaco IntelliSense in Free mode
	const wwiseTypeDefs = `
/** Sleep for the given number of milliseconds. */
declare function sleep(ms: number): Promise<void>;

/** Log values to the console output below. Accepts multiple arguments like console.log(). */
declare function log(...args: any[]): void;

interface WwiseCallResult {
  [key: string]: any;
  objects?: Array<{
    id: string;
    name: string;
    type: string;
    path?: string;
    parent?: { id: string; name: string };
    [key: string]: any;
  }>;
  return?: Array<{
    id: string;
    name: string;
    type: string;
    path?: string;
    [key: string]: any;
  }>;
}

interface WwiseSubscription {
  unsubscribe(): Promise<void>;
}

interface WwiseAPI {
  /**
   * Call a WAAPI function.
   * @param uri - The WAAPI URI (e.g. 'ak.wwise.core.getInfo')
   * @param args - Arguments object
   * @param options - Options object (e.g. { return: ['id', 'name'] })
   * @returns The result of the WAAPI call
   */
  call<T = WwiseCallResult>(uri: string, args?: Record<string, any>, options?: Record<string, any>): Promise<T>;

  /**
   * Subscribe to a WAAPI topic.
   * @param topic - The topic URI (e.g. 'ak.wwise.ui.selectionChanged')
   * @param handler - Callback function invoked on each event
   * @param options - Options object (e.g. { return: ['id', 'name'] })
   * @returns Subscription object with unsubscribe()
   */
  subscribe(topic: string, handler: (data: Record<string, any>) => void, options?: Record<string, any>): Promise<WwiseSubscription>;

  /** Whether the connection is active. */
  readonly isConnected: boolean;

  /** Current project info, or null if not connected. */
  readonly project: { name: string; path: string } | null;
}

/** The Wwise WAAPI connection. Use wwise.call() and wwise.subscribe(). */
declare const wwise: WwiseAPI;
`;

	// =========================================================================
	// Shared helpers
	// =========================================================================

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
		].slice(0, 200);
	}

	function clearLogs() {
		logs = [];
	}

	const TOGGLE_BASE = 'px-4 h-8 rounded-md text-sm font-medium transition-all';
	const TOGGLE_ACTIVE = `${TOGGLE_BASE} bg-base text-surface-900 dark:text-surface-100 shadow-sm`;
	const TOGGLE_INACTIVE = `${TOGGLE_BASE} text-muted hover:text-surface-900 dark:hover:text-surface-100`;

	function setMode(m: typeof mode) {
		mode = m;
	}

	const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour12: false, fractionalSecondDigits: 3 };
	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', TIME_FORMAT);
	}

	const LOG_COLORS: Record<LogEntry['type'], string> = {
		call: 'text-blue-500',
		log: 'text-blue-500',
		subscribe: 'text-purple-500',
		result: 'text-green-500',
		event: 'text-wwise',
		error: 'text-red-500',
		info: 'text-surface-400 dark:text-surface-500'
	};

	// =========================================================================
	// Call / Subscribe mode logic
	// =========================================================================

	async function fetchWaapiSchema() {
		if (!wwise.isConnected) return;
		try {
			const [funcs, tops] = await Promise.all([wwise.getFunctions(), wwise.getTopics()]);
			const sortByUri = (a: WaapiItem, b: WaapiItem) => a.uri.localeCompare(b.uri);
			functions = (funcs ?? []).filter((f) => f?.uri).sort(sortByUri);
			topics = (tops ?? []).filter((t) => t?.uri).sort(sortByUri);
		} catch (e) {
			addLog('error', { message: 'Failed to fetch WAAPI schema', error: String(e) });
		}
	}

	async function executeCall() {
		if (!wwise.isConnected || !current.uri) return;
		isLoading = true;
		try {
			const args = JSON5.parse(current.args);
			const options = JSON5.parse(current.options);
			addLog('call', { args, options }, current.uri);
			const result = await wwise.call(current.uri, args, options);
			addLog('result', result, current.uri);
		} catch (e) {
			addLog('error', { message: String(e) }, current.uri);
		} finally {
			isLoading = false;
		}
	}

	async function executeSubscribe() {
		if (!wwise.isConnected || !current.uri) return;
		if (subscriptions.some((s) => s.uri === current.uri)) {
			addLog('error', { message: 'Already subscribed to this topic' }, current.uri);
			return;
		}
		isLoading = true;
		try {
			const options = JSON5.parse(current.options);
			addLog('subscribe', { options }, current.uri);
			const sub = await wwise.subscribe(
				current.uri,
				(data) => addLog('event', data, current.uri),
				options
			);
			subscriptions = [...subscriptions, { uri: current.uri, unsubscribe: sub.unsubscribe }];
		} catch (e) {
			addLog('error', { message: String(e) }, current.uri);
		} finally {
			isLoading = false;
		}
	}

	function applyCallRecipe(recipeName: string) {
		const recipe = callRecipes.find((r) => r.name === recipeName);
		if (!recipe) return;
		if (recipe.mode !== mode) mode = recipe.mode;
		const s = modeState[mode];
		s.uri = recipe.uri;
		s.args = recipe.args;
		s.options = recipe.options;
		argsEditor?.setValue(recipe.args);
		optionsEditor?.setValue(recipe.options);
	}

	// =========================================================================
	// Free mode logic
	// =========================================================================

	function userLog(...args: unknown[]) {
		addLog(
			'log',
			args
				.map((a) => {
					if (typeof a === 'string') return a;
					try {
						return JSON.stringify(a, null, 2);
					} catch {
						return String(a);
					}
				})
				.join(' ')
		);
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function executeFreeCode() {
		if (!wwise.isConnected || isLoading) return;
		isLoading = true;
		abortController = new AbortController();
		addLog('info', '▶ Running script...');
		try {
			const wwiseProxy = {
				call: (
					uri: string,
					args: Record<string, unknown> = {},
					options: Record<string, unknown> = {}
				) => {
					return wwise.call(uri, args, options);
				},
				subscribe: async (
					topic: string,
					handler: (data: Record<string, unknown>) => void,
					options: Record<string, unknown> = {}
				) => {
					const sub = await wwise.subscribe(topic, handler, options);
					subscriptions = [...subscriptions, { uri: topic, unsubscribe: sub.unsubscribe }];
					return sub;
				},
				get isConnected() {
					return wwise.isConnected;
				},
				get project() {
					return wwise.project;
				}
			};

			const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
			const fn = new AsyncFunction('wwise', 'log', 'sleep', code);
			const result = await fn(wwiseProxy, userLog, sleep);
			if (result !== undefined) addLog('result', result);
			addLog('info', '✓ Script completed');
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			addLog('error', message);
		} finally {
			isLoading = false;
			abortController = null;
		}
	}

	function stopExecution() {
		if (abortController) abortController.abort();
		isLoading = false;
	}

	function applyFreeRecipe(recipeName: string) {
		const recipe = freeRecipes.find((r) => r.name === recipeName);
		if (!recipe) return;
		code = recipe.code;
		codeEditor?.setValue(recipe.code);
	}

	// =========================================================================
	// Subscription management
	// =========================================================================

	async function unsubscribe(uri: string) {
		const sub = subscriptions.find((s) => s.uri === uri);
		if (sub) {
			await sub.unsubscribe();
			subscriptions = subscriptions.filter((s) => s.uri !== uri);
			addLog('info', `Unsubscribed from ${uri}`);
		}
	}

	async function unsubscribeAll() {
		for (const sub of subscriptions) {
			await sub.unsubscribe();
		}
		subscriptions = [];
		addLog('info', 'Unsubscribed from all topics');
	}

	// =========================================================================
	// Keyboard shortcut
	// =========================================================================

	const EXECUTE_MAP = {
		call: () => executeCall(),
		subscribe: () => executeSubscribe(),
		free: () => executeFreeCode()
	} as const;

	function execute() {
		if (isLoading) return;
		EXECUTE_MAP[mode]();
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			execute();
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	// Sync Monaco editors when switching between call ↔ subscribe
	// (they share the same DOM branch so don't remount)
	$effect(() => {
		void mode; // track mode changes
		argsEditor?.setValue(current.args);
		optionsEditor?.setValue(current.options);
	});

	$effect(() => {
		if (wwise.isConnected) {
			fetchWaapiSchema();
		}
	});

	onDestroy(() => {
		for (const sub of subscriptions) {
			sub.unsubscribe();
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col gap-6">
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
		<div class="flex flex-col gap-4">
			<!-- Mode Toggle & Controls -->
			<div class="flex flex-wrap gap-3 items-start">
				<!-- Mode Toggle: Call / Subscribe / Free -->
				<div class="p-1 rounded-lg bg-surface-200 flex dark:bg-surface-800">
					{#each ['call', 'subscribe', 'free'] as const as m (m)}
						<button onclick={() => setMode(m)} class={mode === m ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}>
							{m[0].toUpperCase() + m.slice(1)}
						</button>
					{/each}
				</div>

				{#if mode === 'call' || mode === 'subscribe'}
					<!-- URI Selection -->
					<div class="flex-1 min-w-64">
						<Combobox
							id="uri-selector"
							items={comboboxItems}
							bind:value={current.uri}
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
							items={callRecipeItems}
							bind:value={current.recipe}
							placeholder="Recipes"
							onchange={applyCallRecipe}
						/>
					</div>

					<!-- Execute Button -->
					{#if mode === 'call'}
						<button onclick={executeCall} disabled={!current.uri || isLoading} class="btn-action">
							<Play size={16} />
							{isLoading ? 'Calling...' : 'Execute'}
						</button>
					{:else}
						<button
							onclick={executeSubscribe}
							disabled={!current.uri || isLoading}
							class="text-sm text-white font-medium px-5 rounded-lg bg-purple-600 flex gap-2 h-10 transition-colors items-center hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Radio size={16} />
							{isLoading ? 'Subscribing...' : 'Subscribe'}
						</button>
					{/if}
				{:else}
					<!-- Free mode controls -->
					<div class="flex-1"></div>

					<div class="w-52">
						<Select
							id="free-recipe-selector"
							items={freeRecipeItems}
							bind:value={current.recipe}
							placeholder="Recipes"
							onchange={applyFreeRecipe}
						/>
					</div>

					{#if isLoading}
						<button
							onclick={stopExecution}
							class="text-sm text-white font-medium px-5 rounded-lg bg-red-600 flex gap-2 h-10 transition-colors items-center hover:bg-red-500"
						>
							<CircleStop size={16} />
							Stop
						</button>
					{:else}
						<button
							onclick={executeFreeCode}
							disabled={isLoading}
							class="btn-action"
							title="{typeof navigator !== 'undefined' && navigator?.platform?.includes('Mac')
								? '⌘'
								: 'Ctrl'}+Enter"
						>
							<Play size={16} />
							Run
						</button>
					{/if}
				{/if}
			</div>

			<!-- Editors -->
			{#if mode === 'call' || mode === 'subscribe'}
				<div class="gap-4 grid grid-cols-1 lg:grid-cols-2">
					<!-- Arguments Editor -->
					<div class="space-y-2">
						<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
							Arguments
						</span>
						<MonacoEditor
							bind:this={argsEditor}
							value={current.args}
							onchange={(v) => (current.args = v)}
							height="12rem"
							resizable={true}
						/>
					</div>

					<!-- Options Editor -->
					<div class="space-y-2">
						<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
							Options
						</span>
						<MonacoEditor
							bind:this={optionsEditor}
							value={current.options}
							onchange={(v) => (current.options = v)}
							height="12rem"
							resizable={true}
						/>
					</div>
				</div>
			{:else}
				<!-- Free mode: single JS editor -->
				<div class="space-y-2">
					<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
						Script
					</span>
					<MonacoEditor
						bind:this={codeEditor}
						value={code}
						language="javascript"
						onchange={(v) => (code = v)}
						height="16rem"
						resizable={true}
						extraLibs={[{ content: wwiseTypeDefs, filePath: 'ts:wwise-api.d.ts' }]}
					/>
				</div>
			{/if}

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
			<div class="flex flex-col min-h-0">
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
				<div class="border border-base rounded-lg h-80 min-h-24 resize-y overflow-hidden">
					<div
						class="text-xs font-mono p-3 bg-surface-100 h-full overflow-y-auto space-y-1 dark:bg-surface-950"
					>
						{#if logs.length === 0}
							<div class="text-surface-400">
								{mode === 'free'
									? 'No output yet. Write some code and press Run.'
									: 'No logs yet. Execute a call or subscribe to a topic.'}
							</div>
						{:else}
							{#each logs as log (log.id)}
								{@const text =
									typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
								<div class="group">
									<div class="flex gap-2 items-baseline">
										<span class="text-surface-400 shrink-0 dark:text-surface-500"
											>{formatTime(log.timestamp)}</span
										>
										{#if log.type === 'info'}
											<span class="text-surface-400 dark:text-surface-500">{text}</span>
										{:else}
											<span class={[LOG_COLORS[log.type], 'shrink-0 font-semibold']}>
												[{log.type}]
											</span>
											{#if log.uri}
												<span class="text-surface-500 shrink-0 dark:text-surface-400"
													>{log.uri}</span
												>
											{/if}
											{#if !text.includes('\n')}
												<!-- prettier-ignore -->
												<span class="text-surface-700 flex-1 dark:text-surface-300">{text}</span>
											{/if}
										{/if}
										<button
											onclick={() => navigator.clipboard.writeText(text)}
											aria-label="Copy to clipboard"
											class="text-surface-400 opacity-0 transition-opacity hover:text-surface-600 group-hover:opacity-100 dark:hover:text-surface-300"
										>
											<Copy size={12} />
										</button>
									</div>
									{#if log.type !== 'info' && text.includes('\n')}
										<!-- prettier-ignore -->
										<pre class="text-surface-700 m-0 mt-0.5 pl-8 whitespace-pre-wrap break-all dark:text-surface-300">{text}</pre>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
