/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const APP_NAME = 'wwiser';
const CACHE_NAME = `${APP_NAME}-${version}`;

// Assets to cache on install
const PRECACHE_ASSETS = [
	...build, // Built JS/CSS from /_app/
	...files  // Static files from /static/
];

// Install: precache app shell
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(PRECACHE_ASSETS);
		})
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

	// Skip external requests
	if (url.origin !== self.location.origin) return;

	// Skip WebSocket connections (WAAPI)
	if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

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
					return cached ?? (await caches.match('/')) ?? new Response('Offline', { status: 503 });
				})
		);
		return;
	}

	// For static assets: cache-first with network fallback
	if (url.pathname.startsWith('/_app/') || url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached;

				return fetch(request).then((response) => {
					if (response.ok) {
						const responseClone = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(request, responseClone);
						});
					}
					return response;
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
				return cached ?? new Response('Offline', { status: 503 });
			})
	);
});
