import { BoosterUi } from "@/components/booster/booster-ui";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        📦 Booster CSV Generator
      </h1>
      <BoosterUi />
    </main>
  );
}
