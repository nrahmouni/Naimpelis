import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedRemoteBrowserUrl } from '../server/RemoteBrowserManager';

describe('isAllowedRemoteBrowserUrl', () => {
  it('accepts an explicitly allowed host and its subdomains', () => {
    assert.equal(isAllowedRemoteBrowserUrl('https://bingetrix.sc/watch/123'), true);
    assert.equal(isAllowedRemoteBrowserUrl('https://player.bingetrix.sc/watch/123'), true);
  });

  it('rejects hosts that only contain an allowed hostname as a suffix', () => {
    assert.equal(isAllowedRemoteBrowserUrl('https://bingetrix.sc.attacker.test/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://notbingetrix.sc/'), false);
  });

  it('rejects unsafe schemes, credentials, custom ports, and malformed URLs', () => {
    assert.equal(isAllowedRemoteBrowserUrl('ftp://bingetrix.sc/file'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://user:password@bingetrix.sc/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://bingetrix.sc:8443/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('not a url'), false);
  });
});