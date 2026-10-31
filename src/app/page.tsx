import { BoosterUi } from "@/components/booster/booster-ui";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          📦 Booster CSV Generator
        </h1>
        <ThemeToggle />
      </div>
      <BoosterUi />
    </main>
  );
}
