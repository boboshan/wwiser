<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Github, ExternalLink } from 'lucide-svelte';
</script>

<div class="max-w-2xl">
	<!-- Description -->
	<p class="text-muted text-sm leading-relaxed">
		{siteConfig.description}
	</p>

	<!-- Features -->
	<section class="mt-10">
		<h2 class="text-xs text-muted uppercase tracking-wider font-semibold">Features</h2>
		<div class="grid gap-2 sm:grid-cols-2 mt-4">
			<div class="rounded-lg border border-base bg-base p-3">
				<p class="font-medium text-sm text-base">WAAPI Explorer</p>
				<p class="text-xs text-muted mt-0.5">Interactive playground to learn and test WAAPI</p>
			</div>
			<div class="rounded-lg border border-base bg-base p-3">
				<p class="font-medium text-sm text-base">Wrap</p>
				<p class="text-xs text-muted mt-0.5">Wrap objects in parent containers with smart naming</p>
			</div>
			<div class="rounded-lg border border-base bg-base p-3">
				<p class="font-medium text-sm text-base">Assign</p>
				<p class="text-xs text-muted mt-0.5">Auto-assign switch container children</p>
			</div>
			<div class="rounded-lg border border-base bg-base p-3">
				<p class="font-medium text-sm text-base">Volume</p>
				<p class="text-xs text-muted mt-0.5">Calculate effective volumes through hierarchy</p>
			</div>
			<div class="rounded-lg border border-base bg-base p-3">
				<p class="font-medium text-sm text-base">Rename</p>
				<p class="text-xs text-muted mt-0.5">Batch rename with regex and live preview</p>
			</div>
		</div>
	</section>

	<!-- Tech & Version -->
	<footer class="mt-12 pt-6 border-t border-base">
		<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
			<div class="flex flex-wrap gap-1">
				{#each ['SvelteKit', 'TypeScript', 'UnoCSS', 'Cloudflare'] as tech (tech)}
					<span class="px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-800">{tech}</span>
				{/each}
			</div>
			<div class="flex items-center gap-3">
				<a
					href={siteConfig.social.github}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 text-muted no-underline transition-colors hover:text-base"
				>
					<Github class="h-3.5 w-3.5" />
					<span>Source</span>
					<ExternalLink class="h-3 w-3 opacity-40" />
				</a>
				<span class="opacity-50">v{siteConfig.version}</span>
			</div>
		</div>
	</footer>
</div>
