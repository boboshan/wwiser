<script lang="ts">
	import { siteConfig, navigation, explore, iconMap } from '$lib/config/site';
	import { Github, ExternalLink, WifiOff, Download, Zap } from 'lucide-svelte';

	const tools = [explore, ...navigation];
</script>

<div class="max-w-2xl">
	<p class="text-sm text-muted leading-relaxed">
		{siteConfig.description}
	</p>

	<!-- Tools -->
	<section class="mt-10">
		<h2 class="text-xs text-muted tracking-wider font-semibold uppercase">Tools</h2>
		<div class="mt-4 gap-2 grid sm:grid-cols-2">
			{#each tools as tool (tool.id)}
				{@const Icon = iconMap[tool.icon]}
				<a
					href={tool.href}
					class="group p-3 border border-base rounded-lg bg-base no-underline transition-colors hover:border-surface-400 dark:hover:border-surface-500"
				>
					<div class="flex items-center gap-2">
						<Icon class="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-surface-900 dark:group-hover:text-surface-100 transition-colors" />
						<p class="text-sm text-base font-medium">{tool.name}</p>
					</div>
					<p class="text-xs text-muted mt-1">{tool.description}</p>
				</a>
			{/each}
		</div>
	</section>

	<!-- PWA & Offline -->
	<section class="mt-10">
		<h2 class="text-xs text-muted tracking-wider font-semibold uppercase">Works Anywhere</h2>
		<div class="mt-4 gap-2 grid sm:grid-cols-3">
			<div class="p-3 border border-base rounded-lg bg-base">
				<Download class="h-3.5 w-3.5 text-muted mb-1.5" />
				<p class="text-sm text-base font-medium">Installable</p>
				<p class="text-xs text-muted mt-0.5">Install as a native app on any device via PWA</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<WifiOff class="h-3.5 w-3.5 text-muted mb-1.5" />
				<p class="text-sm text-base font-medium">Offline Ready</p>
				<p class="text-xs text-muted mt-0.5">Full UI cached by service worker — works without internet</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<Zap class="h-3.5 w-3.5 text-muted mb-1.5" />
				<p class="text-sm text-base font-medium">Zero Backend</p>
				<p class="text-xs text-muted mt-0.5">Runs entirely in the browser, talks directly to Wwise via WAAPI</p>
			</div>
		</div>
	</section>

	<!-- Tech & Footer -->
	<footer class="mt-12 pt-6 border-t border-base">
		<div class="text-xs text-muted flex flex-wrap gap-3 items-center justify-between">
			<div class="flex flex-wrap gap-1">
				{#each ['SvelteKit', 'TypeScript', 'Wwise Authoring API'] as tech (tech)}
					<span class="px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-800">{tech}</span>
				{/each}
			</div>
			<div class="flex gap-3 items-center">
				<a
					href="https://boboshan.com"
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted no-underline transition-colors hover:text-surface-900 dark:hover:text-surface-100"
				>
					by <span class="font-medium">bbs</span>
				</a>
				<span class="opacity-30">·</span>
				<a
					href={siteConfig.social.github}
					target="_blank"
					rel="noopener noreferrer"
					class="text-muted no-underline inline-flex gap-1.5 transition-colors items-center hover:text-surface-900 dark:hover:text-surface-100"
				>
					<Github class="h-3.5 w-3.5" />
					<span>Source</span>
					<ExternalLink class="opacity-40 h-3 w-3" />
				</a>
				<span class="opacity-30">·</span>
				<span class="opacity-50">v{siteConfig.version}</span>
			</div>
		</div>
	</footer>
</div>
