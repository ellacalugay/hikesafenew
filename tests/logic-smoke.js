'use strict';

const assert = require('node:assert/strict');

function parseClaimedFrame(line, expectedToken) {
  if (typeof line !== 'string' || !line.startsWith('CLAIMED:')) return null;
  const rest = line.slice(8);
  const comma = rest.indexOf(',');
  if (comma <= 0) return null;

  const token = rest.slice(0, comma).trim();
  const mobileId = Number.parseInt(rest.slice(comma + 1).trim(), 10);
  if (!expectedToken || token !== expectedToken) return null;
  if (!Number.isInteger(mobileId) || mobileId < 1 || mobileId > 4) return null;

  return { token, mobileId };
}

function parseClaimFailedFrame(line, expectedToken) {
  if (typeof line !== 'string' || !line.startsWith('CLAIM_FAILED:')) return null;
  const rest = line.slice(13);
  const comma = rest.indexOf(',');

  const token = (comma > 0 ? rest.slice(0, comma) : rest).trim();
  const reason = (comma > 0 ? rest.slice(comma + 1) : 'UNKNOWN').trim() || 'UNKNOWN';
  if (!expectedToken || token !== expectedToken) return null;

  return { token, reason };
}

function normalizeActiveHub(connectedIds, currentActiveId) {
  const ids = Array.isArray(connectedIds) ? connectedIds.filter(Boolean) : [];
  if (ids.length === 0) return null;
  if (currentActiveId && ids.includes(currentActiveId)) return currentActiveId;
  return ids[0];
}

function getDirectMessageRoutingState({ myMobileId, myDeviceId, toDeviceId, toMobileId }) {
  const targetMobile = Number.parseInt(String(toMobileId), 10);
  if (!Number.isInteger(targetMobile) || targetMobile < 1 || targetMobile > 4) {
    return { state: 'invalid-target' };
  }

  const fromMobileId = Number.isInteger(myMobileId) && myMobileId >= 1 && myMobileId <= 4
    ? myMobileId
    : 0;

  if (Number.isInteger(myDeviceId) && toDeviceId === myDeviceId && fromMobileId > 0 && fromMobileId === targetMobile) {
    return { state: 'blocked-self' };
  }

  if (fromMobileId === 0) {
    return { state: 'wait-claim' };
  }

  return { state: 'ready', fromMobileId, targetMobile };
}

function getDmBodyLimit(targetMobile, fromMobileId, maxLen = 50) {
  const safeTo = Number.isInteger(targetMobile) ? targetMobile : 1;
  const safeFrom = Number.isInteger(fromMobileId) ? fromMobileId : 1;
  const prefix = `__DM__:${safeTo}:${safeFrom}:`;
  return Math.max(0, maxLen - prefix.length);
}

const results = [];
function run(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
  }
}

run('CLAIMED parse succeeds for matching token', () => {
  const out = parseClaimedFrame('CLAIMED:abc-123,2', 'abc-123');
  assert.deepEqual(out, { token: 'abc-123', mobileId: 2 });
});

run('CLAIMED parse ignores mismatched token', () => {
  const out = parseClaimedFrame('CLAIMED:abc-123,2', 'zzz');
  assert.equal(out, null);
});

run('CLAIM_FAILED parse surfaces reason', () => {
  const out = parseClaimFailedFrame('CLAIM_FAILED:token-9,FULL_OR_STALE', 'token-9');
  assert.deepEqual(out, { token: 'token-9', reason: 'FULL_OR_STALE' });
});

run('Active hub falls back to first connected', () => {
  const out = normalizeActiveHub(['hubA', 'hubB'], 'missingHub');
  assert.equal(out, 'hubA');
});

run('Direct message blocks self-target on same hub', () => {
  const out = getDirectMessageRoutingState({
    myMobileId: 2,
    myDeviceId: 7,
    toDeviceId: 7,
    toMobileId: 2,
  });
  assert.equal(out.state, 'blocked-self');
});

run('Direct message waits for claim when slot unknown', () => {
  const out = getDirectMessageRoutingState({
    myMobileId: null,
    myDeviceId: 7,
    toDeviceId: 9,
    toMobileId: 1,
  });
  assert.equal(out.state, 'wait-claim');
});

run('Direct message body limit respects DM prefix', () => {
  const limit = getDmBodyLimit(4, 3, 50);
  assert.equal(limit, 39);
});

const failed = results.filter(r => !r.ok);
results.forEach((r) => {
  if (r.ok) {
    console.log(`PASS ${r.name}`);
  } else {
    console.error(`FAIL ${r.name} :: ${r.error}`);
  }
});

if (failed.length > 0) {
  console.error(`\n${failed.length} test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} logic smoke tests passed.`);
