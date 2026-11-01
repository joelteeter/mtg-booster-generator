import { BoosterUi } from "@/components/booster/booster-ui";
import { PageShell } from "@/components/page-shell";

export default function Home() {
  return (
    <PageShell title="📦 Booster CSV Generator">
      <BoosterUi />
    </PageShell>
  );
}
