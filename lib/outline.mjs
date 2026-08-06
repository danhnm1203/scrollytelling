/**
 * The story, as ordinary prose, for a page with no render step.
 *
 * A template with a framework builds this from the story data on every render,
 * so it cannot drift. A zero-build page has no render step, so `frames` writes
 * it — which keeps components/story.js the single source of the copy.
 *
 * Hand-writing it in the HTML was the alternative and is worse than it sounds.
 * The copy would live in two files with nothing tying them, and a conformance
 * check that merely looks for the marker class would PASS on drifted copy: the
 * suite certifying the broken state rather than catching it.
 *
 * Pure string work, no filesystem, so it tests without touching a project.
 */

/** The block `frames` rewrites. Everything outside it belongs to the author. */
export const OPEN_MARKER = "<!-- scrollytelling:outline -->";
export const CLOSE_MARKER = "<!-- /scrollytelling:outline -->";

/**
 * Not a security boundary — the story is authored by hand — but a correctness
 * one. An ampersand in a brand name should render, not break the document.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The outline for a story.
 *
 * `story-outline` is the class lib/scroll-engine.css hangs off — it is what
 * hides this for sighted visitors and what promotes it to the page under
 * reduced motion. Losing it costs both.
 *
 * @param {{ brand?: string, description?: string, sections?: readonly any[] }} story
 * @returns {string}
 */
export function renderOutline(story) {
  const beats = (story?.sections ?? [])
    .map(
      (beat) =>
        `      <section>\n` +
        `        <h2>${escapeHtml(beat.heading)}</h2>\n` +
        `        <p>${escapeHtml(beat.body)}</p>\n` +
        `      </section>`,
    )
    .join("\n");

  return [
    `    <main class="story-outline">`,
    `      <h1>${escapeHtml(story?.brand)}</h1>`,
    `      <p>${escapeHtml(story?.description)}</p>`,
    beats,
    `    </main>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Swaps the outline in a page for one built from this story.
 *
 * Everything outside the markers is left exactly as it was: once a project is
 * generated the page belongs to whoever generated it, and this command has no
 * business reformatting their markup.
 *
 * Throws rather than silently doing nothing when the markers are missing. A
 * quiet no-op would leave the outline stale forever, and the page would look
 * correct to everyone who is not using a screen reader.
 *
 * @param {string} html
 * @param {object} story
 * @returns {string}
 */
export function replaceOutline(html, story) {
  const open = html.indexOf(OPEN_MARKER);
  const close = html.indexOf(CLOSE_MARKER);

  if (open === -1 || close === -1 || close < open) {
    throw new Error(
      `could not find the outline markers in the page.\n` +
        `  Expected ${OPEN_MARKER} ... ${CLOSE_MARKER}\n` +
        "  The outline is what assistive technology reads and what the page becomes\n" +
        "  under reduced motion, so it is regenerated from your story rather than\n" +
        "  left to drift. Put the markers back, or re-scaffold the page.",
    );
  }

  return (
    html.slice(0, open + OPEN_MARKER.length) +
    "\n" +
    renderOutline(story) +
    "\n    " +
    html.slice(close)
  );
}
