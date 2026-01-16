<script lang="ts">
	import { siteConfig } from '$lib/config/site';

	interface Props {
		title?: string;
		description?: string;
		canonical?: string;
		noindex?: boolean;
		ogImage?: string;
		ogType?: 'website' | 'article';
	}

	let {
		title = siteConfig.title,
		description = siteConfig.description,
		canonical,
		noindex = false,
		ogImage = '/og-image.png',
		ogType = 'website'
	}: Props = $props();

	const fullTitle = $derived(
		title.includes(siteConfig.name) ? title : `${title} | ${siteConfig.name}`
	);
	const ogUrl = $derived(canonical || siteConfig.url);
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{fullTitle}</title>
	<meta name="title" content={fullTitle} />
	<meta name="description" content={description} />
	<meta name="keywords" content={siteConfig.keywords.join(', ')} />
	<meta name="author" content={siteConfig.author} />

	<!-- Robots -->
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta name="robots" content="index, follow" />
	{/if}

	<!-- Canonical URL -->
	{#if canonical}
		<link rel="canonical" href={canonical} />
	{/if}

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={ogUrl} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:site_name" content={siteConfig.name} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={ogUrl} />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- Theme Color -->
	<meta name="theme-color" content="#ff7f00" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#ff7f00" media="(prefers-color-scheme: dark)" />

	<!-- App Meta -->
	<meta name="application-name" content={siteConfig.name} />
	<meta name="apple-mobile-web-app-title" content={siteConfig.name} />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="mobile-web-app-capable" content="yes" />
</svelte:head>
