/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const APP_NAME = 'wwiser';
const CACHE_NAME = `${APP_NAME}-${version}`;

// Assets to cache on install
const PRECACHE_ASSETS = [
	...build, // Built JS/CSS from /_app/
	...files // Static files from /static/
];

// App routes to cache for offline access
const APP_ROUTES = ['/', '/wrap', '/volume', '/rename', '/assign', '/explore'];

// External CDN resources to cache for offline use
const CDN_RESOURCES = [
	'https://unpkg.com/autobahn-browser@22.11.1/autobahn.min.js',
	'https://cdn.jsdelivr.net/npm/autobahn-browser@22.11.1/autobahn.min.js'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			// Cache static assets
			await cache.addAll(PRECACHE_ASSETS);
			// Cache app routes (HTML pages)
			for (const route of APP_ROUTES) {
				try {
					const response = await fetch(route);
					if (response.ok) {
						await cache.put(route, response);
					}
				} catch {
					// Skip routes that fail to fetch during install
				}
			}
			// Cache CDN resources for offline use
			for (const url of CDN_RESOURCES) {
				try {
					const response = await fetch(url, { mode: 'cors' });
					if (response.ok) {
						await cache.put(url, response);
					}
				} catch {
					// Skip CDN resources that fail to fetch during install
				}
			}
		})()
	);
	// Activate immediately
	self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name.startsWith(APP_NAME) && name !== CACHE_NAME)
					.map((name) => caches.delete(name))
			);
		})
	);
	// Take control of all pages immediately
	self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') return;

	// Skip WebSocket connections (WAAPI)
	if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

	// Handle CDN resources: cache-first for offline support
	if (CDN_RESOURCES.includes(request.url)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached;
				return fetch(request)
					.then((response) => {
						if (response.ok) {
							const responseClone = response.clone();
							caches.open(CACHE_NAME).then((cache) => {
								cache.put(request, responseClone);
							});
						}
						return response;
					})
					.catch(() => new Response('', { status: 503 }));
			})
		);
		return;
	}

	// Skip other external requests
	if (url.origin !== self.location.origin) return;

	// For navigation requests: network-first with cache fallback
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						const responseClone = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(request, responseClone);
						});
					}
					return response;
				})
				.catch(async () => {
					const cached = await caches.match(request);
					if (cached) return cached;
					// For prerendered SPA, serve the cached index page for any route
					const indexPage = await caches.match('/');
					if (indexPage) return indexPage;
					return new Response('Offline', {
						status: 503,
						headers: { 'Content-Type': 'text/plain' }
					});
				})
		);
		return;
	}

	// For static assets: cache-first with network fallback
	if (
		url.pathname.startsWith('/_app/') ||
		url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)
	) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached;

				return fetch(request)
					.then((response) => {
						if (response.ok) {
							const responseClone = response.clone();
							caches.open(CACHE_NAME).then((cache) => {
								cache.put(request, responseClone);
							});
						}
						return response;
					})
					.catch(() => {
						// Return empty response for missing static assets when offline
						return new Response('', { status: 404 });
					});
			})
		);
		return;
	}

	// Default: network-first
	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response.ok) {
					const responseClone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseClone);
					});
				}
				return response;
			})
			.catch(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;
				// Return empty response instead of throwing
				return new Response('', { status: 503 });
			})
	);
});
