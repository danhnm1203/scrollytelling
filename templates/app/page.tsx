import { story } from "@/components/story";

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-white/40">{story.brand}</p>
      <h1 className="max-w-2xl text-4xl font-medium text-white/90 sm:text-5xl">
        {story.sections[0]?.heading ?? story.brand}
      </h1>
      <p className="max-w-md text-white/60">
        No frames yet. Generate a sequence to make this page scroll:
      </p>
      <code className="rounded bg-white/5 px-3 py-2 text-sm text-white/70">
        open-scrolltelling frames &lt;video&gt; .
      </code>
    </main>
  );
}
