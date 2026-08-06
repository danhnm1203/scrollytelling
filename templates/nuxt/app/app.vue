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

import { SEQUENCES, framePath } from "./components/frames.js";
import { story } from "./components/story.js";
import { scrollHeightVh } from "./lib/scroll-math.mjs";
import { mount } from "./lib/scroll-engine.mjs";

const sequence = SEQUENCES[0];
const runwayHeight = sequence ? `${scrollHeightVh(sequence.totalFrames)}vh` : undefined;

useHead({
  title: story.title,
  meta: [{ name: "description", content: story.description }],
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
