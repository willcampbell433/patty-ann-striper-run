import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SOURCE_BYTES,
  buildPhotoPath,
  validatePhotoFile,
} from "../photo-utils.js";

test("photo validation accepts the supported browser image types", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
    assert.deepEqual(
      validatePhotoFile({ name: `catch.${type.split("/")[1]}`, type, size: MAX_SOURCE_BYTES }),
      { valid: true, error: null },
    );
  }
});

test("photo validation rejects unsupported files and files over 20 MB", () => {
  assert.deepEqual(
    validatePhotoFile({ name: "clip.mov", type: "video/quicktime", size: 100 }),
    { valid: false, error: "clip.mov is not a supported photo." },
  );
  assert.deepEqual(
    validatePhotoFile({ name: "huge.jpg", type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 }),
    { valid: false, error: "huge.jpg is larger than 20 MB." },
  );
});

test("photo object paths stay inside the active trip folder", () => {
  assert.equal(
    buildPhotoPath({
      tripSlug: "patty-ann-2026-11-07",
      id: "123e4567-e89b-42d3-a456-426614174000",
    }),
    "patty-ann-2026-11-07/123e4567-e89b-42d3-a456-426614174000.jpg",
  );
  assert.throws(
    () => buildPhotoPath({ tripSlug: "../other", id: "123e4567-e89b-42d3-a456-426614174000" }),
    /invalid trip slug/i,
  );
});
