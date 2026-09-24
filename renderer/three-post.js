/**
 * three-post.js — After three.cjs has loaded and written to exports,
 * copy everything to window.THREE so globe.js can use it.
 * Then restore whatever module/exports were there before.
 */
(function () {
  // three.cjs may write to module.exports directly, or to exports.XXX
  // Grab whichever has the goods
  var mod = (window.module && window.module.exports && Object.keys(window.module.exports).length > 0)
    ? window.module.exports
    : window.exports;

  if (mod && Object.keys(mod).length > 0) {
    window.THREE = mod;
  }

  // Restore original module/exports (or clean up)
  if (window.__origModule !== undefined) {
    window.module = window.__origModule;
    delete window.__origModule;
  } else {
    delete window.module;
  }
  if (window.__origExports !== undefined) {
    window.exports = window.__origExports;
    delete window.__origExports;
  } else {
    delete window.exports;
  }
})();
