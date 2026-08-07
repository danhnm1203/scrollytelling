/**
 * What a link preview says about a page.
 *
 * A crawler never runs the page — it reads the served markup and stops — so
 * whatever the head says at build time is the entire preview. Four templates
 * put head metadata in four idiomatic places: Next's `metadata` export, Nuxt's
 * `useHead`, Astro's markup, and a zero-build page that `frames` rewrites.
 *
 * Keeping those four mechanisms is right; each is what a reader of that stack
 * expects to find. Keeping four ANSWERS is not. Four copies of "what goes in
 * the card" is four chances to drift, and the drift is invisible: every page
 * renders, and the same story previews differently depending on which template
 * somebody picked. So the mechanism stays per-template and the values come from
 * here.
 *
 * Copied into every generated project by `scaffold`, the same way scroll-math
 * is, so a project's templates and this repository's tests read one file.
 *
 * Pure: no DOM, no filesystem, no framework. It is imported at build time by
 * three frameworks and by the CLI, which means it must not assume any of them.
 */

/**
 * The link-preview card: its filename, and how a page refers to it.
 *
 * 1200x630 is what every unfurler crops toward. JPEG, not webp: the frames are
 * webp because the page decodes them and the page is a browser, but a link
 * unfurler is somebody else's code and webp support across that set is
 * unverified. This is the one asset whose decoder is not ours to check.
 *
 * The name lives here rather than beside the code that writes it, because
 * three templates have to refer to a file they do not write. One constant they
 * all import cannot drift; three string literals can.
 */
export const CARD_FILE = "og.jpg";
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * @typedef {object} Card
 * @property {string | null} title        the page's own title
 * @property {string | null} description  one sentence about the page
 * @property {string} type                Open Graph object type
 * @property {string | null} url          the page's canonical address
 * @property {string | null} image        an absolute url, or null for no image
 * @property {"summary" | "summary_large_image"} twitterCard  which card to ask for
 */

/**
 * The card for a story, at a given address.
 *
 * `siteUrl` is where the finished page is served from, recorded by
 * `scrollytelling frames --site-url`. Without it there is no image and no url:
 * a relative `og:image` resolves against the CRAWLER's base rather than the
 * page's, so it silently fetches something else or nothing. No card is a
 * better outcome than a wrong one, and the words still cost nothing.
 *
 * Never throws. Three frameworks call this during their own build, and failing
 * a build over a link preview is the wrong trade — a page with no card is
 * worth more than no page.
 *
 * The card is always named relative to `siteUrl`, for every template, and
 * there is deliberately no per-template split here. `siteUrl` already carries
 * the base path — a GitHub Pages project site is `https://you.github.io/repo/`
 * — so the plain filename resolves under it whether the site is at an origin
 * root or a subdirectory. An absolute "/og.jpg" would be right only at a root
 * and silently wrong everywhere else: it resolves to `https://you.github.io/og.jpg`,
 * a url that serves nothing, and it looks correct in the markup.
 *
 * That is not the same question `framePath` answers. The runtime asks for
 * frames with no site url in hand, so it has to know where its own static files
 * are served from; a crawler reading this tag has the absolute answer already.
 *
 * HOW "no image" IS WRITTEN differs per template, and that difference is
 * decided here rather than four times.
 *
 * `image: null` means there is no image. A template that re-renders every build
 * — next, nuxt, astro — omits the tag entirely, because an empty `og:image` is
 * a relative reference that resolves to the page itself, so a strict crawler
 * can fetch the HTML and call that the preview.
 *
 * The zero-build page cannot do that. `frames` only ever FILLS tags the page
 * already has: it must not invent markup, and it must not delete a tag either,
 * because a later run with `--site-url` would have nothing left to fill and the
 * card would be gone for good. So there it stays as `content=""`.
 *
 * The four agree on what the card CONTAINS. They differ only in how a
 * mechanism that cannot remove a tag says "nothing", which is a property of the
 * mechanism and not a decision anybody gets to make differently.
 *
 * @param {{ story?: object, siteUrl?: string | null, cardPath?: string | null }} input
 * @returns {Card}
 */
export function cardFields({ story, siteUrl, cardPath = CARD_FILE } = {}) {
  const image = absolute(cardPath, siteUrl);

  return {
    title: story?.title ?? null,
    description: story?.description ?? null,
    type: "website",
    url: siteUrl ?? null,
    image,
    // Asking for the large card without an image renders an empty box, so the
    // shape follows the image rather than being declared once and hoped for.
    twitterCard: image ? "summary_large_image" : "summary",
  };
}

/** `cardPath` resolved against `siteUrl`, or null if either is unusable. */
function absolute(cardPath, siteUrl) {
  if (!cardPath || !siteUrl) return null;
  try {
    return new URL(cardPath, siteUrl).href;
  } catch {
    // An unparseable site url is a wrong card, not a reason to stop a build.
    return null;
  }
}
