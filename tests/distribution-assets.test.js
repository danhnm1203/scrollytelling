/**
 * The copy that describes this tool to a stranger, asserted from the outside.
 *
 * Four surfaces claim what the tool is before anyone reads a line of code: the
 * npm package, the plugin manifest, the marketplace listing and the skill. They
 * fail as one — a stranger who meets two of them meets two different products
 * unless they agree — so they are asserted against one rule in one place.
 *
 * The CLI's `--help` says the same thing and is deliberately NOT asserted here:
 * the CLI gets subprocess tests, so that assertion lives in `cli.test.js` where
 * the binary is actually run.
 *
 * The rules worth testing are the ones whose failure is quiet. A description
 * that drifts back to naming one framework still installs fine; a keyword list
 * that loses `landing-page` still publishes. Nothing throws. The only symptom is
 * a stranger who reads the front page, wrongly concludes the tool is not for
 * them, and leaves — which is invisible from inside the repo.
 *
 * These assert criteria, never wording. "The description does not single out one
 * framework" is what a reader experiences; "the description is 92 characters" is
 * a detail that dies on the next edit.
 *
 * The issue forms are asserted here too, for a different reason: they are the
 * only measurement this project has. npm downloads carry no referrer, so the
 * question "where did this person come from" is answerable only if the forms
 * keep asking it.
 *
 * The README is asserted for its links only. What sits above its fold is a later
 * slice; that it does not point at pages which have moved is this one.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const plugin = JSON.parse(read("../.claude-plugin/plugin.json"));
const marketplace = JSON.parse(read("../.claude-plugin/marketplace.json"));
const skill = read("../skills/scrollytelling/SKILL.md");
const readme = read("../README.md");

/** Every markdown link in `text`, as `{ label, target }`. */
function linksIn(text) {
  return [...text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => ({
    label: m[1],
    target: m[2],
  }));
}

/**
 * GitHub's heading slug: lowercased, punctuation dropped, spaces hyphenated.
 * Close enough for the headings this repo writes, and the failure mode is a
 * test that complains about a link that works — not one that misses a link
 * that does not.
 */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Every anchor a reader can jump to within `markdown`. Fenced blocks are cut
 * first: this repo's shell samples are full of `# comments`, and counting those
 * as headings would let a link resolve against a bash comment.
 */
function anchorsIn(markdown) {
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "");
  return new Set([...prose.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])));
}

/** A link into this repository, rather than out to the web or within a page. */
const isRelative = (target) => !/^(https?:|mailto:|#)/.test(target);

/** The pages the README sent its longer sections to. */
const docsEn = new URL("../docs/en/", import.meta.url);
const relocatedPages = readdirSync(docsEn).filter((f) => f.endsWith(".md"));

/**
 * Every issue form, read from the directory rather than named one by one. The
 * attribution rule below applies to *every* form, so a form added later has to
 * arrive already carrying it — a list of filenames here would let the next one
 * escape the only measurement this project has.
 */
const formsDir = new URL("../.github/ISSUE_TEMPLATE/", import.meta.url);
const forms = Object.fromEntries(
  readdirSync(formsDir)
    .filter((f) => /\.ya?ml$/.test(f) && f !== "config.yml")
    .map((f) => [`the ${f.replace(/\.ya?ml$/, "")} form`, readFileSync(new URL(f, formsDir), "utf8")]),
);

/**
 * The fields of an issue form, and whether each declares itself required.
 *
 * These files are YAML and this repo has no YAML parser — its two dependencies
 * exist for the frame pipeline and nothing else. Rather than take one on, or
 * invent a parser, this reads the only structure the assertions below turn on:
 * the blocks under `body:`, split on the `- type:` that starts each one.
 *
 * The narrowness is the risk: a form written with different indentation is
 * valid YAML that this cannot read. So it throws rather than returning nothing,
 * because a scanner that quietly finds no fields makes every assertion below
 * pass for the wrong reason.
 */
function fieldsOf(form, what = "an issue form") {
  const at = form.indexOf("\nbody:");
  if (at === -1) throw new Error(`${what} has no top-level body:`);
  const fields = form
    .slice(at)
    .split(/\n {2}- type:/)
    .slice(1)
    .map((block) => ({
      type: block.slice(0, block.indexOf("\n")).trim(),
      id: (block.match(/\n {4}id:\s*(\S+)/) ?? [])[1],
      text: block,
      // Field-level `validations.required`, or a checkbox option that declares
      // itself required — different YAML shapes, one question: must this be
      // answered before the issue can be opened?
      required: /required:\s*true/.test(block),
    }));
  if (fields.length === 0) throw new Error(`${what} declares no fields this scanner can read`);
  return fields;
}

/** A field by its stable id — never by the prose around it, which is edited. */
function fieldOf(form, id, what = "an issue form") {
  return fieldsOf(form, what).find((f) => f.id === id);
}

/** The one field every form exists to carry. */
function attributionFieldOf(form, what) {
  return fieldOf(form, "found-where", what);
}

/**
 * The four stacks `templates/` ships. Named here rather than imported from the
 * manifest on purpose: this file asserts what the *marketing copy* claims, and
 * importing the manifest would make the claim agree with the code by
 * construction instead of by check.
 */
const FRAMEWORKS = ["next", "nuxt", "astro", "html"];

/**
 * Every framework name that appears in `text`, as a whole word. The optional
 * `js` suffix is not decoration: prose writes "Next.js" and npm keywords write
 * "nextjs", and both have to count as naming the same stack.
 */
function frameworksNamedIn(text) {
  return FRAMEWORKS.filter((f) => new RegExp(`\\b${f}(\\.?js)?\\b`, "i").test(text));
}

/**
 * Four stacks have shipped. Copy that names exactly one of them tells a builder
 * on the other three that the tool is not for them — the most expensive false
 * negative this repo can produce. Naming all four is fine; naming none is fine;
 * naming some is the failure.
 */
function assertNamesAllFrameworksOrNone(what, text) {
  const named = frameworksNamedIn(text);
  assert.ok(
    named.length === 0 || named.length === FRAMEWORKS.length,
    `${what} names ${named.join(", ") || "no framework"} — name all four or none`,
  );
}

describe("the copy every shelf shows", () => {
  const surfaces = [
    ["the npm description", pkg.description],
    ["the npm keywords", pkg.keywords.join(" ")],
    ["the plugin manifest", plugin.description],
    ["the marketplace listing", marketplace.description],
    ["the marketplace plugin entry", marketplace.plugins[0].description],
    ["the skill description", skill],
  ];

  for (const [what, text] of surfaces) {
    it(`${what} names every framework, or none`, () => {
      assertNamesAllFrameworksOrNone(what, text);
    });
  }
});

describe("the npm package metadata", () => {
  it("describes an outcome rather than a technique", () => {
    // The positioning rests on the input being a video the reader already has.
    assert.match(pkg.description, /\bvideo\b/i);
  });

  it("is findable by the problem, not only by the technique", () => {
    for (const keyword of ["landing-page", "hero-section", "scrollytelling", "image-sequence"]) {
      assert.ok(pkg.keywords.includes(keyword), `keywords are missing ${keyword}`);
    }
  });

  it("keeps `video`, which the whole positioning stands on", () => {
    assert.ok(pkg.keywords.includes("video"));
  });

  it("names the stacks that are easiest to miss", () => {
    // The all-or-none rule above is satisfied by naming no framework at all, so
    // it cannot by itself keep `nuxt` and `astro` on the shelf. These two are
    // the ones a reader assumes are absent, so they are required by name.
    for (const keyword of ["nuxt", "astro"]) {
      assert.ok(pkg.keywords.includes(keyword), `keywords are missing ${keyword}`);
    }
  });

  it("still points at the repository it lives in", () => {
    // Cheap, but this is the only link npm shows before a homepage exists.
    assert.match(pkg.repository.url, /github\.com\/danhnm1203\/scrollytelling/);
  });
});

describe("the README's links", () => {
  // Sections that outgrew the README now live in docs/en/. Moving prose is
  // safe; leaving a link behind that points at where it used to be is the one
  // way that move fails, and it fails silently — a 404 only the reader sees.
  const targets = linksIn(readme).map((l) => l.target);

  /**
   * Every link to check, flattened across the README and the pages it sent
   * prose to. One list rather than one test per page: a page that happens to
   * carry no links would otherwise report green having asserted nothing.
   */
  const checks = [
    { from: "README.md", text: readme, base: new URL("../", import.meta.url) },
    ...relocatedPages.map((file) => ({
      from: `docs/en/${file}`,
      text: read(`../docs/en/${file}`),
      base: docsEn,
    })),
  ].flatMap(({ from, text, base }) =>
    linksIn(text)
      .map((l) => l.target)
      .filter(isRelative)
      .map((target) => ({ from, target, base })),
  );

  it("all resolve to a file, and to a heading when they name one", () => {
    assert.ok(checks.length > 0, "expected links to check — found none at all");
    for (const { from, target, base } of checks) {
      const [path, anchor] = target.split("#");
      assert.ok(existsSync(new URL(path, base)), `${from} links to missing ${path}`);
      if (anchor) {
        const page = readFileSync(new URL(path, base), "utf8");
        assert.ok(anchorsIn(page).has(anchor), `${from}: ${path} has no heading "#${anchor}"`);
      }
    }
  });

  it("point at headings this README still has", () => {
    // The contents list is the first casualty of moving a section out.
    const own = anchorsIn(readme);
    const internal = targets.filter((t) => t.startsWith("#"));
    assert.ok(internal.length > 0, "expected a contents list linking within the README");
    for (const target of internal) {
      assert.ok(own.has(target.slice(1)), `README links to its own missing "${target}"`);
    }
  });

  it("reach every page that was moved out of it", () => {
    // A relocated page nobody links to is a deleted page with extra steps.
    assert.ok(relocatedPages.length > 0, "expected relocated pages under docs/en/");
    for (const file of relocatedPages) {
      assert.ok(
        targets.some((t) => t.startsWith(`docs/en/${file}`)),
        `docs/en/${file} is not linked from the README`,
      );
    }
  });
});

describe("the issue forms", () => {
  const showcase = forms["the show-your-page form"];
  const consentOf = (form) => fieldOf(form, "gallery-consent", "the show-your-page form");

  it("there are some", () => {
    // Guards the directory read: an empty ISSUE_TEMPLATE would otherwise make
    // every rule below vacuously true by having nothing to apply to.
    assert.ok(Object.keys(forms).length >= 2, "expected at least the showcase and bug forms");
  });

  for (const [what, form] of Object.entries(forms)) {
    it(`${what} declares the keys GitHub needs to render it`, () => {
      // A form GitHub cannot render is a form nobody fills in, and the failure
      // is silent: the template simply does not appear in the chooser. These
      // are anchored to the start of a line because every field carries its own
      // nested `description:`, which would otherwise satisfy the check.
      for (const key of ["name", "description", "body"]) {
        assert.match(form, new RegExp(`^${key}:`, "m"), `${what} is missing top-level ${key}:`);
      }
    });

    it(`${what} asks where the person found this project`, () => {
      assert.ok(attributionFieldOf(form, what), `${what} does not ask`);
    });

    it(`${what} asks it in words, not just as a field id`, () => {
      assert.match(attributionFieldOf(form, what).text, /where did you (find|hear)/i);
    });

    it(`${what} makes that answer required`, () => {
      // npm downloads carry no referrer and GitHub referrers describe repo
      // views rather than installs, so this field is the whole of channel
      // attribution. Optional, it would answer at a rate nobody can estimate,
      // layering a second unknown on an already small sample.
      assert.ok(attributionFieldOf(form, what).required, `${what} asks but does not require`);
    });
  }

  it("the show-your-page form collects the page itself", () => {
    const url = fieldOf(showcase, "page-url", "the show-your-page form");
    assert.ok(url, "no field asks for the page URL");
    assert.ok(url.required, "a showcase without the page is not a showcase");
  });

  it("the show-your-page form asks for gallery permission separately", () => {
    // Submitting a page and licensing it for promotion are two decisions.
    // Bundling them would take the second silently.
    const consent = consentOf(showcase);
    assert.ok(consent, "no field asks for gallery permission");
    assert.equal(consent.type, "checkboxes", "permission must be its own control");
  });

  it("the show-your-page form does not force that permission", () => {
    // Consent that is a condition of submitting is not consent.
    assert.equal(consentOf(showcase).required, false, "permission must be refusable");
  });

  it("the show-your-page form promises removal where permission is given", () => {
    // Says nothing about the README's own gallery section, which is a later
    // slice. This is the promise made at the moment consent is asked for.
    assert.match(consentOf(showcase).text, /remove/i);
  });
});
