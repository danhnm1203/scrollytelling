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
 * The README is asserted twice over: that its links still resolve after the long
 * reference moved to docs/en/, and that what sits above its fold says the things
 * a stranger needs before deciding to scroll.
 *
 * The demo page exists now, so the fold's link to it and `homepage` are both
 * asserted. What is still carried as a todo is the gallery, which cannot be
 * asserted properly until a real entry is in it.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";

import { templateNames } from "../lib/template-manifest.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const plugin = JSON.parse(read("../.claude-plugin/plugin.json"));
const marketplace = JSON.parse(read("../.claude-plugin/marketplace.json"));
const skill = read("../skills/scrollytelling/SKILL.md");
const readme = read("../README.md");
const todos = read("../TODOS.md");

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

  it("points at a page a reader can open", () => {
    // npm shows this beside the install command, and it is the only link a
    // reader gets before deciding whether to install anything. It is asserted
    // to exist and to be absolute, never fetched — a test that reaches the
    // network is a test that fails on a plane.
    assert.ok(pkg.homepage, "package.json has no homepage");
    assert.doesNotThrow(() => new URL(pkg.homepage), `homepage is not an absolute url: ${pkg.homepage}`);
  });

  it("sends that reader to the demo rather than back to the repository", () => {
    // The repository is already linked from `repository`. A homepage pointing
    // at the same place wastes the one field that can show the output.
    assert.doesNotMatch(
      pkg.homepage,
      /github\.com\/danhnm1203\/scrollytelling\/?$/,
      "homepage duplicates the repository link instead of showing a page",
    );
  });

  it("still points at the repository it lives in", () => {
    assert.match(pkg.repository.url, /github\.com\/danhnm1203\/scrollytelling/);
  });

  it("sends a plugin reader to the same page as an npm reader", () => {
    // Two manifests, one product. They drifted silently before, when the
    // plugin's homepage pointed at the repository and npm's at the demo.
    assert.equal(
      new URL(plugin.homepage).href,
      new URL(pkg.homepage).href,
      "the plugin manifest and package.json disagree about where the page is",
    );
  });
});

describe("the README above the fold", () => {
  /**
   * What a stranger sees before scrolling. Twenty lines is the budget; it is
   * approximate by nature, so these rules are about what must appear within it,
   * never about how many lines the file has.
   *
   * The recording IS asserted now. It was the last thing missing here, and the
   * only thing prose cannot do for this project: the product's whole value is
   * what it looks like when scrolled, and for a long time the only image above
   * the fold was a CI badge.
   */
  const FOLD_LINES = 20;
  const fold = readme.split("\n").slice(0, FOLD_LINES).join("\n");

  it("shows the product before describing it", () => {
    // 393 lines of prose and one CI badge was the state this rule ends. A
    // stranger deciding whether to try a visual tool should not have to take
    // it on faith and click through.
    const images = fold.match(/<img\s[^>]*src="([^"]+)"/g) ?? [];
    assert.ok(images.length > 0, "the fold shows no image of the product");
  });

  it("serves the recording from this project, wherever it is addressed from", () => {
    // The rule is that the image cannot rot on somebody else's schedule, NOT
    // that it has to be a relative path. Those are different, and the first
    // version of this test confused them — it rejected any https src, which
    // would have blocked the one fix available if the relative path turns out
    // not to render on npmjs.com (docs/ is outside `files`, so the image is not
    // in the tarball and npm has to rewrite the path to the repository).
    //
    // Either form is fine. A third-party host is not.
    const src = /<img\s[^>]*src="([^"]+)"/.exec(fold)?.[1];
    assert.ok(src, "no image src above the fold");

    if (/^https?:/.test(src)) {
      assert.match(
        src,
        /^https:\/\/raw\.githubusercontent\.com\/danhnm1203\/scrollytelling\//,
        `${src} is hosted somewhere this project does not control`,
      );
      const path = src.replace(/^https:\/\/raw\.githubusercontent\.com\/danhnm1203\/scrollytelling\/[^/]+\//, "");
      assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} is not committed`);
      return;
    }

    assert.ok(
      existsSync(new URL(`../${src}`, import.meta.url)),
      `${src} is referenced but not committed`,
    );
  });

  it("keeps the recording small enough to load on a phone", () => {
    // A README image nobody waits for is a README image nobody sees. Five
    // megabytes is the ceiling the recipe was chosen against.
    const src = /<img\s[^>]*src="([^"]+)"/
      .exec(fold)[1]
      .replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, "");
    const bytes = statSync(new URL(`../${src}`, import.meta.url)).size;
    assert.ok(bytes < 5 * 1024 * 1024, `${src} is ${(bytes / 1024 / 1024).toFixed(2)}MB`);
  });

  it("describes the recording for a reader who cannot see it", () => {
    // The one place this project cannot fall back on the story outline.
    const alt = /<img\s[^>]*alt="([^"]*)"/.exec(fold)?.[1] ?? "";
    assert.ok(alt.length > 20, `alt text is "${alt}"`);
  });

  it("names every stack a reader might be on", () => {
    // The whole repositioning in one rule: a builder on Astro should not have
    // to scroll to learn the tool is for them.
    const named = frameworksNamedIn(fold);
    assert.deepEqual(
      FRAMEWORKS.filter((f) => !named.includes(f)),
      [],
      "the fold does not name every stack",
    );
  });

  it("offers a page to look at before asking for an install", () => {
    // The one thing prose cannot do for this project is show what it makes.
    // The link has to be above the fold, and it has to be the same place
    // package.json sends an npm reader.
    // Matched without the trailing slash: the two files are edited by different
    // hands and one of them will eventually drop it, which is not a defect.
    const bare = pkg.homepage.replace(/\/+$/, "");
    assert.ok(fold.includes(bare), `the fold does not link ${bare}`);
  });

  it("asks for one install command, not a choice between two", () => {
    // A reader who has not decided to use this yet should not have to choose
    // between npx and a global install first. Matched by package name, so the
    // `npm install` that installs a *scaffolded project's* dependencies later
    // in the file is not mistaken for a way to install this tool.
    const installs = fold.match(/^\s*(npx|npm i(nstall)? -g)\s+@danhnm1203\/scrollytelling/gm);
    assert.equal(installs?.length, 1, `expected one install command above the fold, got ${installs}`);
  });

  it("points a reader who built something at the form", () => {
    // The primary metric is submissions to this form. Nothing collects them if
    // the README never mentions it.
    assert.match(readme, /issues\/new\?[^)]*template=show-your-page\.yml/);
  });
});

describe("the README gallery", () => {
  /**
   * The gallery section. Throws when it is missing rather than letting the
   * rules below fail as though the wording had drifted — the same reason
   * `fieldsOf` and `deferredItems` throw.
   */
  function gallerySection() {
    const at = readme.indexOf("## Gallery");
    if (at === -1) throw new Error("the README has no ## Gallery section");
    return readme.slice(at);
  }

  it("exists", () => {
    assert.ok(gallerySection().length > 0);
  });

  // The two rules below check that a promise was made, and a promise exists
  // only in its words — so unlike the rest of this file they do match on
  // phrasing. They are narrow on purpose: the commitment is a specific one,
  // and a gallery that hedged it into something vaguer should fail.

  it("promises removal within a stated 24 hours", () => {
    // The same promise the issue form makes at the point consent is given. A
    // reader who meets the gallery first has to find it here too.
    assert.match(gallerySection(), /remov\w+[^.]*24 hours/i);
  });

  it("states that entries are credited to whoever built them", () => {
    // A gallery that does not distinguish the maintainer's own demos from
    // other people's pages takes credit by omission.
    assert.match(gallerySection(), /\b(built by|who built|credit\w*)\b/i);
  });

  it.todo("lists each entry with its author once entries exist");
});

describe("the deferred-work list", () => {
  // TODOS.md is read by the one stranger who got far enough to want to help,
  // and it is the only file in the repo that can be contradicted by shipping
  // something. A row that still defers work already done sends that person to
  // build what exists.
  const heading = "## Considered, not yet in the backlog";

  /**
   * The item named by each row of the deferred table — its first cell.
   *
   * Bounded to that one section: everything from its heading to the next `##`.
   * Without the bound this reads every table to the end of the file, and a
   * newcomer-tasks table added below would be checked as though it were
   * deferred work. Throws rather than returning a partial read, for the same
   * reason `fieldsOf` above does.
   */
  function deferredItems() {
    const start = todos.indexOf(heading);
    if (start === -1) throw new Error(`TODOS.md has no "${heading}" section`);
    const rest = todos.slice(start + heading.length);
    const end = rest.search(/\n## /);
    const rows = (end === -1 ? rest : rest.slice(0, end))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));

    const separator = rows.findIndex((line) => /^\|[\s:|-]+\|$/.test(line));
    if (separator === -1) throw new Error("the deferred table has no header separator");

    return rows
      .slice(separator + 1)
      .map((line) => line.split(/(?<!\\)\|/)[1]?.trim())
      .filter(Boolean);
  }

  it("is a table this test can read", () => {
    // If this fails, every rule below it was about to pass by checking nothing.
    assert.ok(deferredItems().length > 0, "found no deferred items to check");
  });

  it("defers no template stack that already ships", () => {
    // Unlike the marketing copy above — which is deliberately checked against a
    // hardcoded list, so that the claim and the code can disagree — this asks
    // whether one file contradicts another, and the manifest is the authority
    // on what ships.
    //
    // Narrowed to items that are about templates: `html` and `next` are
    // ordinary English, and "an HTML export of the story outline" is a
    // legitimate future entry that names no shipped stack.
    for (const item of deferredItems().filter((i) => /\b(template|stack)s?\b/i.test(i))) {
      for (const name of templateNames()) {
        assert.doesNotMatch(
          item,
          new RegExp(`\\b${name}\\b`, "i"),
          `TODOS defers "${item}", but templates/ ships ${name}`,
        );
      }
    }
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
