import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { SheetsUi } from "@/components/sheets/sheets-ui";

export const metadata: Metadata = {
  title: "Lands",
  description:
    "Print every land a set ever printed, nine to a page — expansions, Commander decks, Secret Lair drops.",
};

export default function LandsPage() {
  return (
    <PageShell title="🏞 Lands">
      <SheetsUi kind="lands" />
    </PageShell>
  );
}
