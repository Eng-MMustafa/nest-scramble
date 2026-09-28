/**
 * Verifies the standalone `serve` proxy allowlist and the per-feature on/off
 * toggles (docs / proxy / mock) so users can decide exactly what is exposed.
 */
import { defaultProxyAllowHosts } from '../src/standalone/StandaloneDocsServer';

describe('proxy allowlist', () => {
  it('allows loopback hosts by default', () => {
    const allowed = defaultProxyAllowHosts();
    expect(allowed.has('localhost')).toBe(true);
    expect(allowed.has('127.0.0.1')).toBe(true);
    expect(allowed.has('::1')).toBe(true);
  });

  it('blocks external hosts by default', () => {
    const allowed = defaultProxyAllowHosts();
    expect(allowed.has('example.com')).toBe(false);
    expect(allowed.has('api.stripe.com')).toBe(false);
    expect(allowed.has('10.0.0.1')).toBe(false);
  });

  it('extends the allowlist with configured hosts', () => {
    const allowed = defaultProxyAllowHosts(['example.com', 'api.internal']);
    expect(allowed.has('example.com')).toBe(true);
    expect(allowed.has('api.internal')).toBe(true);
    expect(allowed.has('localhost')).toBe(true);
  });
});
