import { siteConfig, navigation, explore } from '$lib/config/site';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const pages = [
		{ path: '/', priority: 1.0, changefreq: 'weekly' },
		{ path: '/about', priority: 0.5, changefreq: 'monthly' },
		{ path: explore.href, priority: 0.9, changefreq: 'weekly' },
		...navigation.map((item) => ({
			path: item.href,
			priority: 0.8,
			changefreq: 'weekly' as const
		}))
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
	.map(
		(page) => `  <url>
    <loc>${siteConfig.url}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
