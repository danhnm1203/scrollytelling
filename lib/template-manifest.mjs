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
 *   description: string,
 * }} Template
 */

/** @type {Record<string, Template>} */
export const TEMPLATES = {
  next: {
    dir: "next",
    libDir: "lib",
    publicDir: "public",
    framesPath: "components/frames.ts",
    storyPath: "components/story.ts",
    description: "Next.js App Router with Tailwind (the default)",
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
