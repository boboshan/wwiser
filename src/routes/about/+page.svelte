<script lang="ts">
	import { siteConfig, navigation, explore, iconMap } from '$lib/config/site';
	import {
		Github,
		ExternalLink,
		WifiOff,
		Download,
		Zap,
		MousePointerClick,
		ShieldCheck,
		MonitorSmartphone
	} from 'lucide-svelte';

	const tools = [explore, ...navigation];

	const features = [
		{
			icon: Download,
			title: 'Installable',
			desc: 'Install as a native app on any device via PWA'
		},
		{
			icon: WifiOff,
			title: 'Offline Ready',
			desc: 'Full UI cached by service worker — works without internet'
		},
		{
			icon: Zap,
			title: 'Zero Backend',
			desc: 'Runs entirely in the browser, talks directly to Wwise via WAAPI'
		}
	] as const;

	const techStack = ['SvelteKit', 'TypeScript', 'UnoCSS', 'WAAPI'] as const;
</script>

<div class="pb-8 max-w-2xl space-y-12">
	<!-- Intro -->
	<div class="space-y-4">
		<p class="text-sm text-base leading-relaxed max-w-xl">
			<strong>Wwiser</strong> is a collection of browser-based productivity tools built for Wwise
			sound designers. It connects to your local Wwise session through the
			<a
				href="https://www.audiokinetic.com/en/library/edge/?source=SDK&id=waapi.html"
				target="_blank"
				rel="noopener noreferrer"
				class="text-wwise underline-offset-2 hover:underline">Wwise Authoring API (WAAPI)</a
			>
			and lets you perform common tasks faster than the built-in UI allows.
		</p>
		<p class="text-sm text-muted leading-relaxed max-w-xl">
			No data leaves your machine. Wwiser runs entirely client-side — there's no server, no
			account, and no telemetry. It's a static site you can install as a PWA and use offline.
		</p>
	</div>

	<!-- How it works -->
	<section class="space-y-4">
		<h2
			class="text-[10px] text-muted/50 tracking-[0.2em] font-semibold px-0.5 select-none uppercase"
		>
			How It Works
		</h2>
		<div class="gap-2 grid sm:grid-cols-3">
			<div
				class="p-4 border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
			>
				<div
					class="mb-3 rounded-lg bg-surface-100 flex h-8 w-8 items-center justify-center dark:bg-surface-800"
				>
					<MonitorSmartphone class="text-surface-400 h-4 w-4 dark:text-surface-500" />
				</div>
				<p class="text-sm text-base font-medium">Open Wwiser</p>
				<p class="text-xs text-muted/60 leading-relaxed mt-1">
					Visit the site or launch the installed PWA. No login required.
				</p>
			</div>
			<div
				class="p-4 border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
			>
				<div
					class="mb-3 rounded-lg bg-surface-100 flex h-8 w-8 items-center justify-center dark:bg-surface-800"
				>
					<Zap class="text-surface-400 h-4 w-4 dark:text-surface-500" />
				</div>
				<p class="text-sm text-base font-medium">Connect to Wwise</p>
				<p class="text-xs text-muted/60 leading-relaxed mt-1">
					Wwiser connects via WebSocket to Wwise's WAAPI on localhost. Make sure WAAPI is enabled
					in your Wwise project settings.
				</p>
			</div>
			<div
				class="p-4 border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
			>
				<div
					class="mb-3 rounded-lg bg-surface-100 flex h-8 w-8 items-center justify-center dark:bg-surface-800"
				>
					<MousePointerClick class="text-surface-400 h-4 w-4 dark:text-surface-500" />
				</div>
				<p class="text-sm text-base font-medium">Use the Tools</p>
				<p class="text-xs text-muted/60 leading-relaxed mt-1">
					Pick a tool, select objects in Wwise, and run. Changes are applied directly to your
					project with full undo support.
				</p>
			</div>
		</div>
	</section>

	<!-- Tools -->
	<section class="space-y-4">
		<h2
			class="text-[10px] text-muted/50 tracking-[0.2em] font-semibold px-0.5 select-none uppercase"
		>
			Tools
		</h2>
		<div class="gap-2 grid sm:grid-cols-2">
			{#each tools as tool (tool.id)}
				{@const Icon = iconMap[tool.icon]}
				<a
					href={tool.href}
					class="group p-3.5 border border-transparent rounded-xl bg-base no-underline transition-all duration-200 hover:border-surface-200 hover:shadow-sm dark:hover:border-surface-700"
				>
					<div class="flex gap-2.5 items-center">
						<div
							class="rounded-lg bg-surface-100 flex shrink-0 h-7 w-7 transition-all duration-200 items-center justify-center dark:bg-surface-800 group-hover:bg-wwise/10 group-hover:scale-105"
						>
							<Icon
								class="text-surface-400 shrink-0 h-3.5 w-3.5 transition-colors duration-200 dark:text-surface-500 group-hover:text-wwise"
							/>
						</div>
						<p class="text-sm text-base font-medium">{tool.name}</p>
					</div>
					<p class="text-xs text-muted/60 leading-relaxed ml-9.5 mt-2">{tool.description}</p>
				</a>
			{/each}
		</div>
	</section>

	<!-- Privacy & Security -->
	<section class="space-y-4">
		<h2
			class="text-[10px] text-muted/50 tracking-[0.2em] font-semibold px-0.5 select-none uppercase"
		>
			Privacy &amp; Security
		</h2>
		<div
			class="p-4 border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
		>
			<div class="flex gap-3 items-start">
				<div
					class="mt-0.5 rounded-lg bg-surface-100 flex shrink-0 h-8 w-8 items-center justify-center dark:bg-surface-800"
				>
					<ShieldCheck class="text-surface-400 h-4 w-4 dark:text-surface-500" />
				</div>
				<div class="space-y-2">
					<p class="text-sm text-base leading-relaxed">
						Wwiser is a static site with no backend. All communication happens directly between
						your browser and Wwise over a local WebSocket connection. Nothing is sent to any
						server — there are no analytics, cookies, or tracking of any kind.
					</p>
					<p class="text-xs text-muted/60 leading-relaxed">
						The source code is fully open. You can audit it, self-host it, or run it completely
						offline.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Works Anywhere -->
	<section class="space-y-4">
		<h2
			class="text-[10px] text-muted/50 tracking-[0.2em] font-semibold px-0.5 select-none uppercase"
		>
			Works Anywhere
		</h2>
		<div class="gap-2 grid sm:grid-cols-3">
			{#each features as feat (feat.title)}
				<div
					class="p-4 border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
				>
					<div
						class="mb-3 rounded-lg bg-surface-100 flex h-8 w-8 items-center justify-center dark:bg-surface-800"
					>
						<feat.icon class="text-surface-400 h-4 w-4 dark:text-surface-500" />
					</div>
					<p class="text-sm text-base font-medium">{feat.title}</p>
					<p class="text-xs text-muted/60 leading-relaxed mt-1">{feat.desc}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Footer -->
	<footer class="pt-6 border-t border-surface-100 dark:border-surface-800/50">
		<div class="text-xs text-muted flex flex-wrap gap-4 items-center justify-between">
			<div class="flex flex-wrap gap-1.5">
				{#each techStack as tech (tech)}
					<span
						class="text-[11px] text-muted/60 px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800"
						>{tech}</span
					>
				{/each}
			</div>
			<div class="flex gap-3 items-center">
				<a
					href="https://boboshan.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted/60 no-underline transition-colors hover:text-wwise"
				>
					by <span class="font-medium">bbs</span>
				</a>
				<span class="text-muted/20">·</span>
				<a
					href={siteConfig.social.github}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted/60 no-underline inline-flex gap-1.5 transition-colors items-center hover:text-wwise"
				>
					<Github class="h-3.5 w-3.5" />
					<span>Source</span>
					<ExternalLink class="opacity-40 h-2.5 w-2.5" />
				</a>
				<span class="text-muted/20">·</span>
				<span class="text-muted/40">v{siteConfig.version}</span>
			</div>
		</div>
	</footer>
</div>
