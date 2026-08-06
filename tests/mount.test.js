/**
 * The two parts of mounting that can be checked without a browser.
 *
 * Most of the engine shell cannot be: it owns a canvas, a worker and an
 * animation frame, and proving those work is what the per-template build gate
 * is for. But two of its rules are pure bookkeeping over a container, and both
 * are rules whose failure is silent:
 *
 *   adopting a server-rendered poster   losing it costs the first paint, the
 *                                       link preview, and the no-JS page
 *   refusing a second live mount        two workers, two loops, and twice the
 *                                       pinned decode budget
 *
 * The DOM here is hand-built rather than jsdom, the same way measure.test.js
 * hand-builds pixel buffers: the engine only touches a handful of methods, and
 * a stub that implements exactly those is easier to reason about than a browser
 * emulation that implements neither Worker nor createImageBitmap anyway.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mount } from "../lib/scroll-engine.mjs";

/** The smallest element the engine can work against. */
function el(tag = "div", attrs = {}) {
  const node = {}; 
  Object.assign(node, {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    style: {
      setProperty(k, v) {
        node.props[k] = v;
      },
      removeProperty(k) {
        delete node.props[k];
      },
    },
    className: "",
    textContent: "",
    // Custom properties land here, so a test can check the engine actually
    // wrote the measured scrim strength rather than just creating the element.
    props: {},
    attrs: { ...attrs },
    setAttribute(k, v) {
      this.attrs[k] = v;
      // A real DOM keeps these in step: setAttribute("data-foo-bar") is
      // readable as dataset.fooBar. The engine writes the attribute and the
      // tests read the dataset, so a stub that skipped this would fail for a
      // reason that has nothing to do with the engine.
      if (k.startsWith("data-")) {
        const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = v;
      }
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      return child;
    },
    querySelector(selector) {
      // Attribute selectors only, which is all the engine uses. Matching on
      // attrs rather than dataset mirrors the browser: querySelector sees
      // attributes, and dataset is the derived view of them.
      const want = selector.replace(/[[\]]/g, "");
      const hit = (n) => n.attrs[want] !== undefined;
      const walk = (n) => {
        for (const c of n.children) {
          if (hit(c)) return c;
          const deeper = walk(c);
          if (deeper) return deeper;
        }
        return null;
      };
      return walk(this);
    },
    addEventListener() {},
    removeEventListener() {},
  });
  return node;
}

/** Enough of a window for mount() to decide it has nothing to do. */
function environment({ reduced = true } = {}) {
  return {
    matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    document: { createElement: (tag) => el(tag), documentElement: { style: { setProperty() {} } } },
  };
}

/**
 * Enough of a browser for mount() to actually start scrubbing.
 *
 * Only what the engine touches: a canvas that yields a context, an Image that
 * never resolves, and an animation frame that is never run. Nothing here paints
 * — the point is to reach the code that sets up the canvas, which is where a
 * visual regression hid once already.
 */
function scrubbingEnvironment() {
  const env = environment({ reduced: false });
  env.document.createElement = (tag) => {
    const node = el(tag);
    if (tag === "canvas") {
      node.getContext = () => ({
        setTransform() {},
        fillRect() {},
        drawImage() {},
        set fillStyle(_) {},
      });
    }
    return node;
  };
  env.document.body = { scrollHeight: 5000 };
  env.scrollY = 0;
  env.scrollTo = () => {};
  // Resolves immediately so a test can drive the load through to ready.
  // `decodes` counts them, which is how "did it actually fetch anything"
  // becomes checkable.
  env.decodes = [];
  env.Image = class {
    set src(v) {
      env.decodes.push(v);
    }
    decode() {
      return Promise.resolve();
    }
  };
  // Captured rather than dropped, so a test can drive a paint by hand. Without
  // running one, anything the draw loop does is invisible to these tests —
  // which is how a regression in it slipped through once.
  env.frames = [];
  env.requestAnimationFrame = (fn) => env.frames.push(fn);
  env.cancelAnimationFrame = () => {};
  env.paint = (t = 16) => {
    const queued = env.frames.splice(0);
    for (const fn of queued) fn(t);
  };
  return env;
}

// One edge colour per frame, as `frames` always generates. An empty array
// here would be a fixture that no real contract can produce.
const EDGES = [
  [0, 0, 0],
  [80, 80, 80],
  [160, 160, 160],
  [255, 255, 255],
];

const SEQUENCES = [
  { id: "landscape", width: 1280, height: 720, totalFrames: 4, edgeColors: EDGES, lumaGrid: [] },
];
const STORY = {
  brand: "ORBIT",
  title: "t",
  description: "d",
  sections: [
    { at: 0, align: "left", heading: "First", body: "one" },
    { at: 0.5, align: "center", anchor: "bottom", heading: "Second", body: "two" },
    { at: 1, align: "right", heading: "Third", body: "three" },
  ],
};

/** Every element in the tree, so assertions can look for a class anywhere. */
function flatten(node) {
  return node.children.flatMap((c) => [c, ...flatten(c)]);
}
const byClass = (root, cls) => flatten(root).filter((n) => (n.className ?? "").split(" ").includes(cls));
const OPTS = () => ({
  sequences: SEQUENCES,
  story: STORY,
  framePath: (id, i) => `/frames/${id}_${i}.webp`,
  env: environment(),
});

describe("mount — poster adoption", () => {
  it("adopts a poster the adapter server-rendered", () => {
    // The whole point. An imperative mount that emptied the container would
    // throw away the image the server already painted, which is what a link
    // preview shows and what a visitor without JavaScript gets.
    const container = el();
    const poster = el("img");
    poster.setAttribute("data-scrollytelling-poster", "");
    container.appendChild(poster);

    const dispose = mount(container, OPTS());

    assert.ok(container.children.includes(poster), "the server-rendered poster must survive");
    dispose();
  });

  it("does not re-request an adopted poster", () => {
    // Replacing it with an identical <img> costs a second network request and
    // a visible flash between the two.
    const container = el();
    const poster = el("img");
    poster.setAttribute("data-scrollytelling-poster", "");
    poster.setAttribute("src", "/frames/landscape_0.webp");
    container.appendChild(poster);

    const dispose = mount(container, OPTS());

    const posters = container.children.filter((c) => "scrollytellingPoster" in c.dataset);
    assert.equal(posters.length, 1, "expected exactly one poster, not a replacement");
    assert.equal(posters[0], poster);
    dispose();
  });

  it("creates a poster when the adapter did not render one", () => {
    // A plain-HTML page with no build step may have nothing in the container.
    // The page still needs something to paint before the sequence decodes.
    const container = el();

    const dispose = mount(container, OPTS());

    const poster = container.children.find((c) => "scrollytellingPoster" in c.dataset);
    assert.ok(poster, "expected a poster to be created");
    assert.equal(poster.getAttribute("src"), "/frames/landscape_0.webp");
    dispose();
  });
});

describe("mount — the double-mount guard", () => {
  it("disposes the previous mount rather than running two", () => {
    // Two live mounts means two workers, two scroll listeners, two animation
    // loops and twice the pinned decode budget — which is already sized to sit
    // just under what a phone tolerates. Nothing errors; the tab dies.
    const container = el();
    const warnings = [];
    const env = environment();
    env.console = { warn: (m) => warnings.push(m), info() {} };

    const first = mount(container, { ...OPTS(), env });
    const second = mount(container, { ...OPTS(), env });

    assert.equal(warnings.length, 1, "a silent second mount is the bug");
    assert.match(warnings[0], /mount/i);

    first();
    second();
  });

  it("allows a fresh mount once the previous one was disposed", () => {
    const container = el();
    const warnings = [];
    const env = environment();
    env.console = { warn: (m) => warnings.push(m), info() {} };

    mount(container, { ...OPTS(), env })();
    const second = mount(container, { ...OPTS(), env });

    assert.deepEqual(warnings, [], "disposing should leave no trace to warn about");
    second();
  });

  it("survives being disposed twice", () => {
    // Framework cleanups are not always called once. A second dispose must not
    // throw, and must not release anything a later mount now owns.
    const container = el();
    const dispose = mount(container, OPTS());

    dispose();
    assert.doesNotThrow(dispose);
  });
});

describe("mount — viewport changes", () => {
  it("switches sequence when the viewport changes shape", () => {
    // Rotating a phone changes which sequence suits the viewport. Selecting
    // once at mount means the portrait cut never appears, and nothing errors.
    const container = el();
    const env = environment();
    let resize = () => {};
    env.addEventListener = (type, fn) => {
      if (type === "resize") resize = fn;
    };
    const states = [];

    const landscape = { ...SEQUENCES[0] };
    const portrait = { id: "portrait", width: 810, height: 1440, totalFrames: 4, edgeColors: EDGES, lumaGrid: [] };

    const dispose = mount(container, {
      ...OPTS(),
      sequences: [landscape, portrait],
      env,
      onState: (x) => states.push(x),
    });

    assert.equal(states.at(-1).sequenceId, "landscape");

    env.innerWidth = 810;
    env.innerHeight = 1440;
    resize();

    assert.equal(states.at(-1).sequenceId, "portrait", "rotation must switch the sequence");
    dispose();
  });

  it("puts the visitor back where they were after a resize", () => {
    // Page height is in vh, so any viewport change moves the scroll offset
    // under them. Without this a rotation drops them elsewhere in the story.
    const container = el();
    const env = environment();
    let resize = () => {};
    const frames = [];
    env.addEventListener = (type, fn) => {
      if (type === "resize") resize = fn;
    };
    env.requestAnimationFrame = (fn) => {
      frames.push(fn);
      return frames.length;
    };
    let scrolledTo = null;
    env.scrollTo = (o) => {
      scrolledTo = o;
    };
    env.document.body = { scrollHeight: 5000 };

    const dispose = mount(container, { ...OPTS(), env });
    resize();

    // The restore is deliberately two frames deep: one is not always enough,
    // because the height depends on vh units the browser recomputes.
    while (frames.length) frames.shift()();

    assert.ok(scrolledTo, "expected the scroll position to be restored");
    dispose();
  });
});

describe("mount — reduced motion", () => {
  it("responds when the setting is toggled while the page is open", () => {
    // Reading .matches once means the page ignores the setting changing, which
    // is the one thing a visitor toggling it is trying to make happen.
    const container = el();
    const env = environment({ reduced: true });
    let onChange = () => {};
    env.matchMedia = () => ({
      get matches() {
        return env.__reduced ?? true;
      },
      addEventListener: (_, fn) => {
        onChange = fn;
      },
      removeEventListener() {},
    });
    env.__reduced = true;

    const states = [];
    const dispose = mount(container, { ...OPTS(), env, onState: (x) => states.push(x) });

    assert.equal(states.at(-1).phase, "reduced");

    env.__reduced = false;
    onChange();

    assert.notEqual(states.at(-1).phase, "reduced", "toggling must re-evaluate");
    dispose();
  });


  it("starts nothing when the visitor asked for reduced motion", () => {
    // Not a degraded animation: no worker, no decode, no scroll listener. The
    // poster is the page, and the story is already prose in the outline.
    const container = el();
    const states = [];
    const dispose = mount(container, { ...OPTS(), onState: (s) => states.push(s) });

    assert.ok(
      states.some((s) => s.phase === "reduced"),
      `expected a reduced phase, got ${JSON.stringify(states)}`,
    );
    dispose();
  });

  it("reports empty when there are no sequences to scrub", () => {
    const container = el();
    const states = [];
    const dispose = mount(container, {
      ...OPTS(),
      sequences: [],
      onState: (s) => states.push(s),
    });

    assert.ok(
      states.some((s) => s.phase === "failed" && s.reason === "empty"),
      `expected an empty failure, got ${JSON.stringify(states)}`,
    );
    dispose();
  });
});

describe("mount — the canvas", () => {
  it("positions the canvas over the poster", () => {
    // An unstyled canvas lays out inline at its backing-store size, so it
    // neither covers the poster nor fills the viewport. The page renders, the
    // build passes, and it simply looks wrong — which is how this shipped once.
    const container = el();
    const dispose = mount(container, { ...OPTS(), env: scrubbingEnvironment() });

    const canvas = container.children.find((c) => c.tagName === "CANVAS");
    assert.ok(canvas, "expected the engine to create a canvas");
    assert.match(canvas.style.cssText ?? "", /position:\s*absolute/);
    assert.match(canvas.style.cssText ?? "", /width:\s*100%/);

    dispose();
  });

  it("holds the canvas hidden until a frame has been decoded", () => {
    // Before the first decode there is nothing to draw, so a visible canvas is
    // a blank rectangle over the poster the page just painted.
    const container = el();
    const dispose = mount(container, { ...OPTS(), env: scrubbingEnvironment() });

    const canvas = container.children.find((c) => c.tagName === "CANVAS");
    assert.match(canvas.style.cssText ?? "", /opacity:\s*0/);

    dispose();
  });

  it("removes the canvas on dispose", () => {
    const container = el();
    const dispose = mount(container, { ...OPTS(), env: scrubbingEnvironment() });
    assert.ok(container.children.some((c) => c.tagName === "CANVAS"));

    dispose();
    assert.ok(!container.children.some((c) => c.tagName === "CANVAS"), "dispose must clean up");
  });
});

describe("mount — reaching ready", () => {
  /** Lets the immediately-resolving decodes settle. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("reveals the canvas once the opening frames have decoded", async () => {
    // Without this the canvas stays at the opacity it was created with and the
    // page shows the poster forever. It renders, it does not error, and it is
    // simply never the thing it was supposed to be.
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });

    const canvas = container.children.find((c) => c.tagName === "CANVAS");
    assert.match(canvas.style.cssText ?? "", /opacity:\s*0/, "hidden before decode");

    await settle();

    assert.equal(canvas.style.opacity, "1", "the canvas must be revealed once ready");
    dispose();
  });

  it("does not claim ready before the opening frames have settled", async () => {
    // The draw loop runs from the first paint. Emitting ready there would bury
    // the loading percentage the adapter renders, and would overwrite a failed
    // state on the very next animation frame.
    const container = el();
    const env = scrubbingEnvironment();
    const states = [];
    const dispose = mount(container, { ...OPTS(), env, onState: (x) => states.push(x) });

    assert.equal(states[0].phase, "loading", `first state should be loading, got ${states[0].phase}`);

    // Drive a paint. The draw loop runs from the first frame, long before any
    // decode has settled — this is the moment the bug happened.
    env.paint();

    assert.ok(
      !states.some((x) => x.phase === "ready"),
      `ready must not be emitted before anything decoded, got ${states.map((x) => x.phase)}`,
    );

    await settle();

    assert.ok(states.some((x) => x.phase === "ready"), "ready should arrive once decoded");
    dispose();
  });

  it("requests the opening window synchronously, before mount returns", () => {
    // Load-bearing for the worker fallback: onerror can only fire on a later
    // tick, so `pending` has to be populated by then or there is nothing to
    // recover and the page waits forever.
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });

    assert.ok(env.decodes.length > 0, "the opening window must be requested at mount");
    dispose();
  });
});

describe("mount — overlays", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("renders one overlay per beat", async () => {
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();

    assert.equal(byClass(container, "st-beat").length, STORY.sections.length);
    dispose();
  });

  it("carries each beat's alignment and anchor as data, not as markup", async () => {
    // The engine owns one set of markup; the stylesheet decides what left,
    // centre, right and bottom-anchored look like. A template that restyles
    // them does not have to re-render anything.
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();

    const beats = byClass(container, "st-beat");
    assert.deepEqual(
      beats.map((b) => b.dataset.align),
      ["left", "center", "right"],
    );
    assert.equal(beats[1].dataset.anchor, "bottom");
    dispose();
  });

  it("writes the measured scrim strength as a custom property", async () => {
    // This is the product's whole thesis: the strength is measured per frame at
    // build time and applied here. A beat that rendered without it would be
    // white text on whatever the footage happens to be doing.
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();

    const scrims = byClass(container, "st-beat__scrim");
    assert.ok(scrims.length > 0, "expected a scrim per beat");
    assert.ok(
      scrims.every((s) => "--st-scrim-opacity" in (s.props ?? {})),
      "every scrim needs its measured opacity",
    );
    dispose();
  });

  it("puts the beat copy in the document", async () => {
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();

    const headings = byClass(container, "st-beat__heading").map((h) => h.textContent);
    assert.deepEqual(headings, ["First", "Second", "Third"]);
    dispose();
  });

  it("renders the progress bar and the scroll hint", async () => {
    // The most common way one of these pages fails is a visitor looking at a
    // static hero and leaving, never learning there was anything else.
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();

    assert.equal(byClass(container, "st-progress").length, 1);
    assert.equal(byClass(container, "st-hint").length, 1);
    dispose();
  });

  it("renders no overlays at all under reduced motion", async () => {
    // No worker, no decode, no listener — and nothing fixed over the still.
    const container = el();
    const dispose = mount(container, OPTS());

    assert.equal(byClass(container, "st-beat").length, 0);
    assert.equal(byClass(container, "st-progress").length, 0);
    dispose();
  });

  it("removes everything it rendered on dispose", async () => {
    const container = el();
    const env = scrubbingEnvironment();
    const dispose = mount(container, { ...OPTS(), env });
    await settle();
    env.paint();
    assert.ok(byClass(container, "st-beat").length > 0);

    dispose();
    assert.equal(byClass(container, "st-beat").length, 0, "overlays must not outlive the mount");
    assert.equal(byClass(container, "st-progress").length, 0);
  });
});
