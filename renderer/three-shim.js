/**
 * three-shim.js — Prepares the global scope for three.js CJS build.
 *
 * three.cjs uses `exports.XXX = ...` and `module.exports`, which don't exist
 * in a plain browser <script> context. In Electron's renderer (even with
 * nodeIntegration off), residual `module`/`exports` refs may exist from the
 * sandbox. We forcefully set up clean objects so three.cjs writes into them.
 */
(function () {
  // Save originals in case we need to restore (we won't, but safety)
  window.__origModule  = window.module;
  window.__origExports = window.exports;

  // Provide fresh CJS-compatible objects
  window.exports = {};
  window.module  = { exports: window.exports };
})();
