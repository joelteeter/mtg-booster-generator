"use client";

/*
 * What the packs in this draft actually are.
 *
 * Somebody drafting never saw the Boosters page. They were handed a code and
 * a pile of cards, and without this they have no way to tell real Play
 * Booster odds from three times the mythics — which changes how you draft, so
 * it is not a footnote.
 *
 * The wording is `lib/explain`'s, carried across at the moment the pool was
 * uploaded. Nothing here works anything out: the room stores sentences and
 * this prints them, so a drafter reads exactly what the admin read.
 */
import type { PoolSummary } from "@/lib/draft";
import { cn } from "@/lib/utils";

const MODES: Record<string, [one: string, many: string]> = {
  play: ["Play Booster", "Play Boosters"],
  commander: ["Commander draft booster", "Commander draft boosters"],
};

export function PoolNote({ summary }: { summary: PoolSummary | null }) {
  /* Rooms dealt before this existed have nothing to say, and say nothing. */
  if (!summary) return null;

  const { setCode, mode, packs, vanilla, changes } = summary;
  const official = vanilla || changes.length === 0;
  const [one, many] = MODES[mode] ?? ["booster", "boosters"];
  const kind = packs === 1 ? one : many;

  return (
    <section
      className={cn(
        "rounded-lg border border-l-4 p-4",
        official
          ? "border-green-200 border-l-green-600 bg-green-50 dark:border-green-900 dark:border-l-green-500 dark:bg-green-950/40"
          : "border-amber-200 border-l-amber-500 bg-amber-50 dark:border-amber-900 dark:border-l-amber-500 dark:bg-amber-950/40",
      )}
    >
      <h2 className="font-semibold">
        {packs} {setCode} {kind}
      </h2>

      {official ? (
        <p className="mt-1 text-sm">
          <b>✓ Official odds.</b>{" "}
          <span className="text-muted-foreground">
            {vanilla
              ? "Built in vanilla mode, so every slot is exactly what a real booster does."
              : "The options chosen leave every slot at its official odds for this set."}
          </span>
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm">
            <b>
              ✦ {changes.length} change{changes.length === 1 ? "" : "s"} from
              vanilla.
            </b>{" "}
            <span className="text-muted-foreground">
              These are not real booster odds — worth knowing before you pick.
            </span>
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-sm">
            {changes.map((line) => (
              <li key={line} className="mb-0.5">
                {line}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
