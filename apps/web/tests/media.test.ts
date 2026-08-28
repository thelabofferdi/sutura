import assert from "node:assert/strict";
import test from "node:test";
import { validateMediaMetadata } from "../convex/media.ts";

test("accepts supported photo metadata", () => {
  assert.doesNotThrow(() => validateMediaMetadata({ contentType: "image/webp", size: 1024 }, "photo"));
});

test("rejects unsupported MIME types", () => {
  assert.throws(
    () => validateMediaMetadata({ contentType: "image/svg+xml", size: 1024 }, "photo"),
    /non pris en charge/,
  );
});

test("rejects oversized videos", () => {
  assert.throws(
    () => validateMediaMetadata({ contentType: "video/mp4", size: 100 * 1024 * 1024 + 1 }, "video"),
    /taille maximale/,
  );
});

test("rejects missing storage metadata", () => {
  assert.throws(() => validateMediaMetadata(null, "sketch"), /introuvable/);
});

test("accepts PDF sketches and rejects PDF as photo", () => {
  assert.doesNotThrow(() => validateMediaMetadata({ contentType: "application/pdf", size: 2048 }, "sketch"));
  assert.throws(() => validateMediaMetadata({ contentType: "application/pdf", size: 2048 }, "photo"), /non pris en charge/);
});

test("rejects zero or negative sizes", () => {
  assert.throws(() => validateMediaMetadata({ contentType: "image/jpeg", size: 0 }, "photo"), /taille maximale/);
  assert.throws(() => validateMediaMetadata({ contentType: "image/png", size: -10 }, "photo"), /taille maximale/);
});

test("accepts boundary sizes", () => {
  assert.doesNotThrow(() => validateMediaMetadata({ contentType: "image/jpeg", size: 10 * 1024 * 1024 }, "photo"));
  assert.doesNotThrow(() => validateMediaMetadata({ contentType: "video/mp4", size: 100 * 1024 * 1024 }, "video"));
});

test("rejects unsupported video MIME", () => {
  assert.throws(() => validateMediaMetadata({ contentType: "video/avi", size: 1024 }, "video"), /non pris en charge/);
});
