import { Button } from "@/components/ui/button";

/*
 * Phase 0 placeholder. The real UI arrives in phase 3; until then this page
 * exists to prove the scaffold builds, exports statically and renders a shadcn
 * component. The app that is actually live still lives in `index.html` and
 * `js/` at the repo root, and is retired in phase 6.
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          MTG Booster Pack Generator
        </h1>
        <p className="text-muted-foreground">
          Next.js rebuild in progress. The pack logic is ported and tested; the
          interface is not built yet.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        The working app is still the one on the <code>dev</code> branch.
      </p>
      <div>
        <Button asChild>
          <a href="https://dev--mtg-draft-generator.netlify.app">
            Open the current app
          </a>
        </Button>
      </div>
    </main>
  );
}
