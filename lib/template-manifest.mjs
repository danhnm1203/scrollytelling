/**
 * Where each template keeps its things.
 *
 * One data structure, two consumers: `scripts/scaffold.mjs` places files by it,
 * and `scripts/frames.mjs` resolves its output paths by it. That is the same
 * shape `installableFiles()` already has, for the same reason — readers of one
 * list cannot disagree about what a template is.
 *
 * Pure data, no filesystem, so a third consumer that must stay clean can import
 * it. `lib/cli-args.mjs` deliberately does NOT: it declares `--template` as an
 * ordinary flag and lets `scripts/scaffold.mjs` do the naming, which keeps its
 * documented "no filesystem, no exit, no console" contract obviously true
 * rather than true-by-inspection.
 *
 * `libDir` is deliberately ONE field rather than a path per runtime file. The
 * engine finds its worker with `new URL("./decoder.worker.js", import.meta.url)`,
 * which resolves relative to the module holding the literal — so the engine and
 * the worker have to be siblings. Independent per-file paths could put them
 * apart, and the failure is a worker that 404s. One field cannot be set in a
 * way that separates them.
 *
 * `publicDir` covers both the encoded frames and the staging directory they are
 * renamed from. A rename is atomic only within one filesystem, so those two
 * must share a root.
 */

/**
 * @typedef {{
 *   dir: string,
 *   libDir: string,
 *   publicDir: string,
 *   framesPath: string,
 *   storyPath: string,
 *   outlinePath?: string,
 *   description: string,
 * }} Template
 */

/** @type {Record<string, Template>} */
export const TEMPLATES = {
  next: {
    dir: "next",
    libDir: "lib",
    publicDir: "public",
    framesPath: "components/frames.js",
    storyPath: "components/story.js",
    description: "Next.js App Router with Tailwind (the default)",
  },
  astro: {
    dir: "astro",
    libDir: "src/lib",
    publicDir: "public",
    framesPath: "src/components/frames.js",
    storyPath: "src/components/story.js",
    // No outlinePath: Astro renders at build time, so index.astro builds the
    // story outline itself from the same story.js. One less moving part than
    // the no-build template, which has nothing that could.
    description: "Astro, zero JavaScript shipped except the engine",
  },
  nuxt: {
    dir: "nuxt",
    libDir: "app/lib",
    publicDir: "public",
    // Nuxt scans app/components/ and registers what it finds as components.
    // These two are data, not components, so nuxt.config.ts restricts that scan
    // to .vue files — which is what lets them keep the same name and the same
    // place they have on every other template.
    framesPath: "app/components/frames.js",
    storyPath: "app/components/story.js",
    // No outlinePath: Nuxt renders on the server, so app.vue builds the outline
    // from story.js itself, the same way index.astro does.
    description: "Nuxt 4 with Vue single-file components",
  },
  html: {
    dir: "html",
    libDir: "lib",
    // Served from the project root, so the frames sit beside index.html rather
    // than under a directory served at the site root. That is why the contract
    // generated for this template resolves frame urls against the page instead
    // of against "/" — see framePathSource in scripts/frames.mjs. It is what
    // lets the built directory be dropped under a base path, a GitHub Pages
    // project site among them, with nothing to configure.
    publicDir: ".",
    framesPath: "components/frames.js",
    storyPath: "components/story.js",
    // The page has no render step, so `frames` writes the story outline into
    // it. Templates that render leave this unset and build it themselves.
    outlinePath: "index.html",
    // Named for what it needs rather than what it is: the point of this one is
    // that there is nothing to install and nothing to compile.
    description: "Plain HTML and JavaScript — no build step, no dependencies",
  },
};

/** The template a project is assumed to be when nothing says otherwise. */
export const DEFAULT_TEMPLATE = "next";

/** Every template name, for `--template` with no value and for error messages. */
export function templateNames() {
  return Object.keys(TEMPLATES);
}

/**
 * The template for a name, or a thrown error naming the valid ones.
 *
 * The flag selects a key and the manifest supplies the directory, so a name
 * never reaches a path join. Traversal is not something to sanitise here — it
 * is something that cannot be expressed.
 *
 * @param {string | undefined} name
 * @returns {Template}
 */
export function resolveTemplate(name) {
  const template = typeof name === "string" ? TEMPLATES[name] : undefined;
  if (!template) {
    throw new Error(
      `unknown template ${JSON.stringify(name ?? null)} — expected one of: ${templateNames().join(", ")}`,
    );
  }
  return template;
}
