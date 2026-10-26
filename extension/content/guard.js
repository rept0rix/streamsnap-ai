/**
 * StreamSnap event guard — runs at document_start so its window capture
 * listeners are registered before the page's (TikTok/React, YouTube player).
 *
 * Any pointer/click event whose target is inside StreamSnap UI is stopped at
 * the window, BEFORE the page can see it (fixes TikTok navigating into the
 * live room when Scan is clicked, and YouTube pausing on click). Our own
 * handlers are then invoked directly from a registry on the nodes (node.__ss).
 * Move/up events are not blocked so drag and selection keep working.
 */
(() => {
  if (window.__streamsnapGuard) return;
  window.__streamsnapGuard = true;

  const ROOTS =
    ".streamsnap-btn-group, .streamsnap-hidden-dot, .streamsnap-interactive-cropper, .streamsnap-click-overlay";
  const TYPES = ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "auxclick", "contextmenu"];

  window.__ssOn = (node, type, fn) => {
    if (!node) return;
    node.__ss = node.__ss || {};
    (node.__ss[type] = node.__ss[type] || []).push(fn);
  };

  const onEvent = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const root = t.closest(ROOTS);
    if (!root) return;
    e.stopImmediatePropagation();
    if (e.type === "click" || e.type === "dblclick" || e.type === "auxclick") e.preventDefault();
    for (let n = t; n; n = n.parentElement) {
      const fns = n.__ss?.[e.type];
      if (fns) {
        for (const fn of fns) {
          try {
            fn.call(n, e);
          } catch (err) {
            console.warn("[StreamSnap] handler failed:", err);
          }
        }
      }
      if (n === root) break;
    }
  };

  for (const type of TYPES) window.addEventListener(type, onEvent, true);
})();
