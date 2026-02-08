<script lang="ts">
	import { siteConfig, navigation, explore, iconMap } from '$lib/config/site';
	import { ArrowRight, Terminal, Zap, Github } from 'lucide-svelte';
	import logo from '$lib/assets/logo.svg';
	import wordmark from '$lib/assets/wwiser.svg';
	import { wwise } from '$lib/wwise/connection.svelte';

	const tools = navigation;
</script>

<div class="flex flex-col h-full items-center justify-center relative">
	<!-- Ambient glow — positioned behind everything, not clipped -->
	<div
		class="rounded-full bg-wwise/4 h-[700px] w-[700px] pointer-events-none left-1/2 top-1/2 absolute blur-[180px] -translate-x-1/2 -translate-y-1/2 -z-1"
	></div>

	<div class="mx-auto px-6 max-w-lg w-full relative space-y-10">
		<!-- Brand -->
		<div class="text-center space-y-5">
			<!-- Logo with glow -->
			<div class="flex justify-center">
				<div class="relative">
					<div class="rounded-full bg-wwise/12 scale-200 inset-0 absolute blur-2xl"></div>
					<img src={logo} alt="" class="h-16 w-16 relative drop-shadow-2xl" />
				</div>
			</div>
			<div class="space-y-4">
				<!-- Wordmark SVG -->
				<div class="flex justify-center">
					<img src={wordmark} alt={siteConfig.name} class="opacity-90 h-8 w-auto dark:invert" />
				</div>

				<!-- Tagline -->
				<p class="text-sm text-muted m-0">
					{siteConfig.tagline}
				</p>
			</div>
		</div>

		<!-- Quick actions — the "what do you want to do?" approach -->
		<div class="space-y-2">
			<!-- Primary: Explorer -->
			<a
				href={explore.href}
				class="group p-4 border border-wwise/15 rounded-2xl flex gap-4 transition-all duration-200 items-center relative overflow-hidden from-wwise/6 to-transparent via-transparent bg-gradient-to-r hover:border-wwise/30 hover:from-wwise/10"
			>
				<div
					class="rounded-xl bg-wwise/12 flex shrink-0 h-10 w-10 transition-colors items-center justify-center group-hover:bg-wwise/20"
				>
					<Terminal size={18} class="text-wwise" />
				</div>
				<div class="flex-1 min-w-0">
					<span class="text-sm text-base font-semibold">{explore.name}</span>
					<p class="text-xs text-muted m-0 mt-0.5">{explore.description}</p>
				</div>
				<ArrowRight
					size={14}
					class="text-wwise/30 shrink-0 transition-all group-hover:text-wwise/70 group-hover:translate-x-0.5"
				/>
			</a>

			<!-- Tool shortcuts — compact row items -->
			{#each tools as feature (feature.id)}
				{@const Icon = iconMap[feature.icon]}
				<a
					href={feature.href}
					class="group px-4 py-3 rounded-xl flex gap-3 transition-all duration-150 items-center hover:bg-surface-100/80 dark:hover:bg-surface-800/50"
				>
					<div
						class="rounded-lg bg-surface-100/80 flex shrink-0 h-8 w-8 transition-colors duration-150 items-center justify-center dark:bg-surface-800/80 group-hover:bg-wwise/10"
					>
						<Icon
							size={14}
							class="text-subtle transition-colors duration-150 group-hover:text-wwise"
						/>
					</div>
					<span
						class="text-[13px] text-muted font-medium transition-colors group-hover:text-surface-900 dark:group-hover:text-surface-100"
						>{feature.name}</span
					>
					<span
						class="text-[11px] text-muted/60 hidden transition-colors group-hover:text-muted sm:block"
						>{feature.description}</span
					>
				</a>
			{/each}
		</div>

		<!-- Footer meta -->
		<div class="flex gap-3 items-center justify-center">
			{#if wwise.isConnected}
				<span class="text-[11px] text-green-500/60 flex gap-1.5 items-center">
					<span class="rounded-full bg-green-500 h-1.5 w-1.5 inline-block animate-pulse"></span>
					Connected
				</span>
			{:else}
				<span class="text-[11px] text-muted/50 flex gap-1 items-center">
					<Zap size={10} />
					Offline
				</span>
			{/if}
			<span class="text-muted/30">·</span>
			<a
				href={siteConfig.social.github}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[11px] text-muted/50 flex gap-1 transition-colors items-center hover:text-wwise"
			>
				<Github size={10} />
				Source
			</a>
			<span class="text-muted/30">·</span>
			<span class="text-[11px] text-muted/40">{siteConfig.version}</span>
		</div>
	</div>
</div>
