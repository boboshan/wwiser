<script lang="ts">
	import { siteConfig, navigation, explore, iconMap } from '$lib/config/site';
	import { ArrowRight, Terminal, Zap, Github } from 'lucide-svelte';
	import logo from '$lib/assets/logo.svg';
	import wordmark from '$lib/assets/wwiser.svg';
	import { wwise } from '$lib/wwise/connection.svelte';

	const tools = navigation.filter((t) => t.featured);
</script>

<div class="flex flex-col min-h-full items-center relative">
	<!-- Ambient glow -->
	<div
		class="rounded-full bg-wwise/8 h-full max-h-[500px] max-w-[500px] w-full pointer-events-none left-1/2 top-[30%] absolute blur-[140px] md:max-h-[800px] md:max-w-[800px] -translate-x-1/2 -translate-y-1/2 -z-1 md:blur-[200px]"
	></div>

	<div
		class="mx-auto my-auto px-4 py-8 flex flex-col gap-8 max-w-xl w-full relative md:py-12 sm:px-6"
	>
		<!-- Brand -->
		<div class="text-center space-y-4 md:space-y-6">
			<div class="flex justify-center">
				<div class="relative">
					<div
						class="rounded-full bg-wwise/15 scale-250 inset-0 absolute animate-pulse blur-3xl"
					></div>
					<img
						src={logo}
						alt=""
						class="h-16 w-16 relative drop-shadow-[0_0_30px_rgba(48,105,255,0.3)] md:h-20 md:w-20"
					/>
				</div>
			</div>

			<div class="inline-flex flex-col items-center">
				<img src={wordmark} alt={siteConfig.name} class="opacity-90 h-10 md:h-12 dark:invert" />
				<p class="text-sm text-muted tracking-wide mt-2 md:mt-3">
					{siteConfig.tagline}
				</p>
			</div>
		</div>

		<!-- Explorer — hero CTA -->
		<a
			href={explore.href}
			class="group p-4 border border-wwise/12 rounded-2xl flex gap-4 transition-all duration-300 items-center relative overflow-hidden from-wwise/8 to-transparent via-wwise/3 bg-gradient-to-br backdrop-blur-sm sm:p-5 hover:border-wwise/25 hover:shadow-lg hover:shadow-wwise/5 hover:from-wwise/12"
		>
			<div
				class="rounded-xl bg-wwise/15 flex shrink-0 h-11 w-11 transition-all duration-300 items-center justify-center group-hover:bg-wwise/25 group-hover:scale-105"
			>
				<Terminal size={20} class="text-wwise" />
			</div>
			<div class="flex-1 min-w-0">
				<span class="text-[15px] text-base font-semibold">{explore.name}</span>
				<p class="text-xs text-muted m-0 mt-0.5 truncate">{explore.description}</p>
			</div>
			<ArrowRight
				size={16}
				class="text-wwise/25 shrink-0 transition-all duration-300 group-hover:text-wwise/60 group-hover:translate-x-1"
			/>
		</a>

		<!-- Tools grid -->
		<div class="space-y-3">
			<p
				class="text-[10px] text-muted/50 tracking-[0.2em] font-semibold px-1 select-none uppercase"
			>
				Tools
			</p>
			<div class="gap-1.5 grid grid-cols-1 sm:grid-cols-2">
				{#each tools as feature (feature.id)}
					{@const Icon = iconMap[feature.icon]}
					<a
						href={feature.href}
						class="group p-3 border border-transparent rounded-xl flex gap-3 transition-all duration-200 items-center sm:p-3.5 hover:border-surface-200/60 hover:bg-surface-100/60 dark:hover:border-surface-700/40 dark:hover:bg-surface-800/40"
					>
						<div
							class="rounded-lg bg-surface-100 flex shrink-0 h-8 w-8 transition-all duration-200 items-center justify-center dark:bg-surface-800 group-hover:bg-wwise/10 group-hover:scale-105"
						>
							<Icon
								size={14}
								class="text-surface-400 transition-colors duration-200 dark:text-surface-500 group-hover:text-wwise"
							/>
						</div>
						<div class="min-w-0">
							<span
								class="text-[13px] text-muted font-medium block transition-colors group-hover:text-surface-900 dark:group-hover:text-surface-100"
								>{feature.name}</span
							>
							<span
								class="group-hover:text-muted/70 text-[11px] text-muted/40 block truncate transition-colors"
								>{feature.shortDescription}</span
							>
						</div>
					</a>
				{/each}
			</div>
		</div>

		<!-- Footer -->
		<div class="pt-2 flex flex-wrap gap-x-3 gap-y-1 items-center justify-center">
			{#if wwise.isConnected}
				<span class="text-[11px] text-green-500/60 flex gap-1.5 items-center">
					<span class="rounded-full bg-green-500 h-1.5 w-1.5 inline-block animate-pulse"></span>
					Connected
				</span>
			{:else}
				<span class="text-[11px] text-muted/40 flex gap-1.5 items-center">
					<Zap size={9} />
					Offline
				</span>
			{/if}
			<span class="text-muted/20">·</span>
			<a
				href={siteConfig.social.github}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[11px] text-muted/40 flex gap-1.5 transition-colors items-center hover:text-wwise/80"
			>
				<Github size={9} />
				Source
			</a>
			<span class="text-muted/20">·</span>
			<span class="text-[11px] text-muted/30">{siteConfig.version}</span>
		</div>
	</div>
</div>
