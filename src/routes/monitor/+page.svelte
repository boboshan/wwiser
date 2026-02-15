<script lang="ts">
	import { onDestroy } from 'svelte';
	import { wwise } from '$lib/wwise/connection.svelte';
	import { ListMusic, Play, Square, Pause, FolderOpen } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge from '$lib/components/badge.svelte';

	// ── Types ────────────────────────────────────────────────────────────

	interface MusicNode {
		id: string;
		name: string;
		type: string;
		path: string;
		children: MusicNode[];
		depth: number;
	}

	/** Container types that may hold Music Segments */
	const MUSIC_CONTAINERS = new Set([
		'MusicPlaylistContainer',
		'MusicSwitchContainer',
		'MusicRanSeqContainer'
	]);

	// ── State ────────────────────────────────────────────────────────────

	let target = $state<{ id: string; name: string; type: string; path: string } | null>(null);
	let tree = $state<MusicNode[]>([]);
	let isLoading = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error' | 'warning'>('info');

	// Transport
	let transportId = $state<number | null>(null);
	let transportState = $state<'stopped' | 'playing' | 'paused'>('stopped');
	let activeSegmentId = $state<string | null>(null);
	let activeSegmentName = $state('');
	let elapsedMs = $state(0);
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;
	let statePoller: ReturnType<typeof setInterval> | null = null;

	// ── Derived ──────────────────────────────────────────────────────────

	let elapsedFormatted = $derived(formatTime(elapsedMs));
	let isPlaying = $derived(transportState === 'playing');
	let isPaused = $derived(transportState === 'paused');
	let isStopped = $derived(transportState === 'stopped');

	let flatNodes = $derived(flattenTree(tree));
	let segmentCount = $derived(flatNodes.filter((n) => n.type === 'MusicSegment').length);

	// ── Helpers ──────────────────────────────────────────────────────────

	function formatTime(ms: number): string {
		const totalSec = Math.floor(ms / 1000);
		const min = Math.floor(totalSec / 60);
		const sec = totalSec % 60;
		const frac = Math.floor((ms % 1000) / 10);
		return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
	}

	function flattenTree(nodes: MusicNode[]): MusicNode[] {
		const result: MusicNode[] = [];
		for (const node of nodes) {
			result.push(node);
			if (node.children.length > 0) result.push(...flattenTree(node.children));
		}
		return result;
	}

	// ── Load Selection ───────────────────────────────────────────────────

	async function loadSelection() {
		if (!wwise.isConnected) return;
		isLoading = true;
		statusMessage = '';

		try {
			const selected = await wwise.getSelectedObjects();

			if (selected.length === 0) {
				statusMessage = 'Select a music object in Wwise';
				statusType = 'info';
				isLoading = false;
				return;
			}

			const obj = selected[0];
			target = { id: obj.id, name: obj.name, type: obj.type, path: obj.path };

			await stopPlayback();

			// If user selected a segment directly, show it standalone
			if (obj.type === 'MusicSegment') {
				tree = [
					{ id: obj.id, name: obj.name, type: obj.type, path: obj.path, children: [], depth: 0 }
				];
			} else {
				tree = await fetchMusicTree(obj.id, 0);
			}

			if (tree.length === 0) {
				statusMessage = `No segments found under "${obj.name}"`;
				statusType = 'warning';
			} else {
				const count = flattenTree(tree).filter((n) => n.type === 'MusicSegment').length;
				statusMessage = `Loaded ${count} segment${count !== 1 ? 's' : ''}`;
				statusType = 'success';
			}
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to load selection';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	async function fetchMusicTree(parentId: string, depth: number): Promise<MusicNode[]> {
		const children = await wwise.getChildren(parentId, ['id', 'name', 'type', 'path']);
		const nodes: MusicNode[] = [];

		for (const child of children) {
			if (child.type === 'MusicSegment') {
				nodes.push({ ...child, children: [], depth });
			} else if (MUSIC_CONTAINERS.has(child.type)) {
				const sub = await fetchMusicTree(child.id, depth + 1);
				nodes.push({ ...child, children: sub, depth });
			}
		}

		return nodes;
	}

	// ── Playback ─────────────────────────────────────────────────────────

	function handleSegmentClick(node: MusicNode) {
		if (activeSegmentId === node.id && !isStopped) {
			togglePause();
		} else {
			playSegment(node);
		}
	}

	async function playSegment(node: MusicNode) {
		await stopPlayback();

		try {
			const result = await wwise.call<{ transport: number }>('ak.wwise.core.transport.create', {
				object: node.id
			});
			transportId = result.transport;
			activeSegmentId = node.id;
			activeSegmentName = node.name;

			await wwise.call('ak.wwise.core.transport.executeAction', {
				transport: transportId,
				action: 'play'
			});
			transportState = 'playing';
			elapsedMs = 0;
			startElapsedTimer();
			startStatePolling();
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to play segment';
			statusType = 'error';
		}
	}

	async function togglePause() {
		if (transportId === null) return;

		try {
			if (isPlaying) {
				await wwise.call('ak.wwise.core.transport.executeAction', {
					transport: transportId,
					action: 'pause'
				});
				transportState = 'paused';
				stopElapsedTimer();
			} else if (isPaused) {
				await wwise.call('ak.wwise.core.transport.executeAction', {
					transport: transportId,
					action: 'play'
				});
				transportState = 'playing';
				startElapsedTimer();
			}
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Playback control failed';
			statusType = 'error';
		}
	}

	async function stopPlayback() {
		stopElapsedTimer();
		stopStatePolling();

		if (transportId !== null) {
			try {
				await wwise.call('ak.wwise.core.transport.executeAction', {
					transport: transportId,
					action: 'stop'
				});
			} catch {
				/* transport may already be stopped */
			}
			try {
				await wwise.call('ak.wwise.core.transport.destroy', { transport: transportId });
			} catch {
				/* transport may already be destroyed */
			}
			transportId = null;
		}

		transportState = 'stopped';
		activeSegmentId = null;
		activeSegmentName = '';
		elapsedMs = 0;
	}

	// ── Timers ───────────────────────────────────────────────────────────

	function startElapsedTimer() {
		stopElapsedTimer();
		const base = elapsedMs;
		const start = performance.now();
		elapsedTimer = setInterval(() => {
			elapsedMs = base + (performance.now() - start);
		}, 50);
	}

	function stopElapsedTimer() {
		if (elapsedTimer) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
	}

	function startStatePolling() {
		stopStatePolling();
		statePoller = setInterval(async () => {
			if (transportId === null) return;
			try {
				const result = await wwise.call<{ state: string }>('ak.wwise.core.transport.getState', {
					transport: transportId
				});
				if (result.state === 'stopped' && transportState !== 'stopped') {
					transportState = 'stopped';
					stopElapsedTimer();
					stopStatePolling();
				}
			} catch {
				// Transport may have been destroyed externally
				transportState = 'stopped';
				stopElapsedTimer();
				stopStatePolling();
			}
		}, 500);
	}

	function stopStatePolling() {
		if (statePoller) {
			clearInterval(statePoller);
			statePoller = null;
		}
	}

	// ── Cleanup ──────────────────────────────────────────────────────────

	onDestroy(() => {
		stopElapsedTimer();
		stopStatePolling();
		// Fire-and-forget cleanup
		stopPlayback();
	});
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Jump to any segment in a music playlist to quickly test transitions.
		</p>
		<button
			class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex shrink-0 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			onclick={loadSelection}
			disabled={!wwise.isConnected || isLoading}
		>
			<ListMusic size={16} class={isLoading ? 'animate-pulse' : ''} />
			{isLoading ? 'Loading...' : 'Load Selection'}
		</button>
	</div>

	<!-- Connection Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}

	<!-- Status (before target loaded) -->
	{#if statusMessage && !target}
		<Alert variant={statusType}>{statusMessage}</Alert>
	{/if}

	{#if target}
		<!-- Target Info -->
		<section class="space-y-3">
			<div class="p-4 border border-base rounded-xl bg-base">
				<div class="flex gap-3 items-center">
					<ListMusic size={18} class="text-wwise shrink-0" />
					<div class="flex-1 min-w-0">
						<div class="text-sm font-medium truncate">{target.name}</div>
						<div class="text-xs text-muted truncate">{target.path}</div>
					</div>
					<Badge variant="wwise">{target.type}</Badge>
				</div>
			</div>
		</section>

		<!-- Now Playing -->
		{#if activeSegmentId}
			<section class="space-y-3">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Now Playing</h3>
				<div class="p-4 border border-base rounded-xl bg-base flex gap-3 items-center">
					<div class="flex gap-2 items-center">
						{#if isPlaying}
							<button
								class="text-white rounded-lg bg-amber-600 flex h-9 w-9 transition-colors items-center justify-center hover:bg-amber-500"
								onclick={togglePause}
								title="Pause"
							>
								<Pause size={16} />
							</button>
						{:else if isPaused}
							<button
								class="text-white rounded-lg bg-green-600 flex h-9 w-9 transition-colors items-center justify-center hover:bg-green-500"
								onclick={togglePause}
								title="Resume"
							>
								<Play size={16} />
							</button>
						{/if}
						<button
							class="text-white rounded-lg bg-red-600 flex h-9 w-9 transition-colors items-center justify-center hover:bg-red-500"
							onclick={stopPlayback}
							title="Stop"
						>
							<Square size={14} />
						</button>
					</div>

					<div class="flex-1 min-w-0">
						<div class="text-sm font-medium truncate">{activeSegmentName}</div>
					</div>

					<div
						class="text-lg tracking-tight font-mono tabular-nums {isPlaying
							? 'text-green-500'
							: isPaused
								? 'text-amber-500'
								: 'text-muted'}"
					>
						{elapsedFormatted}
					</div>

					<Badge variant={isPlaying ? 'green' : isPaused ? 'amber' : 'default'}>
						{transportState}
					</Badge>
				</div>
			</section>
		{/if}

		<!-- Segment List -->
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Segments</h3>
				<span class="text-xs text-muted">
					{segmentCount} segment{segmentCount !== 1 ? 's' : ''}
				</span>
			</div>

			{#if flatNodes.length > 0}
				<div class="border border-base rounded-xl bg-base overflow-hidden">
					{#each flatNodes as node, i (`${node.id}-${i}`)}
						{#if node.type === 'MusicSegment'}
							<button
								class="py-3 text-left border-b border-base flex gap-3 w-full transition-colors items-center last:border-b-0 hover:bg-surface-100 dark:hover:bg-surface-800 {activeSegmentId ===
								node.id
									? 'bg-wwise/10'
									: ''}"
								style="padding-left: {16 + node.depth * 24}px; padding-right: 16px;"
								onclick={() => handleSegmentClick(node)}
							>
								<div
									class="rounded-md flex shrink-0 h-7 w-7 transition-colors items-center justify-center {activeSegmentId ===
									node.id
										? 'text-white bg-wwise'
										: 'text-muted bg-surface-200 hover:text-surface-900 dark:bg-surface-800 dark:hover:text-surface-100'}"
								>
									{#if activeSegmentId === node.id && isPlaying}
										<Pause size={14} />
									{:else}
										<Play size={14} class="ml-0.5" />
									{/if}
								</div>
								<span class="text-sm font-medium flex-1 min-w-0 truncate">
									{node.name}
								</span>
								{#if activeSegmentId === node.id}
									<span class="text-xs text-wwise font-mono shrink-0 tabular-nums">
										{elapsedFormatted}
									</span>
								{/if}
							</button>
						{:else}
							<!-- Container group header -->
							<div
								class="text-xs text-muted py-2.5 border-b border-base bg-surface-50 flex gap-2 items-center last:border-b-0 dark:bg-surface-900"
								style="padding-left: {16 + node.depth * 24}px; padding-right: 16px;"
							>
								<FolderOpen size={14} class="text-muted shrink-0" />
								<span class="font-medium truncate">{node.name}</span>
								<Badge variant="default">
									{node.type.replace('Music', '')}
								</Badge>
							</div>
						{/if}
					{/each}
				</div>
			{:else}
				<div class="text-sm text-muted px-4 py-8 text-center border border-base rounded-xl bg-base">
					No segments found
				</div>
			{/if}
		</section>

		<!-- Status (after load) -->
		{#if statusMessage}
			<Alert variant={statusType}>{statusMessage}</Alert>
		{/if}
	{/if}
</div>
