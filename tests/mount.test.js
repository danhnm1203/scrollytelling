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
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
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
  };
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

const SEQUENCES = [
  { id: "landscape", width: 1280, height: 720, totalFrames: 4, edgeColors: [], lumaGrid: [] },
];
const STORY = { brand: "x", title: "x", description: "x", sections: [] };
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

describe("mount — reduced motion", () => {
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
