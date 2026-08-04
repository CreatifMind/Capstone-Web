import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadUploadHelpers() {
  const source = readFileSync("public/js/script.js", "utf8");
  const context = {
    console,
    URLSearchParams,
    setTimeout,
    window: { addEventListener() {} },
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; } }
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.uploadHelpers = { plIsSupportedImageFile };`, context);
  return context.uploadHelpers;
}

test("image upload accepts supported image MIME types", () => {
  const { plIsSupportedImageFile } = loadUploadHelpers();

  assert.equal(plIsSupportedImageFile({ name: "scan.jpg", type: "image/jpeg" }), true);
  assert.equal(plIsSupportedImageFile({ name: "scan.png", type: "image/png" }), true);
  assert.equal(plIsSupportedImageFile({ name: "scan.webp", type: "image/webp" }), true);
});

test("image upload accepts valid image extensions when browser MIME is empty or generic", () => {
  const { plIsSupportedImageFile } = loadUploadHelpers();

  assert.equal(plIsSupportedImageFile({ name: "UPPER.JPG", type: "" }), true);
  assert.equal(plIsSupportedImageFile({ name: "medium image (test).jpg", type: "application/octet-stream" }), true);
  assert.equal(plIsSupportedImageFile({ name: "unicode café.png", type: "binary/octet-stream" }), true);
});

test("image upload rejects unsupported MIME or extension combinations", () => {
  const { plIsSupportedImageFile } = loadUploadHelpers();

  assert.equal(plIsSupportedImageFile({ name: "scan.txt", type: "text/plain" }), false);
  assert.equal(plIsSupportedImageFile({ name: "scan.jpg", type: "text/plain" }), false);
  assert.equal(plIsSupportedImageFile({ name: "scan", type: "application/octet-stream" }), false);
});
