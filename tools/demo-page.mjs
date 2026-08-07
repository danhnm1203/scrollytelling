/**
 * Putting the rest of the page under the scroll.
 *
 * Pure string work, split out of the runner so it can be tested without a
 * build: the surgery is the part that goes wrong, and the part that has to
 * survive being run twice.
 */

/** The block this owns. Everything between the markers is replaceable. */
export const OPEN = "<!-- demo-sections -->";
export const CLOSE = "<!-- /demo-sections -->";

/**
 * The page with `markup` sitting after the scroll.
 *
 * Idempotent on purpose. `scaffold` does not overwrite a page it has already
 * generated, so a second `npm run sample` into the same directory reads a page
 * that already carries these sections — and an append would stack a second
 * copy underneath the first. The first version of this did exactly that, and
 * the duplicate was only visible as a stray selector match in a browser.
 *
 * Anchored to the empty-state panel, which is the first thing after the runway
 * in the template. Throws when it is missing rather than guessing at a
 * position: the template having moved is worth hearing about, and markup put
 * somewhere arbitrary is worse than markup not put at all.
 *
 * @param {string} page  the generated index.html
 * @param {string} markup  the sections to place
 * @returns {string}
 */
export function withSections(page, markup) {
  const block = `${OPEN}\n${markup.trim()}\n${CLOSE}`;

  const from = page.indexOf(OPEN);
  if (from !== -1) {
    const to = page.indexOf(CLOSE, from);
    if (to === -1) throw new Error("the demo sections block is opened but never closed");
    return page.slice(0, from) + block + page.slice(to + CLOSE.length);
  }

  const anchor = "<div data-scrollytelling-empty";
  const at = page.indexOf(anchor);
  if (at === -1) {
    throw new Error("cannot find where the scroll ends — the template has moved");
  }

  const indent = page.slice(page.lastIndexOf("\n", at) + 1, at);
  return page.slice(0, at) + `${block}\n\n${indent}` + page.slice(at);
}
