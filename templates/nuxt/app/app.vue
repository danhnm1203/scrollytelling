<script setup>
/**
 * The whole page.
 *
 * Nuxt renders this on the server, so the story outline and the opening frame
 * are in the HTML before any JavaScript runs — same as index.astro, and for the
 * same three reasons: a crawler sees the copy, a link preview has an image, and
 * a visitor with scripting disabled gets a readable page instead of a blank one.
 *
 * The scrubbing itself is the same engine every other template gets. This file
 * is the markup plus the handful of lines that hand it a container.
 */
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useHead } from "#imports";

// Two imports of one module, on purpose. The named one is what a bundler
// traces, and this project has shipped a broken page before by making an import
// less legible to one. The namespace one exists only for SITE_URL, which is in
// the contract only once `frames --site-url` has recorded one — a named import
// of an absent export fails at build time, so a project that has never run
// frames would not compile. Asking through the namespace gets undefined, which
// is already the "no image" case.
import { SEQUENCES, framePath } from "./components/frames.js";
import * as frames from "./components/frames.js";
import { story } from "./components/story.js";
import { cardFields } from "./lib/social-card.mjs";
import { scrollHeightVh } from "./lib/scroll-math.mjs";
import { mount } from "./lib/scroll-engine.mjs";

const sequence = SEQUENCES[0];
const runwayHeight = sequence ? `${scrollHeightVh(sequence.totalFrames)}vh` : undefined;

// What the card contains comes from lib/social-card.mjs, which every template
// reads. This is Nuxt's way of putting it in a head — the mechanism, not the
// answer. Four mechanisms is right; four answers would drift, and the drift is
// invisible because every page still renders.
//
// No card path is passed: the module names the card relative to the site url,
// which already carries any base path this is deployed under.
const card = cardFields({ story, siteUrl: frames.SITE_URL });

useHead({
  title: story.title,
  meta: [
    { name: "description", content: story.description },
    { property: "og:type", content: card.type },
    { property: "og:title", content: card.title },
    { property: "og:description", content: card.description },
    // Dropped rather than emitted empty when there is no site url: an empty
    // og:image is a relative reference that resolves to the page itself, so a
    // strict crawler fetches the HTML and calls it the preview image.
    ...(card.url ? [{ property: "og:url", content: card.url }] : []),
    ...(card.image ? [{ property: "og:image", content: card.image }] : []),
    { name: "twitter:card", content: card.twitterCard },
    { name: "twitter:title", content: card.title },
    { name: "twitter:description", content: card.description },
    ...(card.image ? [{ name: "twitter:image", content: card.image }] : []),
  ],
});

const container = ref(null);
let dispose;

// mount() touches the DOM, so it waits for the client. The import above does
// not — the engine reads no browser global until it is called, which is what
// lets Vite see `new Worker(new URL(...))` inside it and emit the worker.
// Importing it dynamically here instead would hide that literal from the
// bundler, which is the exact mistake that once shipped a worker-less page.
onMounted(() => {
  if (container.value) {
    dispose = mount(container.value, { sequences: SEQUENCES, story, framePath });
  }
});

// Nuxt keeps the page alive across client-side navigation, so the engine has to
// be told to stop. Without this its scroll listener, its animation frame and
// every decoded frame it is holding outlive the page that made them.
onBeforeUnmount(() => dispose?.());
</script>

<template>
  <!--
    The story, once, as ordinary prose.

    Visually hidden but present in the document, so a screen reader gets one
    coherent description and a crawler sees the whole page's copy. It is also
    the page a visitor gets when they have asked for reduced motion: the scrub
    does not run then, and lib/scroll-engine.css makes this visible rather than
    inventing a second, lesser version of the same copy.
  -->
  <main class="story-outline">
    <h1>{{ story.brand }}</h1>
    <p>{{ story.description }}</p>
    <section v-for="beat in story.sections" :key="beat.heading">
      <h2>{{ beat.heading }}</h2>
      <p>{{ beat.body }}</p>
    </section>
  </main>

  <div v-if="sequence" data-scrollytelling-runway aria-hidden="true" :style="{ height: runwayHeight }">
    <div ref="container" data-scrollytelling>
      <!--
        The opening frame as a plain image, rendered on the server. It is what
        the page paints first, what a link preview shows, and what a visitor
        with scripting disabled gets — none of which the engine could produce,
        because it does not run in any of those cases.

        The data attribute is the handshake: the engine adopts this element
        instead of creating a second one. Do not remove it.
      -->
      <img
        data-scrollytelling-poster
        :src="framePath(sequence.id, 0)"
        alt=""
        style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"
      />
    </div>
  </div>

  <div v-else class="no-frames">
    <div>
      <p>No frames yet.</p>
      <p>Generate a sequence to make this page scroll:</p>
      <code>scrollytelling frames &lt;video&gt; .</code>
    </div>
  </div>
</template>

<style>
:root {
  /* Replaced at runtime by each frame's own edge colour, so the canvas has no
     visible edge against the page. */
  --page-bg: #050505;
  color-scheme: dark;
}
html,
body {
  margin: 0;
  background: var(--page-bg);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
[data-scrollytelling] {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 100%;
}
.no-frames {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 0 1.5rem;
  text-align: center;
  color: rgb(255 255 255 / 0.9);
}
.no-frames code {
  display: inline-block;
  border-radius: 0.25rem;
  background: rgb(255 255 255 / 0.05);
  padding: 0.5rem 0.75rem;
  color: rgb(255 255 255 / 0.7);
}
</style>
