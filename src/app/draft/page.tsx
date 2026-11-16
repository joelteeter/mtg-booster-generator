import type { Metadata } from "next";

import { DraftUi } from "@/components/draft/draft-ui";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Draft",
  description:
    "Draft a set of generated boosters with other people, a pick at a time, over as many days as it takes — then print only the decks.",
};

export default function DraftPage() {
  return (
    <PageShell title="🎴 Draft">
      <DraftUi />
    </PageShell>
  );
}
