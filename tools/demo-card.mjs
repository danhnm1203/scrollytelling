/**
 * Whether the built demo is safe to publish, as far as its link preview goes.
 *
 * The demo is where every link in the README, the package metadata and the
 * repository description points, so its preview is a marketing asset rather
 * than a nicety. The failure this catches is not a crash: `frames` exits 0
 * having written a page whose card tags are empty, the site deploys, and the
 * only symptom is that every share of it is a bare url. Nothing reports it,
 * and nobody can see it from inside the page.
 *
 * That is the same class of hole the workflow's existing no-frames guard fills:
 * a page that renders fine and is not the thing anybody meant to publish.
 *
 * Not shipped: `tools/` is outside `files` in package.json, because a generated
 * project has no use for it.
 *
 * Pure — no fs, no process.exit — so it tests without building a site. The
 * runner stats the file and reads the page; this decides what that means.
 */

import { readMeta } from "../lib/outline.mjs";

/**
 * The tags a card cannot render without.
 *
 * twitter:image is here because lib/outline.mjs writes it. Anything the build
 * writes is something the build can get wrong, and a guard that checks a subset
 * of what is written is a guard with a hole in exactly the shape of what it
 * skipped. It was missed on the first pass and found in review.
 */
const REQUIRED = [
  "og:title",
  "og:description",
  "og:url",
  "og:image",
  "twitter:card",
  "twitter:image",
];

/** The tags whose value has to be an absolute url under the site being built. */
const MUST_BE_UNDER_SITE = ["og:url", "og:image", "twitter:image"];

/**
 * Whether a url the page carries points inside the site being built.
 *
 * Compared as urls rather than as strings. The value on the page has been
 * through `new URL()` inside the CLI — lowercased scheme and host, trailing
 * slash added — while the argument this build was given has not, so
 * `startsWith` on the raw argument fails a page that is perfectly correct.
 * `--site-url HTTPS://Example.com/repo` was enough to stop a good deploy.
 *
 * Comparing pathnames with the base's trailing slash also stops a sibling from
 * counting: /scrollytelling-other/ is not under /scrollytelling/, though one is
 * a string prefix of the other.
 */
function isUnderSite(value, siteUrl) {
  let base;
  let target;
  try {
    base = new URL(siteUrl);
    target = new URL(value);
  } catch {
    return false;
  }
  if (base.origin !== target.origin) return false;
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  return target.pathname.startsWith(basePath);
}

/**
 * The size of a card file, or null when there is no usable card.
 *
 * A directory named og.jpg passes `existsSync` and reports a size, and `frames`
 * treats a card it could not write as a warning rather than a failure — so
 * without the isFile question the build sails past the exact case this guard
 * exists for. That was a real bug, found by making og.jpg a directory and
 * watching the build succeed. It lives here, tested, rather than inline in the
 * runner, because being inline and untested is how it got through.
 *
 * @param {{ isFile: () => boolean, size: number } | null | undefined} stat
 * @returns {number | null}
 */
export function cardBytesOf(stat) {
  if (!stat || !stat.isFile()) return null;
  return stat.size;
}

/**
 * Everything wrong with the card on this page, as sentences a build log can
 * print.
 *
 * Every problem at once rather than the first: each re-run costs a full encode,
 * and the encode is the slow part of this build.
 *
 * @param {string} html                 the built page
 * @param {object} context
 * @param {string | null} context.siteUrl   the address the build claimed, or null
 * @param {number | null} [context.cardBytes] size of the card file, null if absent
 * @returns {string[]} empty when there is nothing wrong
 */
export function cardProblems(html, { siteUrl, cardBytes = null } = {}) {
  // A build that never claimed a site url is not promising a card, so there is
  // nothing to hold it to. Guarding it anyway would make `npm run sample` fail
  // for everyone who only wants to look at the page.
  if (!siteUrl) return [];

  const problems = [];

  for (const key of REQUIRED) {
    const value = readMeta(html, key);
    if (value === null) {
      problems.push(`${key} is missing from the page`);
    } else if (value === "") {
      problems.push(`${key} is empty — the build wrote no value into it`);
    }
  }

  for (const key of MUST_BE_UNDER_SITE) {
    const value = readMeta(html, key);
    if (!value) continue; // already reported above

    if (!/^https?:\/\//.test(value)) {
      problems.push(
        `${key} is "${value}", which is not absolute — a crawler resolves it ` +
          "against its own base and fetches something else",
      );
    } else if (!isUnderSite(value, siteUrl)) {
      problems.push(
        `${key} is "${value}", which is not under ${siteUrl} — live markup ` +
          "pointing somewhere else is worse than an empty tag",
      );
    }
  }

  if (cardBytes === null) {
    problems.push("the card image was not written, so og:image points at nothing");
  } else if (cardBytes === 0) {
    problems.push("the card image is zero bytes, which unfurls as nothing");
  }

  return problems;
}
