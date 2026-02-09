/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const APP_NAME = 'wwiser';
const CACHE_NAME = `${APP_NAME}-${version}`;
// Separate cache for CDN resources - survives app version updates
const CDN_CACHE_NAME = `${APP_NAME}-cdn-v1`;

// Assets to cache on install
const PRECACHE_ASSETS = [
	...build, // Built JS/CSS from /_app/
	...files // Static files from /static/
];

// App routes to cache for offline access
const APP_ROUTES = ['/', '/wrap', '/volume', '/rename', '/assign', '/explore'];

// External CDN resources - multiple sources for redundancy
const CDN_RESOURCES = new Set([
	'https://unpkg.com/autobahn-browser@22.11.1/autobahn.min.js',
	'https://cdn.jsdelivr.net/npm/autobahn-browser@22.11.1/autobahn.min.js'
]);

// ============================================================================
// Install: precache app shell
// ============================================================================
self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			// Cache app assets
			const appCache = await caches.open(CACHE_NAME);
			await appCache.addAll(PRECACHE_ASSETS);

			// Cache app routes (HTML pages)
			await Promise.allSettled(
				APP_ROUTES.map(async (route) => {
					try {
						const response = await fetch(route);
						if (response.ok) {
							await appCache.put(route, response);
						}
					} catch {
						// Skip routes that fail during install
					}
				})
			);

			// Cache CDN resources in separate cache
			const cdnCache = await caches.open(CDN_CACHE_NAME);
			await Promise.allSettled(
				[...CDN_RESOURCES].map(async (url) => {
					// Skip if already cached
					const existing = await cdnCache.match(url);
					if (existing) return;

					try {
						const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
						if (response.ok) {
							await cdnCache.put(url, response);
						}
					} catch {
						// CDN might be blocked or unavailable during install
					}
				})
			);
		})()
	);
	self.skipWaiting();
});

// ============================================================================
// Activate: clean up old caches (preserve CDN cache)
// ============================================================================
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) =>
			Promise.all(
				cacheNames
					.filter((name) => {
						// Delete old app caches, but keep current and CDN cache
						if (name === CACHE_NAME || name === CDN_CACHE_NAME) return false;
						return name.startsWith(APP_NAME);
					})
					.map((name) => caches.delete(name))
			)
		)
	);
	self.clients.claim();
});

// ============================================================================
// Fetch handler
// ============================================================================
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') return;

	// Skip WebSocket connections (WAAPI)
	if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

	// Handle CDN resources: stale-while-revalidate
	if (CDN_RESOURCES.has(request.url)) {
		event.respondWith(handleCdnRequest(request));
		return;
	}

	// Skip other external requests
	if (url.origin !== self.location.origin) return;

	// Navigation: network-first with cache fallback
	if (request.mode === 'navigate') {
		event.respondWith(handleNavigation(request));
		return;
	}

	// Static assets: cache-first
	if (isStaticAsset(url)) {
		event.respondWith(handleStaticAsset(request));
		return;
	}

	// Default: network-first
	event.respondWith(handleDefault(request));
});

// ============================================================================
// Request handlers
// ============================================================================

/**
 * CDN resources: stale-while-revalidate
 * Returns cached version immediately (if available) while fetching fresh copy
 */
async function handleCdnRequest(request: Request): Promise<Response> {
	const cache = await caches.open(CDN_CACHE_NAME);
	const cached = await cache.match(request.url);

	// Revalidate in background (don't await)
	const revalidate = fetch(request.url, { mode: 'cors', credentials: 'omit' })
		.then((response) => {
			if (response.ok) {
				cache.put(request.url, response.clone());
			}
			return response;
		})
		.catch(() => null);

	// Return cached immediately if available
	if (cached) {
		return cached;
	}

	// No cache - must wait for network
	const response = await revalidate;
	if (response) {
		return response;
	}

	return new Response('CDN resource unavailable', {
		status: 503,
		headers: { 'Content-Type': 'text/plain' }
	});
}

/**
 * Navigation: network-first with cache fallback
 */
async function handleNavigation(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		if (cached) return cached;

		// SPA fallback - serve index for any route
		const index = await caches.match('/');
		if (index) return index;

		return new Response('Offline', {
			status: 503,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
}

/**
 * Static assets: cache-first with network fallback
 */
async function handleStaticAsset(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;

	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		return new Response('', { status: 404 });
	}
}

/**
 * Default: network-first with cache fallback
 */
async function handleDefault(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		if (cached) return cached;
		return new Response('', { status: 503 });
	}
}

// ============================================================================
// Utilities
// ============================================================================

function isStaticAsset(url: URL): boolean {
	return (
		url.pathname.startsWith('/_app/') ||
		/\.(js|css|woff2?|png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname)
	);
}
