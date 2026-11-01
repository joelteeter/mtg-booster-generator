import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { Simulator } from "@/components/sim/simulator";

export const metadata: Metadata = {
  title: "Planechase Simulator",
  description:
    "Shuffle every Plane and Phenomenon on Scryfall into one planar deck, planeswalk through it and roll the planar die.",
};

export default function PlanechasePage() {
  return (
    <PageShell title="🌀 Planechase Simulator">
      <Simulator kind="planechase" />
    </PageShell>
  );
}
