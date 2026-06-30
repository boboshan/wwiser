import { describe, it, expect } from 'vitest';
import { siteConfig } from './site';

describe('siteConfig', () => {
	it('uses the wwiser.app canonical domain', () => {
		expect(siteConfig.url).toBe('https://wwiser.app');
	});
});
