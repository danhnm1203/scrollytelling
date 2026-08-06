/**
 * What it means for a template to have built correctly.
 *
 * Not shipped: this directory is outside `files` in package.json, because a
 * generated project has no use for it. It exists so continuous integration and
 * the offline suite agree on what "the build is fine" means, rather than the
 * gate encoding one definition and the tests another.
 *
 * The definition is deliberately about emitted FILES, not exit codes. Three
 * templates now share one engine, so a single mistake in lib/ breaks all three
 * at once — and the way it breaks is by quietly not emitting something. The
 * build still exits 0. The page still loads. It just does not work.
 */

/**
 * How to turn a scaffolded project into a built one, per template.
 *
 * `install` and `build` are argument arrays, never strings: these run through
 * execFile with a project directory that came from a temp path, and this
 * repository does not do shell interpolation anywhere a path can reach.
 *
 * `outDir` is where the build leaves the files, relative to the project. It is
 * searched recursively rather than at a fixed depth — Next moves its output
 * between minor versions (CSS lives under static/chunks/ now, not static/css/),
 * and a gate that hardcodes the old layout reports a false failure on upgrade.
 */
export const BUILD_PLANS = {
  next: {
    install: ["npm", "install", "--no-audit", "--no-fund"],
    build: ["npm", "run", "build"],
    outDir: ".next",
    // Next fingerprints and relocates assets, so public/ is checked too: the
    // frames are served from there rather than copied into .next.
    alsoSearch: ["public"],
  },
  astro: {
    install: ["npm", "install", "--no-audit", "--no-fund"],
    build: ["npm", "run", "build"],
    outDir: "dist",
    alsoSearch: [],
  },
  html: {
    // The whole claim of this template is that there is nothing to install and
    // nothing to run. Giving it a build command would verify a different
    // product than the one that ships.
    install: null,
    build: null,
    outDir: ".",
    alsoSearch: [],
  },
};

/**
 * The files whose absence is silent.
 *
 * Each `find` runs over every emitted file as {path, text}. Markers are chosen
 * to survive minification, which rules out anything a bundler renames: local
 * variables, and — for the worker — `createImageBitmap` and `postMessage`,
 * since the engine names both itself.
 */
export const ARTIFACTS = [
  {
    name: "decoder worker",
    // `HTTP ` is a string literal inside the worker's fetch error, and nothing
    // else in lib/ or templates/ contains it. Minifiers rewrite the template
    // literal but keep the string, so this survives every bundler.
    //
    // This is the one that regressed. The engine built its worker URL through
    // an indirection, Vite traced nothing, and Astro shipped a page that could
    // never decode off the main thread.
    find: (f) => f.text.includes("HTTP ") && !f.path.endsWith(".css"),
  },
  {
    name: "engine stylesheet",
    // A class name, so it survives minification. Without it every beat renders
    // unstyled on top of the footage and the scrim measurement does nothing.
    find: (f) => f.text.includes("st-beat__scrim"),
  },
  {
    name: "reduced-motion rules",
    // Separate from the stylesheet because it is a separate promise. This block
    // is not a degraded animation, it is the entire page for a visitor who
    // asked not to be moved — the story outline stops being screen-reader-only
    // and becomes the content. A CSS step that drops an unused-looking media
    // query takes their page away, and nothing else in the build would notice.
    find: (f) => f.text.includes("prefers-reduced-motion"),
  },
  {
    name: "frame images",
    // The measurement is the part of this tool nobody else does. A build that
    // emits the engine but not the footage renders a black canvas forever.
    find: (f) => f.path.endsWith(".webp"),
  },
];

/**
 * Names every artifact the build failed to emit — all of them, not the first.
 *
 * One continuous integration run should say everything that is wrong with a
 * template. Stopping at the first turns one broken build into three round
 * trips, and the second failure is usually the informative one.
 *
 * @param {{path: string, text: string}[]} files
 * @returns {string[]} artifact names, in the order they are declared
 */
export function missingArtifacts(files) {
  return ARTIFACTS.filter((artifact) => !files.some((file) => artifact.find(file))).map(
    (artifact) => artifact.name,
  );
}
