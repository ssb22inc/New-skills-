/* Keep Tab and Shift+Tab inside an open dialog. A focused heading
   (tabindex -1) is not in the list, so the first Tab from it must land
   on a control instead of the page behind the dialog. Returns the element
   to focus when the browser's own move would leave the list, or null when
   the browser should move to the next control as usual. */

export function tabbables(root) {
  if (!root?.querySelectorAll) return [];
  const sel = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
  return [...root.querySelectorAll(sel)].filter((n) => {
    if (n.closest("[hidden]")) return false;
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(n) : null;
    if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
    return true;
  });
}

export function cycleTab(items, active, shift) {
  if (!items?.length) return null;
  const i = items.indexOf(active);
  if (shift) return i <= 0 ? items[items.length - 1] : null;
  if (i < 0 || i >= items.length - 1) return items[0];
  return null;
}
