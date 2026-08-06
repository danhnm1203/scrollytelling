// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-08-06",

  // Nuxt scans app/components/ and registers everything it finds there as a
  // component, including .js files. frames.js and story.js are data — the
  // generated contract and the copy — so the scan is narrowed to .vue.
  //
  // Without this they are registered as components named Frames and Story.
  // Nothing renders them, so nothing breaks loudly; you get two phantom entries
  // and a slower scan. Narrowing it is what lets them keep the same name and
  // the same place they have on every other template.
  components: [{ path: "~/components", extensions: ["vue"] }],

  // The engine's stylesheet, shared with every other template. Loaded here
  // rather than imported inside app.vue so it lands in the same place Nuxt puts
  // the rest of the CSS, inside the cascade the project owns.
  css: ["~/lib/scroll-engine.css"],

  // Deploying under a subdirectory? Set app.baseURL here AND edit framePath in
  // app/components/frames.js — the frames are fetched at runtime by the engine,
  // which baseURL does not rewrite.
});
