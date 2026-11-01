import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { Simulator } from "@/components/sim/simulator";

export const metadata: Metadata = {
  title: "Archenemy Simulator",
  description:
    "Shuffle every Scheme on Scryfall into one scheme deck, set them in motion and keep the ongoing ones in play.",
};

export default function ArchenemyPage() {
  return (
    <PageShell title="😈 Archenemy Simulator">
      <Simulator kind="archenemy" />
    </PageShell>
  );
}
