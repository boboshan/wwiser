<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import { Github, ExternalLink } from 'lucide-svelte';
</script>

<div class="max-w-2xl">
	<!-- Description -->
	<p class="text-sm text-muted leading-relaxed">
		{siteConfig.description}
	</p>

	<!-- Features -->
	<section class="mt-10">
		<h2 class="text-xs text-muted tracking-wider font-semibold uppercase">Features</h2>
		<div class="mt-4 gap-2 grid sm:grid-cols-2">
			<div class="p-3 border border-base rounded-lg bg-base">
				<p class="text-sm text-base font-medium">WAAPI Explorer</p>
				<p class="text-xs text-muted mt-0.5">Interactive playground to learn and test WAAPI</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<p class="text-sm text-base font-medium">Wrap</p>
				<p class="text-xs text-muted mt-0.5">Wrap objects in parent containers with smart naming</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<p class="text-sm text-base font-medium">Assign</p>
				<p class="text-xs text-muted mt-0.5">Auto-assign switch container children</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<p class="text-sm text-base font-medium">Volume</p>
				<p class="text-xs text-muted mt-0.5">Calculate effective volumes through hierarchy</p>
			</div>
			<div class="p-3 border border-base rounded-lg bg-base">
				<p class="text-sm text-base font-medium">Rename</p>
				<p class="text-xs text-muted mt-0.5">Batch rename with regex and live preview</p>
			</div>
		</div>
	</section>

	<!-- Tech & Version -->
	<footer class="mt-12 pt-6 border-t border-base">
		<div class="text-xs text-muted flex flex-wrap gap-3 items-center justify-between">
			<div class="flex flex-wrap gap-1">
				{#each ['SvelteKit', 'TypeScript', 'UnoCSS', 'Cloudflare'] as tech (tech)}
					<span class="px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-800">{tech}</span>
				{/each}
			</div>
			<div class="flex gap-3 items-center">
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
				<span class="opacity-50">v{siteConfig.version}</span>
			</div>
		</div>
	</footer>
</div>
