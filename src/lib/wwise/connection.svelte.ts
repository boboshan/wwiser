/**
 * Wwise WAAPI Connection Manager
 * Uses WAMP protocol via autobahn.js to communicate with Wwise
 */

import { browser } from '$app/environment';

// ============================================================================
// Types
// ============================================================================

export type Status = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ConflictResolution = 'fail' | 'rename' | 'replace' | 'merge';

export interface ProjectInfo {
	name: string;
	path: string;
	isDirty: boolean;
}

export interface WwiseObject {
	id: string;
	name: string;
	type: string;
	path: string;
	parent?: WwiseObject;
}

export interface AudioSourceInfo {
	id: string;
	name: string;
	type: string;
	path: string;
	originalFilePath: string;
}

// ============================================================================
// Constants
// ============================================================================

export const CONTAINER_TYPES = [
	{ value: 'ActorMixer', label: 'Actor-Mixer' },
	{ value: 'BlendContainer', label: 'Blend Container' },
	{ value: 'RandomSequenceContainer', label: 'Random Container' },
	{ value: 'SwitchContainer', label: 'Switch Container' },
	{ value: 'Folder', label: 'Folder' },
	{ value: 'WorkUnit', label: 'Work Unit' }
] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number]['value'];

const AUTOBAHN_URLS = [
	'https://unpkg.com/autobahn-browser@22.11.1/autobahn.min.js',
	'https://cdn.jsdelivr.net/npm/autobahn-browser@22.11.1/autobahn.min.js'
];

const CONNECTION_TIMEOUT = 5000;

// ============================================================================
// Autobahn Types (external library)
// ============================================================================

interface AutobahnConnection {
	onopen: (session: AutobahnSession) => void;
	onclose: (reason: string, details: unknown) => boolean;
	open: () => void;
	close: () => void;
}

interface AutobahnSession {
	call: (
		uri: string,
		args?: unknown[],
		kwargs?: Record<string, unknown>,
		options?: Record<string, unknown>
	) => Promise<{ kwargs?: unknown } | unknown>;
	subscribe: (
		topic: string,
		handler: (args: unknown[], kwargs: Record<string, unknown>) => void,
		options?: Record<string, unknown>
	) => Promise<AutobahnSubscription>;
}

interface AutobahnSubscription {
	unsubscribe: () => Promise<void>;
}

interface AutobahnModule {
	Connection: new (opts: { url: string; realm: string; protocols: string[] }) => AutobahnConnection;
}

interface WampError {
	args?: string[];
	kwargs?: { message?: string };
	error?: string;
	message?: string;
}

// ============================================================================
// Wwise Connection Manager
// ============================================================================

class WwiseConnection {
	// Reactive state
	status = $state<Status>('disconnected');
	project = $state<ProjectInfo | null>(null);
	error = $state('');

	// Derived
	isConnected = $derived(this.status === 'connected');

	// Private (non-reactive)
	#connection: AutobahnConnection | null = null;
	#session: AutobahnSession | null = null;
	#host = '127.0.0.1';
	#port = 8080;

	get url() {
		return `ws://${this.#host}:${this.#port}/waapi`;
	}

	// -------------------------------------------------------------------------
	// Connection
	// -------------------------------------------------------------------------

	async connect(host = '127.0.0.1', port = 8080): Promise<boolean> {
		if (!browser) return false;
		if (this.status === 'connecting' || this.status === 'connected') {
			return this.isConnected;
		}

		// Note: Browsers allow ws:// connections to localhost from HTTPS pages
		// (localhost is considered a secure context), so we don't block HTTPS here.

		this.#host = host;
		this.#port = port;
		this.status = 'connecting';
		this.error = '';

		try {
			const autobahn = await this.#loadAutobahn();

			return new Promise((resolve) => {
				this.#connection = new autobahn.Connection({
					url: this.url,
					realm: 'realm1',
					protocols: ['wamp.2.json']
				});

				this.#connection.onopen = async (session: AutobahnSession) => {
					this.#session = session;
					this.status = 'connected';
					try {
						await this.#fetchProject();
					} catch {
						// Project fetch failed, connection still valid
					}
					resolve(true);
				};

				this.#connection.onclose = (reason: string) => {
					this.#session = null;
					this.project = null;
					if (reason === 'closed') {
						this.status = 'disconnected';
					} else {
						this.status = 'error';
						this.error = `Connection closed: ${reason}`;
					}
					return false;
				};

				this.#connection.open();

				setTimeout(() => {
					if (this.status === 'connecting') {
						this.status = 'error';
						this.error = 'Connection timeout - is Wwise running?';
						resolve(false);
					}
				}, CONNECTION_TIMEOUT);
			});
		} catch (e) {
			this.status = 'error';
			this.error = e instanceof Error ? e.message : 'Failed to connect';
			return false;
		}
	}

	disconnect() {
		if (this.#connection) {
			this.#connection.close();
			this.#connection = null;
			this.#session = null;
			this.status = 'disconnected';
			this.project = null;
		}
	}

	// -------------------------------------------------------------------------
	// WAAPI Operations
	// -------------------------------------------------------------------------

	async call<T = unknown>(
		uri: string,
		args: Record<string, unknown> = {},
		options: Record<string, unknown> = {}
	): Promise<T> {
		if (!this.#session) {
			throw new Error('Not connected to Wwise');
		}

		try {
			const result = await this.#session.call(uri, [], args, options);
			if (result && typeof result === 'object' && 'kwargs' in result) {
				return result.kwargs as T;
			}
			return result as T;
		} catch (e: unknown) {
			const err = e as WampError;
			const message =
				err?.args?.[0] ?? err?.kwargs?.message ?? err?.error ?? err?.message ?? 'Unknown error';
			throw new Error(`WAAPI Error (${uri}): ${message}`);
		}
	}

	async getSelectedObjects(): Promise<WwiseObject[]> {
		const result = await this.call<{ objects: WwiseObject[] }>(
			'ak.wwise.ui.getSelectedObjects',
			{},
			{ return: ['id', 'name', 'type', 'path', 'parent'] }
		);
		return result?.objects ?? [];
	}

	async createObject(
		parent: string,
		type: string,
		name: string,
		onNameConflict: ConflictResolution = 'rename'
	): Promise<WwiseObject | null> {
		const result = await this.call<WwiseObject>('ak.wwise.core.object.create', {
			parent,
			type,
			name,
			onNameConflict
		});
		return result ?? null;
	}

	async moveObject(
		objectId: string,
		newParent: string,
		onNameConflict: ConflictResolution = 'rename'
	): Promise<void> {
		await this.call('ak.wwise.core.object.move', {
			object: objectId,
			parent: newParent,
			onNameConflict
		});
	}

	async renameObject(objectId: string, newName: string): Promise<void> {
		await this.call('ak.wwise.core.object.setName', {
			object: objectId,
			value: newName
		});
	}

	async copyObject(
		objectId: string,
		newParent: string,
		onNameConflict: ConflictResolution = 'rename'
	): Promise<WwiseObject | null> {
		const result = await this.call<WwiseObject>('ak.wwise.core.object.copy', {
			object: objectId,
			parent: newParent,
			onNameConflict
		});
		return result ?? null;
	}

	async getObject(
		objectId: string,
		returns: string[] = ['id', 'name', 'type', 'path', 'parent']
	): Promise<WwiseObject | null> {
		const result = await this.call<{ return: WwiseObject[] }>(
			'ak.wwise.core.object.get',
			{ from: { id: [objectId] } },
			{ return: returns }
		);
		return result?.return?.[0] ?? null;
	}

	async getObjects(
		query: { id?: string[]; path?: string[]; search?: string[]; ofType?: string[] },
		returns: string[] = ['id', 'name', 'type', 'path']
	): Promise<WwiseObject[]> {
		const result = await this.call<{ return: WwiseObject[] }>(
			'ak.wwise.core.object.get',
			{ from: query },
			{ return: returns }
		);
		return result?.return ?? [];
	}

	async getChildren(
		objectId: string,
		returns: string[] = ['id', 'name', 'type', 'path']
	): Promise<WwiseObject[]> {
		const result = await this.call<{ return: WwiseObject[] }>(
			'ak.wwise.core.object.get',
			{
				from: { id: [objectId] },
				transform: [{ select: ['children'] }]
			},
			{ return: returns }
		);
		return result?.return ?? [];
	}

	async getProperty<T = unknown>(objectId: string, property: string): Promise<T | null> {
		const result = await this.call<{ return: Array<{ [key: string]: T }> }>(
			'ak.wwise.core.object.get',
			{ from: { id: [objectId] } },
			{ return: [property] }
		);
		return result?.return?.[0]?.[property] ?? null;
	}

	async setProperty(objectId: string, property: string, value: unknown): Promise<void> {
		await this.call('ak.wwise.core.object.setProperty', {
			object: objectId,
			property,
			value
		});
	}

	async setReference(objectId: string, reference: string, value: string | null): Promise<void> {
		await this.call('ak.wwise.core.object.setReference', {
			object: objectId,
			reference,
			value
		});
	}

	async getReference(objectId: string, reference: string): Promise<WwiseObject | null> {
		const result = await this.call<{ return: Array<{ [key: string]: WwiseObject }> }>(
			'ak.wwise.core.object.get',
			{ from: { id: [objectId] } },
			{ return: [`@${reference}`] }
		);
		return result?.return?.[0]?.[`@${reference}`] ?? null;
	}

	// -------------------------------------------------------------------------
	// Switch Container Operations
	// -------------------------------------------------------------------------

	async getAllSwitchGroups(): Promise<WwiseObject[]> {
		return this.getObjects({ ofType: ['SwitchGroup'] }, ['id', 'name', 'type', 'path']);
	}

	async getAllStateGroups(): Promise<WwiseObject[]> {
		return this.getObjects({ ofType: ['StateGroup'] }, ['id', 'name', 'type', 'path']);
	}

	async getSwitchGroupOrStateGroup(objectId: string): Promise<WwiseObject | null> {
		// Get the SwitchGroupOrStateGroup reference from a switch container
		return this.getReference(objectId, 'SwitchGroupOrStateGroup');
	}

	async setSwitchGroupOrStateGroup(containerId: string, groupId: string): Promise<void> {
		await this.setReference(containerId, 'SwitchGroupOrStateGroup', groupId);
	}

	async getDefaultSwitchOrState(containerId: string): Promise<WwiseObject | null> {
		return this.getReference(containerId, 'DefaultSwitchOrState');
	}

	async setDefaultSwitchOrState(containerId: string, switchOrStateId: string): Promise<void> {
		await this.setReference(containerId, 'DefaultSwitchOrState', switchOrStateId);
	}

	async getSwitchContainerAssignments(
		containerId: string
	): Promise<Array<{ child: string; stateOrSwitch: string }>> {
		const result = await this.call<{
			return: Array<{ child: string; stateOrSwitch: string }>;
		}>('ak.wwise.core.switchContainer.getAssignments', {
			id: containerId
		});
		return result?.return ?? [];
	}

	async assignSwitchContainerChild(
		containerId: string,
		childId: string,
		switchOrStateId: string
	): Promise<void> {
		await this.call('ak.wwise.core.switchContainer.addAssignment', {
			stateOrSwitch: switchOrStateId,
			child: childId
		});
	}

	async removeSwitchContainerAssignment(
		containerId: string,
		childId: string,
		switchOrStateId: string
	): Promise<void> {
		await this.call('ak.wwise.core.switchContainer.removeAssignment', {
			stateOrSwitch: switchOrStateId,
			child: childId
		});
	}

	// -------------------------------------------------------------------------
	// Audio Source Operations
	// -------------------------------------------------------------------------

	/**
	 * Get audio source file info for objects (Sound, MusicTrack, etc.)
	 * Returns the original file path of the audio source
	 */
	async getAudioSourceOriginalFilePath(objectId: string): Promise<string | null> {
		const result = await this.call<{ return: Array<{ 'sound:originalWavFilePath': string }> }>(
			'ak.wwise.core.object.get',
			{ from: { id: [objectId] } },
			{ return: ['sound:originalWavFilePath'] }
		);
		return result?.return?.[0]?.['sound:originalWavFilePath'] ?? null;
	}

	/**
	 * Get audio sources for selected objects
	 * Returns objects that have audio sources (Sound objects or objects containing them)
	 */
	async getAudioSources(objectIds: string[]): Promise<AudioSourceInfo[]> {
		const result = await this.call<{
			return: Array<{
				id: string;
				name: string;
				type: string;
				path: string;
				'sound:originalWavFilePath': string;
			}>;
		}>(
			'ak.wwise.core.object.get',
			{ from: { id: objectIds } },
			{ return: ['id', 'name', 'type', 'path', 'sound:originalWavFilePath'] }
		);
		return (result?.return ?? [])
			.filter((obj) => obj['sound:originalWavFilePath'])
			.map((obj) => ({
				id: obj.id,
				name: obj.name,
				type: obj.type,
				path: obj.path,
				originalFilePath: obj['sound:originalWavFilePath']
			}));
	}

	/**
	 * Rename an AudioSource object
	 * The AudioSource name in Wwise reflects the source file name (without path/extension)
	 */
	async setAudioSourceOriginalFilePath(objectId: string, newFilePath: string): Promise<void> {
		// Extract just the filename without extension for the AudioSource name
		const separator = newFilePath.includes('\\') ? '\\' : '/';
		const parts = newFilePath.split(separator);
		const fileName = parts[parts.length - 1];
		const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

		await this.call('ak.wwise.core.object.setName', {
			object: objectId,
			value: nameWithoutExt
		});
	}

	/**
	 * Execute a command on selected objects (for file operations)
	 */
	async executeCommand(command: string, objects?: string[]): Promise<void> {
		const args: Record<string, unknown> = { command };
		if (objects) {
			args.objects = objects;
		}
		await this.call('ak.wwise.ui.commands.execute', args);
	}

	// -------------------------------------------------------------------------
	// Undo Group
	// -------------------------------------------------------------------------

	async beginUndoGroup(): Promise<void> {
		await this.call('ak.wwise.core.undo.beginGroup', {});
	}

	async endUndoGroup(displayName = 'Wwiser Operation'): Promise<void> {
		await this.call('ak.wwise.core.undo.endGroup', { displayName });
	}

	async cancelUndoGroup(): Promise<void> {
		await this.call('ak.wwise.core.undo.cancelGroup', {});
	}

	// -------------------------------------------------------------------------
	// Subscription
	// -------------------------------------------------------------------------

	async subscribe(
		topic: string,
		handler: (data: Record<string, unknown>) => void,
		options: Record<string, unknown> = {}
	): Promise<{ unsubscribe: () => Promise<void> }> {
		if (!this.#session) {
			throw new Error('Not connected to Wwise');
		}

		try {
			const subscription = await this.#session.subscribe(
				topic,
				(_args: unknown[], kwargs: Record<string, unknown>) => {
					handler(kwargs);
				},
				options
			);
			return {
				unsubscribe: () => subscription.unsubscribe()
			};
		} catch (e: unknown) {
			const err = e as WampError;
			const message =
				err?.args?.[0] ?? err?.kwargs?.message ?? err?.error ?? err?.message ?? 'Unknown error';
			throw new Error(`WAAPI Subscribe Error (${topic}): ${message}`);
		}
	}

	// -------------------------------------------------------------------------
	// WAAPI Schema (get available functions/topics)
	// -------------------------------------------------------------------------

	async getFunctions(): Promise<{ uri: string }[]> {
		const result = await this.call<{ functions: string[] }>('ak.wwise.waapi.getFunctions', {});
		// WAAPI returns { functions: string[] }
		return (result?.functions ?? []).map((uri) => ({ uri }));
	}

	async getTopics(): Promise<{ uri: string }[]> {
		const result = await this.call<{ topics: string[] }>('ak.wwise.waapi.getTopics', {});
		// WAAPI returns { topics: string[] }
		return (result?.topics ?? []).map((uri) => ({ uri }));
	}

	async getSchema(uri: string): Promise<Record<string, unknown> | null> {
		try {
			const result = await this.call<Record<string, unknown>>('ak.wwise.waapi.getSchema', { uri });
			return result ?? null;
		} catch {
			return null;
		}
	}

	// -------------------------------------------------------------------------
	// Private
	// -------------------------------------------------------------------------

	async #fetchProject(): Promise<void> {
		const info = await this.call<{ projectPath?: string }>('ak.wwise.core.getInfo', {});
		if (info?.projectPath) {
			const pathParts = info.projectPath.split(/[/\\]/);
			const projectFile = pathParts[pathParts.length - 1];
			this.project = {
				name: projectFile.replace('.wproj', ''),
				path: info.projectPath,
				isDirty: false
			};
		}
	}

	async #loadAutobahn(): Promise<AutobahnModule> {
		if ('autobahn' in window) {
			return window.autobahn as AutobahnModule;
		}

		for (const url of AUTOBAHN_URLS) {
			try {
				await this.#loadScript(url);
				if ('autobahn' in window) {
					return window.autobahn as AutobahnModule;
				}
			} catch {
				continue;
			}
		}
		throw new Error('Failed to load autobahn from CDN');
	}

	#loadScript(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = url;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error(`Failed to load: ${url}`));
			document.head.appendChild(script);
		});
	}
}

// ============================================================================
// Singleton Export
// ============================================================================

export const wwise = new WwiseConnection();
