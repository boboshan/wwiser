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

	// Normalize canonical URL: remove trailing slashes, fallback to site URL
	const normalizedCanonical = $derived.by(() => {
		const url = canonical || siteConfig.url;
		// Remove trailing slash unless it's the root URL
		return url.endsWith('/') && url !== siteConfig.url + '/' ? url.slice(0, -1) : url;
	});

	const ogUrl = $derived(normalizedCanonical);

	// JSON-LD structured data for Google
	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${siteConfig.url}/#website`,
				url: siteConfig.url,
				name: siteConfig.name,
				description: siteConfig.description,
				publisher: {
					'@id': `${siteConfig.url}/#organization`
				}
			},
			{
				'@type': 'Organization',
				'@id': `${siteConfig.url}/#organization`,
				name: siteConfig.name,
				url: siteConfig.url,
				logo: {
					'@type': 'ImageObject',
					url: `${siteConfig.url}/icon-512.png`
				}
			}
		]
	};
</script>

<svelte:head>
	<!-- JSON-LD Structured Data -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static JSON-LD, no user input -->
	{@html `<${'script'} type="application/ld+json">${JSON.stringify(jsonLd)}</${'script'}>`}

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

	<!-- Canonical URL (always present for SEO) -->
	<link rel="canonical" href={normalizedCanonical} />

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
	<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />

	<!-- App Meta -->
	<meta name="application-name" content={siteConfig.name} />
	<meta name="apple-mobile-web-app-title" content={siteConfig.name} />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="mobile-web-app-capable" content="yes" />
</svelte:head>
