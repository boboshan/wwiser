<script lang="ts">
	import { tick } from 'svelte';
	import { VolumeContribution } from './+page.svelte';
	import { getTypeDisplayName } from '$lib/components/badge.svelte';
	import Badge from '$lib/components/badge.svelte';
	import VolumeSlider from './volume-slider.svelte';
	import type { WwiseObject } from '$lib/wwise/connection.svelte';

	type VolumeProperty = 'Volume' | 'BusVolume' | 'OutputBusVolume';

	interface VolumeInfo {
		object: WwiseObject;
		contributions: VolumeContribution[];
		routingSourceId?: string;
	}

	interface Props {
		volumeData: VolumeInfo[];
		isSaving: boolean;
		onVolumeChange: (contrib: VolumeContribution, property: VolumeProperty, value: number) => void;
	}

	let { volumeData, isSaving, onVolumeChange }: Props = $props();

	// --- Graph types ---
	interface GraphNode {
		id: string;
		contribution: VolumeContribution;
		column: number;
		row: number;
	}

	interface GraphEdge {
		fromId: string;
		toId: string;
		isRouting: boolean;
	}

	// --- Build signal-flow graph ---
	// Topological layering: forward pass for correctness, backward pass for right-alignment.
	let graph = $derived.by(() => {
		if (volumeData.length === 0) return null;

		const nodeMap = new Map<string, GraphNode>();
		const edgeKeys = new Set<string>();
		const edges: GraphEdge[] = [];

		// Build nodes + edges from contribution paths
		// Edges are built per-category: hierarchy chain, routing edge, bus chain
		for (const item of volumeData) {
			const hierarchy = item.contributions.filter(
				(c) => c.category === 'self' || c.category === 'ancestor'
			);
			const buses = item.contributions.filter((c) => c.category === 'bus');

			// Register all nodes
			for (const c of item.contributions) {
				if (!nodeMap.has(c.id)) {
					nodeMap.set(c.id, { id: c.id, contribution: c, column: 0, row: 0 });
				}
			}

			const addEdge = (fromId: string, toId: string, isRouting: boolean) => {
				const key = `${fromId}\u2192${toId}`;
				if (!edgeKeys.has(key)) {
					edges.push({ fromId, toId, isRouting });
					edgeKeys.add(key);
				}
			};

			// Hierarchy chain edges (self → ancestor1 → ancestor2)
			for (let i = 0; i < hierarchy.length - 1; i++) {
				addEdge(hierarchy[i].id, hierarchy[i + 1].id, false);
			}

			// Bus chain edges (bus1 → bus2 → bus3)
			for (let i = 0; i < buses.length - 1; i++) {
				addEdge(buses[i].id, buses[i + 1].id, false);
			}

			// Routing edge: from the routing source to the first bus
			if (buses.length > 0) {
				const routingSrc =
					item.routingSourceId ??
					hierarchy[hierarchy.length - 1]?.id ??
					item.contributions[0]?.id;
				if (routingSrc) {
					addEdge(routingSrc, buses[0].id, true);
				}
			}
		}

		// Build adjacency lists
		const successors = new Map<string, Set<string>>();
		const predecessors = new Map<string, Set<string>>();
		for (const id of nodeMap.keys()) {
			successors.set(id, new Set());
			predecessors.set(id, new Set());
		}
		for (const edge of edges) {
			successors.get(edge.fromId)!.add(edge.toId);
			predecessors.get(edge.toId)!.add(edge.fromId);
		}

		// Topological sort (Kahn's algorithm)
		const inDegree = new Map<string, number>();
		for (const [id, preds] of predecessors) inDegree.set(id, preds.size);
		const queue: string[] = [];
		for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
		const topoOrder: string[] = [];
		while (queue.length > 0) {
			const id = queue.shift()!;
			topoOrder.push(id);
			for (const succ of successors.get(id)!) {
				const newDeg = inDegree.get(succ)! - 1;
				inDegree.set(succ, newDeg);
				if (newDeg === 0) queue.push(succ);
			}
		}

		// Forward pass: longest path from any source (ensures edges go left→right)
		const col = new Map<string, number>();
		for (const id of topoOrder) {
			let maxPred = -1;
			for (const pred of predecessors.get(id)!) {
				maxPred = Math.max(maxPred, col.get(pred)!);
			}
			col.set(id, maxPred + 1);
		}
		const maxCol = Math.max(...col.values(), 0);

		// Backward pass: right-align shared suffixes (pull nodes rightward)
		for (let i = topoOrder.length - 1; i >= 0; i--) {
			const id = topoOrder[i];
			const succs = successors.get(id)!;
			if (succs.size > 0) {
				let minSuccCol = Infinity;
				for (const succ of succs) minSuccCol = Math.min(minSuccCol, col.get(succ)!);
				col.set(id, Math.max(col.get(id)!, minSuccCol - 1));
			} else {
				col.set(id, maxCol);
			}
		}

		// Apply columns to nodes
		for (const [id, node] of nodeMap) node.column = col.get(id)!;

		// Group into columns
		const columns: GraphNode[][] = Array.from({ length: maxCol + 1 }, () => []);
		for (const node of nodeMap.values()) columns[node.column].push(node);

		// Row ordering: selection order for sources, barycenter heuristic for the rest
		const selfOrder = new Map<string, number>();
		volumeData.forEach((item, idx) => {
			if (item.contributions[0]) selfOrder.set(item.contributions[0].id, idx);
		});
		for (const column of columns) {
			column.sort((a, b) => {
				const ao = selfOrder.get(a.id);
				const bo = selfOrder.get(b.id);
				if (ao !== undefined && bo !== undefined) return ao - bo;
				if (ao !== undefined) return -1;
				if (bo !== undefined) return 1;
				const aPreds = [...(predecessors.get(a.id) ?? [])];
				const bPreds = [...(predecessors.get(b.id) ?? [])];
				const aCenter =
					aPreds.length > 0
						? aPreds.reduce((s, id) => s + (nodeMap.get(id)?.row ?? 0), 0) / aPreds.length
						: 0;
				const bCenter =
					bPreds.length > 0
						? bPreds.reduce((s, id) => s + (nodeMap.get(id)?.row ?? 0), 0) / bPreds.length
						: 0;
				return aCenter - bCenter;
			});
			column.forEach((n, i) => (n.row = i));
		}

		return { columns, edges };
	});

	// --- SVG edge rendering ---
	let containerEl = $state<HTMLDivElement>();
	let edgePaths = $state<Array<{ d: string; stroke: string; opacity: number }>>([]);
	let svgW = $state(0);
	let svgH = $state(0);

	function computeEdges() {
		if (!containerEl || !graph) {
			edgePaths = [];
			return;
		}
		const cr = containerEl.getBoundingClientRect();
		svgW = containerEl.scrollWidth;
		svgH = containerEl.scrollHeight;
		const paths: typeof edgePaths = [];

		for (const edge of graph.edges) {
			const fe = containerEl.querySelector<HTMLElement>(
				`[data-node-id="${CSS.escape(edge.fromId)}"]`
			);
			const te = containerEl.querySelector<HTMLElement>(
				`[data-node-id="${CSS.escape(edge.toId)}"]`
			);
			if (!fe || !te) continue;

			const fr = fe.getBoundingClientRect();
			const tr = te.getBoundingClientRect();
			const x1 = fr.right - cr.left;
			const y1 = fr.top + fr.height / 2 - cr.top;
			const x2 = tr.left - cr.left;
			const y2 = tr.top + tr.height / 2 - cr.top;
			const dx = (x2 - x1) * 0.4;

			paths.push({
				d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
				stroke: edge.isRouting ? '#3069ff' : 'currentColor',
				opacity: edge.isRouting ? 0.5 : 0.12
			});
		}
		edgePaths = paths;
	}

	$effect(() => {
		graph; // track graph changes
		if (!containerEl) return;

		tick().then(() => requestAnimationFrame(computeEdges));

		const obs = new ResizeObserver(() => requestAnimationFrame(computeEdges));
		obs.observe(containerEl);
		return () => obs.disconnect();
	});

	// --- Utilities ---
	function formatVol(v: number): string {
		if (v === 0) return '0 dB';
		return v > 0 ? `+${v.toFixed(1)} dB` : `${v.toFixed(1)} dB`;
	}

	function volColor(v: number): string {
		if (v > 0) return 'text-red-500';
		if (v < -12) return 'text-blue-500';
		if (v < 0) return 'text-green-500';
		return 'text-muted';
	}

	function borderCls(cat: string): string {
		if (cat === 'self') return 'border-l-wwise';
		if (cat === 'bus') return 'border-l-blue-500';
		return 'border-l-purple-500';
	}
</script>

{#if graph}
	<!-- Summary bar: effective volumes per selected object -->
	<div class="flex flex-wrap gap-x-6 gap-y-2 mb-3">
		{#each volumeData as item (item.object.id)}
			{@const hContribs = item.contributions.filter(
				(c) => c.category === 'self' || c.category === 'ancestor'
			)}
			{@const bContribs = item.contributions.filter((c) => c.category === 'bus')}
			{@const hSum = hContribs.reduce((s, c) => s + c.total, 0)}
			{@const bSum = bContribs.reduce((s, c) => s + c.total, 0)}
			<div class="text-xs flex flex-wrap gap-2 items-center">
				<Badge variant="wwise">{getTypeDisplayName(item.object.type)}</Badge>
				<span class="text-base font-medium">{item.object.name}</span>
				<span class="text-muted">—</span>
				<span class="text-muted">Hierarchy</span>
				<span class="font-mono {volColor(hSum)}">{formatVol(hSum)}</span>
				<span class="text-muted/40">+</span>
				<span class="text-muted">Bus</span>
				<span class="font-mono {volColor(bSum)}">{formatVol(bSum)}</span>
				<span class="text-muted/40">=</span>
				<span class="font-mono font-semibold {volColor(hSum + bSum)}"
					>{formatVol(hSum + bSum)}</span
				>
			</div>
		{/each}
	</div>

	<!-- Signal-flow graph -->
	<div class="overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg border border-base">
		<div
			bind:this={containerEl}
			class="relative inline-flex gap-12 items-start p-5 min-w-full"
		>
			{#each graph.columns as column, colIdx (colIdx)}
				{#if column.length > 0}
					<div class="flex flex-col gap-3" style="min-width: 220px">
						{#each column as node (node.id)}
							<div
								data-node-id={node.id}
								class="p-3 rounded-lg border border-base bg-base {borderCls(
									node.contribution.category
								)} border-l-3 space-y-2"
							>
								<!-- Header: badge + name + total -->
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1.5 min-w-0">
										<Badge variant={node.contribution.badgeVariant}>
											{node.contribution.typeName}
										</Badge>
										<span class="text-xs text-base font-medium truncate">
											{node.contribution.name}
										</span>
									</div>
									<span
										class="text-[11px] font-mono font-semibold shrink-0 {volColor(
											node.contribution.total
										)}"
									>
										{formatVol(node.contribution.total)}
									</span>
								</div>

								<!-- Output bus route indicator -->
								{#if node.contribution.outputBusName}
									<div class="text-[10px] text-blue-500 ml-1">
										{node.contribution.outputBusName}
									</div>
								{/if}

								<!-- Volume sliders -->
								{#if node.contribution.category === 'bus'}
									<VolumeSlider
										label="Voice"
										slider={node.contribution.voiceVolumeState!}
										disabled={isSaving}
										oncommit={(v) => onVolumeChange(node.contribution, 'Volume', v)}
									/>
									<VolumeSlider
										label="Bus"
										slider={node.contribution.busVolumeState!}
										disabled={isSaving}
										oncommit={(v) => onVolumeChange(node.contribution, 'BusVolume', v)}
									/>
									{#if node.contribution.outputBusVolumeState}
										<VolumeSlider
											label="OutBus"
											slider={node.contribution.outputBusVolumeState}
											disabled={isSaving}
											oncommit={(v) =>
												onVolumeChange(node.contribution, 'OutputBusVolume', v)}
										/>
									{/if}
								{:else}
									<VolumeSlider
										label="Voice"
										slider={node.contribution.volumeState}
										disabled={isSaving}
										oncommit={(v) => onVolumeChange(node.contribution, 'Volume', v)}
									/>
									{#if node.contribution.outputBusVolumeState}
										<VolumeSlider
											label="OutBus"
											slider={node.contribution.outputBusVolumeState}
											disabled={isSaving}
											oncommit={(v) =>
												onVolumeChange(node.contribution, 'OutputBusVolume', v)}
										/>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/each}

			<!-- SVG edges overlay -->
			<svg
				class="absolute top-0 left-0 pointer-events-none"
				width={svgW}
				height={svgH}
				style="overflow: visible"
			>
				<defs>
					<marker id="arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
						<polygon points="0 0, 6 2, 0 4" class="fill-current" opacity="0.15" />
					</marker>
					<marker
						id="arrow-route"
						markerWidth="6"
						markerHeight="4"
						refX="5"
						refY="2"
						orient="auto"
					>
						<polygon points="0 0, 6 2, 0 4" fill="#3069ff" opacity="0.4" />
					</marker>
				</defs>
				{#each edgePaths as p, i (i)}
					<path
						d={p.d}
						stroke={p.stroke}
						stroke-opacity={p.opacity}
						fill="none"
						stroke-width="1.5"
						marker-end={p.stroke === '#3069ff' ? 'url(#arrow-route)' : 'url(#arrow)'}
					/>
				{/each}
			</svg>
		</div>
	</div>
{/if}
