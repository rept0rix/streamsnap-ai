/**
 * Mirrors LiveScanPolicy.decide() so the sampling rules can be verified
 * without an Android toolchain.
 */
const MIN_INTERVAL_MS = 20_000;
const STILL_FRAMES_REQUIRED = 3;
const STILL_HAMMING_MAX = 4;
const DUPLICATE_HAMMING_MAX = 6;

function bitCount(n) {
  let x = BigInt(n);
  let c = 0;
  while (x !== 0n) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

function decide({
  hash,
  nowMs,
  lastSampleAtMs,
  lastScanHash,
  stillHash,
  stillCount,
  stillScanned
}) {
  let nextStillHash;
  let nextStillCount;
  let nextStillScanned = stillScanned;

  if (stillHash !== 0 && bitCount(stillHash ^ hash) <= STILL_HAMMING_MAX) {
    nextStillHash = stillHash;
    nextStillCount = stillCount + 1;
  } else {
    nextStillHash = hash;
    nextStillCount = 1;
    nextStillScanned = false;
  }

  const isDuplicateOfLastScan =
    lastScanHash !== 0 && bitCount(lastScanHash ^ hash) < DUPLICATE_HAMMING_MAX;
  const pausedNow = nextStillCount >= STILL_FRAMES_REQUIRED && !nextStillScanned;
  const periodicDue = nowMs - lastSampleAtMs >= MIN_INTERVAL_MS;

  if (pausedNow) {
    return {
      trigger: isDuplicateOfLastScan ? null : "pause",
      skippedDuplicate: isDuplicateOfLastScan,
      stillHash: nextStillHash,
      stillCount: nextStillCount,
      stillScanned: true
    };
  }
  if (periodicDue) {
    return {
      trigger: isDuplicateOfLastScan ? null : "periodic",
      skippedDuplicate: isDuplicateOfLastScan,
      stillHash: nextStillHash,
      stillCount: nextStillCount,
      stillScanned: nextStillScanned
    };
  }
  return {
    trigger: null,
    skippedDuplicate: false,
    stillHash: nextStillHash,
    stillCount: nextStillCount,
    stillScanned: nextStillScanned
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Motion: 3 near-identical hashes → pause scan once
let state = { stillHash: 0n, stillCount: 0, stillScanned: false, lastScanHash: 0n, lastSampleAtMs: 0 };
const HASH_A = 0xffff0000ffff0000n;
for (let i = 1; i <= 3; i++) {
  const d = decide({
    hash: HASH_A,
    nowMs: 1000 + i * 400,
    lastSampleAtMs: state.lastSampleAtMs,
    lastScanHash: state.lastScanHash,
    stillHash: state.stillHash,
    stillCount: state.stillCount,
    stillScanned: state.stillScanned
  });
  state = { ...state, ...d };
  if (i < 3) {
    assert(d.trigger === null, `expected no trigger on still frame ${i}, got ${d.trigger}`);
  } else {
    assert(d.trigger === "pause", `expected pause on frame 3, got ${d.trigger}`);
    state.lastScanHash = HASH_A;
    state.lastSampleAtMs = 1000 + i * 400;
  }
}

// Same still period must not scan again
const again = decide({
  hash: HASH_A,
  nowMs: 4000,
  lastSampleAtMs: state.lastSampleAtMs,
  lastScanHash: state.lastScanHash,
  stillHash: state.stillHash,
  stillCount: state.stillCount,
  stillScanned: state.stillScanned
});
assert(again.trigger === null, "pause period must scan only once");
assert(again.skippedDuplicate === false || again.trigger === null, "no second pause scan");

// Motion resets stillness; after 5s a different frame is periodic
const HASH_B = 0x00ff00ff00ff00ffn;
assert(bitCount(HASH_A ^ HASH_B) > DUPLICATE_HAMMING_MAX, "test hashes must differ");
const moved = decide({
  hash: HASH_B,
  nowMs: state.lastSampleAtMs + MIN_INTERVAL_MS,
  lastSampleAtMs: state.lastSampleAtMs,
  lastScanHash: state.lastScanHash,
  stillHash: state.stillHash,
  stillCount: state.stillCount,
  stillScanned: true
});
assert(moved.trigger === "periodic", `expected periodic after motion + interval, got ${moved.trigger}`);
assert(moved.stillCount === 1, "motion must reset still count");

// Near-duplicate of last scan is skipped
const near = HASH_B ^ 0x3n; // 2 bits
const skip = decide({
  hash: near,
  nowMs: state.lastSampleAtMs + MIN_INTERVAL_MS * 2,
  lastSampleAtMs: state.lastSampleAtMs,
  lastScanHash: HASH_B,
  stillHash: 0n,
  stillCount: 0,
  stillScanned: false
});
assert(skip.skippedDuplicate === true, "near-duplicate of last scan must skip");
assert(skip.trigger === null, "skipped duplicate has no trigger");

console.log("live-scan policy checks passed");
