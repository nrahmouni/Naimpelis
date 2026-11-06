import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAllowedRemoteBrowserUrl } from '../server/RemoteBrowserManager';

describe('isAllowedRemoteBrowserUrl', () => {
  it('accepts an explicitly allowed host and its subdomains', () => {
    assert.equal(isAllowedRemoteBrowserUrl('https://themoviedb.org/movie/123'), true);
    assert.equal(isAllowedRemoteBrowserUrl('https://image.themoviedb.org/poster/123'), true);
  });

  it('rejects hosts that only contain an allowed hostname as a suffix', () => {
    assert.equal(isAllowedRemoteBrowserUrl('https://themoviedb.org.attacker.test/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://notthemoviedb.org/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://movidy.pw/'), false);
  });

  it('rejects unsafe schemes, credentials, custom ports, and malformed URLs', () => {
    assert.equal(isAllowedRemoteBrowserUrl('ftp://themoviedb.org/file'), false);
    assert.equal(isAllowedRemoteBrowserUrl('******themoviedb.org/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('https://themoviedb.org:8443/'), false);
    assert.equal(isAllowedRemoteBrowserUrl('not a url'), false);
  });
});
