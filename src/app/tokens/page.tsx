import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { SheetsUi } from "@/components/sheets/sheets-ui";

export const metadata: Metadata = {
  title: "Tokens",
  description:
    "Print every token a set printed, nine to a page, two to a card if you want them double-sided.",
};

export default function TokensPage() {
  return (
    <PageShell title="🌟 Tokens">
      <SheetsUi kind="tokens" />
    </PageShell>
  );
}
