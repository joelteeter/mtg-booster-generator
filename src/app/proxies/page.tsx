import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { ProxiesUi } from "@/components/proxies/proxies-ui";

export const metadata: Metadata = {
  title: "Proxies",
  description:
    "Paste a decklist and print those exact cards, nine to a page, with the same duplex and alignment options as the rest of the app.",
};

export default function ProxiesPage() {
  return (
    <PageShell title="📋 Proxies">
      <ProxiesUi />
    </PageShell>
  );
}
