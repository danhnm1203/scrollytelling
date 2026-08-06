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
 * @typedef {object} BuildPlan
 * @property {string[] | null} install argv for the install, or null if there is nothing to install
 * @property {string[] | null} build   argv for the build, or null if there is nothing to build
 * @property {string} outDir           where the build leaves files, relative to the project
 * @property {string[]} alsoSearch     other project-relative directories that serve the page
 */

/**
 * @typedef {object} EmittedFile
 * @property {string} path relative to the directory it was collected from
 * @property {string} text the contents, or "" for anything not worth reading as text
 */

/**
 * How to turn a scaffolded project into a built one, per template.
 *
 * @type {Record<string, BuildPlan>}
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
  nuxt: {
    install: ["npm", "install", "--no-audit", "--no-fund"],
    build: ["npm", "run", "build"],
    // Nuxt splits its output: .output/public/ is what a browser is served and
    // .output/server/ is the node server that serves it. One recursive walk of
    // .output covers both, so there is nothing extra to search — the worker,
    // the stylesheet and the frames all land under public/.
    outDir: ".output",
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
 * Whether a path is something a browser is actually served.
 *
 * A build directory holds more than the build: sourcemaps and cached module
 * records embed the original source verbatim, so a content match against them
 * says the code exists, not that it shipped. That is precisely the false pass
 * this gate exists to prevent, and Next's .next/ is full of both.
 */
const isServedScript = (path) =>
  (path.endsWith(".js") || path.endsWith(".mjs")) && !path.split("/").includes("cache");

const isStylesheet = (path) => path.endsWith(".css") || path.endsWith(".html");

/**
 * The files whose absence is silent.
 *
 * Each `find` runs over every EmittedFile. Markers are chosen to survive
 * minification, which rules out anything a bundler renames: local variables,
 * and — for the worker — `createImageBitmap` and `postMessage`, since the
 * engine names both itself.
 *
 * Each also checks WHERE it matched, not only what. Content alone is satisfied
 * by a sourcemap, a build cache, or the engine's own feature detection, none of
 * which mean the browser received anything.
 */
export const ARTIFACTS = [
  {
    name: "decoder worker",
    // Three markers, all of which have to be in the same served file, because
    // no one of them identifies a worker on its own:
    //
    //   "HTTP "            unique to the worker across lib/ and templates/ — but
    //                      NOT across a build directory. Next's own framework
    //                      code contains it, so alone it passes on next whether
    //                      or not a worker was emitted.
    //   createImageBitmap  the engine also names it, in a feature test.
    //   postMessage        the engine also calls it, on the worker.
    //
    // Together they are the worker's body and nothing else. All three survive
    // minification: a string literal and two names a bundler may not rename.
    //
    // This is the artifact that regressed. The engine built its worker URL
    // through an indirection, Vite traced nothing, and Astro shipped a page
    // that could never decode off the main thread. Turbopack traced it anyway,
    // which is why next stayed green and the bug reached a browser.
    find: (f) =>
      isServedScript(f.path) &&
      f.text.includes("HTTP ") &&
      f.text.includes("createImageBitmap") &&
      f.text.includes("postMessage"),
  },
  {
    name: "engine stylesheet",
    // A class name, so it survives minification. Without it every beat renders
    // unstyled on top of the footage and the scrim measurement does nothing.
    find: (f) => isStylesheet(f.path) && f.text.includes("st-beat__scrim"),
  },
  {
    name: "reduced-motion rules",
    // Separate from the stylesheet because it is a separate promise. This block
    // is not a degraded animation, it is the entire page for a visitor who
    // asked not to be moved — the story outline stops being screen-reader-only
    // and becomes the content. A CSS step that drops an unused-looking media
    // query takes their page away, and nothing else in the build would notice.
    //
    // Stylesheets only, and that restriction is load-bearing rather than tidy.
    // The engine calls matchMedia("(prefers-reduced-motion: reduce)") so it can
    // respond to the setting being toggled with the page open, and that literal
    // sits in the JS chunk of every build. Matching text anywhere would make
    // this artifact unfailable — the rules could be dropped from the CSS
    // entirely and the engine would satisfy the check on its own.
    find: (f) => isStylesheet(f.path) && f.text.includes("prefers-reduced-motion"),
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
 * @param {EmittedFile[]} files
 * @returns {string[]} artifact names, in the order they are declared
 */
export function missingArtifacts(files) {
  return ARTIFACTS.filter((artifact) => !files.some((file) => artifact.find(file))).map(
    (artifact) => artifact.name,
  );
}
