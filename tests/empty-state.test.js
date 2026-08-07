/**
 * The "no frames yet" panel must disappear once there are frames.
 *
 * The zero-build template ships that panel in its markup with the `hidden`
 * attribute, and `main.js` un-hides it only when the sequence is empty. That is
 * the whole mechanism, and CSS can defeat it silently: the browser hides
 * `[hidden]` from its own stylesheet, which any author rule with an attribute
 * or class selector outranks. A page whose author wrote
 *
 *     [data-scrollytelling-empty] { display: grid }
 *
 * therefore renders a full screen of "generate a sequence to make this page
 * scroll" underneath a page that already scrolls — while `element.hidden` still
 * reports true, and nothing appears in the console.
 *
 * Found on the published demo page after a release had already shipped the
 * template that way. It was invisible in review because the screenshots taken
 * to check it were scoped to the canvas rather than to the page.
 *
 * Every file of every template is scanned rather than a list of filenames: the
 * bug is a property of the markup and its styles wherever they live, and a list
 * would quietly stop covering a template that moved its page.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { TEMPLATES, templateNames } from "../lib/template-manifest.mjs";

const SELECTOR = "data-scrollytelling-empty";
const TEXT_FILE = /\.(html|css|js|mjs|ts|tsx|vue|astro)$/;

/** Every text file under a template, with its path relative to that template. */
function filesOf(dir, root = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules") filesOf(full, root, out);
    } else if (TEXT_FILE.test(entry)) {
      out.push({ rel: full.slice(root.length + 1), text: readFileSync(full, "utf8") });
    }
  }
  return out;
}

/**
 * Every CSS rule in `text` whose selector mentions the empty panel.
 *
 * Comments are stripped first, and the selector is taken from the last line
 * before the brace. Both matter: a rule is preceded by whatever prose explains
 * it, and swallowing that prose into the "selector" makes it look like a
 * descendant rule — which is how the first version of this file passed against
 * the very bug it was written for.
 */
function rulesFor(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  return [...bare.matchAll(/([^{}]*\[data-scrollytelling-empty\][^{}]*)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].split("\n").pop().trim(),
    body: m[2],
  }));
}

describe("the empty-state panel", () => {
  let checked = 0;

  for (const name of templateNames()) {
    const root = fileURLToPath(new URL(`../templates/${TEMPLATES[name].dir}/`, import.meta.url));

    for (const { rel, text } of filesOf(root)) {
      if (!text.includes(SELECTOR)) continue;
      checked += 1;

      it(`cannot outrank its own hidden attribute in ${name}/${rel}`, () => {
        // A rule that gives the panel a display has to exclude the hidden
        // state — either by guarding its own selector, or by the file also
        // restoring display:none for [hidden] somewhere.
        const restoresNone = /\[hidden\][^{}]*\{[^}]*display\s*:\s*none/.test(text);

        for (const { selector, body } of rulesFor(text)) {
          // Descendant rules are governed by the ancestor's display, so only
          // rules that target the panel itself matter. Tested on the selector
          // rather than the whole rule: a comment or value containing the word
          // would otherwise disarm the check.
          if (/\]\s*[^,]*\s\S/.test(selector)) continue;
          if (!/(^|[;{\s])display\s*:/.test(body)) continue;

          assert.ok(
            selector.includes(":not([hidden])") || restoresNone,
            `this rule outranks the browser's [hidden] rule, so the panel shows on a page that has frames:\n  ${selector} {${body}}`,
          );
        }
      });

      it(`ships hidden in ${name}/${rel}`, () => {
        if (!/<[^>]*data-scrollytelling-empty/.test(text)) return;
        assert.match(
          text,
          /<[^>]*data-scrollytelling-empty[^>]*\shidden/,
          "the panel must ship hidden — it is un-hidden only when there is no sequence",
        );
      });
    }
  }

  it("found the panel at all", () => {
    // Without this, renaming the attribute would delete every rule above and
    // report a green suite that checks nothing.
    assert.ok(checked > 0, `no template mentions ${SELECTOR}`);
  });
});
