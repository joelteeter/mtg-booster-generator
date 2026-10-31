"use client";

/*
 * "What the chosen options actually do", as prose under the slot table.
 *
 * Every string here is carried over from `js/ui.js` deliberately. All of this
 * explanatory text was audited in October against Wizards' own announcements,
 * so it is ported word for word rather than rewritten — including the
 * approximations it is careful to admit to.
 */
import { LAND_CYCLES, LAYOUTS, PLAY_BOOSTER_START, isReleased } from "@/lib/booster";
import type { CommanderLayout, Slot, Stats } from "@/lib/booster/types";
import { pct, slotsAffectedBy, lastSlotFoilChance } from "@/lib/explain";
import type { SpecOptions } from "@/hooks/use-spec";

function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  );
}

export function ModifierList({
  slots,
  stats,
  opts,
  mode,
  code,
  layout,
  cmdAny,
}: {
  slots: Slot[];
  stats: Stats | null;
  opts: SpecOptions;
  mode: "play" | "commander";
  code: string;
  layout: CommanderLayout | null;
  cmdAny: boolean;
}) {
  const total = slots.reduce((a, s) => a + s.n, 0);
  const at = (tag: string) => slotsAffectedBy(slots, tag);
  const multSlots = at("mult");
  const pFoilSlot = lastSlotFoilChance(slots, mode);
  const upper = code ? code.toUpperCase() : "";
  const items: React.ReactNode[] = [];

  if (mode === "commander" && cmdAny && layout) {
    const legs = stats
      ? `${stats.legC || 0} common, ${stats.legU || 0} uncommon, ${stats.legR || 0} rare and ${stats.legM || 0} mythic legendary creatures/planeswalkers`
      : "its legendary creatures/planeswalkers";
    const backgrounds =
      stats && (stats.bgCU || stats.bgR)
        ? `, ${(stats.bgCU || 0) + (stats.bgR || 0)} Backgrounds`
        : "";
    items.push(
      <>
        <b>Commander booster from any set:</b> {LAYOUTS[layout]} filled with{" "}
        {upper} cards: {legs}
        {backgrounds}.
        {stats && (stats.legAll || 0) < 10 && (
          <>
            {" "}
            <b>This set has very few legends</b>, so legendary slots repeat
            often or fall back to nonlegendary cards.
          </>
        )}
      </>,
    );
  }

  if (opts.vanilla) {
    items.push(
      <>
        <b>Vanilla:</b> on. Official odds for every slot; this tab&apos;s fun
        options are switched off.
      </>,
    );
  } else {
    items.push(
      opts.mult > 1 ? (
        <>
          <b>Fun multiplier x{opts.mult}</b> (slot
          {multSlots.includes(",") ? "s" : ""} {multSlots}): upgrade chances are
          multiplied and capped at 100%
          {mode === "play"
            ? " (Special Guest/List, mythic)"
            : " (legendary rare/mythic, rare Background, mythic, rare in the uncommon-or-rare slot, foil-etched)"}
          ;{" "}
          {mode === "play"
            ? "the wildcards weight rares and mythics up and commons down by the same factor"
            : "commons are removed from the foil slot"}
          .
        </>
      ) : (
        <>
          <b>Fun multiplier x1:</b> the multiplier itself changes nothing (it
          would affect slots {multSlots}), but the other fun options still apply
          — see the changes listed above.
        </>
      ),
    );
    if (opts.guest)
      items.push(
        <>
          <b>Guest List swap</b> (slots 1–{total}): after a card is drawn, if it
          has a Special Guests printing it is swapped to that printing 50% of
          the time.
        </>,
      );
    if (mode === "play") {
      if (opts.foilToggle)
        items.push(
          <>
            <b>Foil wildcard</b> (slot {at("foilToggle")}): the second wildcard
            is always traditional foil.
          </>,
        );
      if (opts.listToggle)
        items.push(
          <>
            <b>The List</b> (slot {at("listToggle")}): 12.5% × multiplier chance
            of a random card from The List.
          </>,
        );
      items.push(
        <>
          <b>Slot upgrades</b> (slots {at("slotUpgrade")}): the seventh common
          becomes an uncommon, and the third guaranteed uncommon becomes a
          guaranteed rare, so a fun pack always holds one more rare than a real
          one. Both apply at every multiplier.
        </>,
      );
      items.push(
        <>
          <b>Land upgrade</b> (slot {at("landUpgrade")}): the basic land is
          always swapped for a random non-basic land. The pool is every
          non-basic land the set has, common duals included, so a common land is
          still the likely result — the slot row shows the mix.
        </>,
      );
    }
  }

  items.push(
    <>
      <b>Printing:</b> a card name is chosen uniformly from the slot&apos;s
      pool, then one of that card&apos;s printings in the set (regular,
      showcase, borderless, etc.) is chosen at random. The only exception is a
      God Pack&apos;s Booster Fun slots, which prefer an alternate treatment
      when the set printed one.
    </>,
  );

  if (opts.includeBonus && opts.separatorType === "token") {
    items.push(
      <>
        <b>Token separator (card {total + 1}):</b> after each pack, one card
        carrying two different tokens from {upper || "the set"} — one on the
        front, another on the back — so print those pages double-sided. It marks
        the pack boundary and is not part of the pack.
      </>,
    );
  } else if (opts.includeBonus) {
    const cyc = LAND_CYCLES.find((c) => c.id === opts.bonusType);
    const names = cyc?.names
      ? `: ${cyc.names.join(", ")}`
      : cyc?.builtIn
        ? ": 10 original duals + 10 fetch lands"
        : "";
    items.push(
      <>
        <b>Bonus land (card {total + 1}):</b> after each pack, one random{" "}
        {cyc ? cyc.label : ""}
        {names}. It marks the pack boundary and is not part of the pack.
      </>,
    );
  }

  if (opts.tokenSheets) {
    items.push(
      <>
        <b>Token sheets:</b> after the packs, full pages holding one of every
        token {code ? `in ${upper}` : "in the set"}, in collector-number order,
        two per card (front and back). Tokens that are already double-faced keep
        their own two faces. Slots left spare on the last page are filled with
        random tokens from the set.
      </>,
    );
  }

  if (opts.released && !isReleased({ released_at: opts.released })) {
    items.push(
      <>
        <b>Not released yet:</b> {upper || "This set"} is out on {opts.released}.
        Scryfall only holds the cards spoiled so far, so every chance here is
        worked out from a part of the set and will move as more are revealed.
      </>,
    );
  }

  if (mode === "play" && opts.released && opts.released < PLAY_BOOSTER_START) {
    items.push(
      <>
        <b>Note:</b> this set (released {opts.released}) predates Play Boosters,
        so it is simulated with the current Booster Pack layout rather than its
        original draft or set booster.
      </>,
    );
  }

  if (mode === "play" && opts.vanilla) {
    items.push(
      opts.listEra ? (
        <>
          <b>The List:</b> this set is from the MKM–Bloomburrow era, when 12.5%
          of Play Boosters had a List card (Special Guests included) in slot 7.
        </>
      ) : (
        <>
          <b>The List:</b> not in Play Boosters for this set; slot 7 only
          upgrades to a Special Guest (1 in 64).
        </>
      ),
    );
  }

  if (mode === "play") {
    items.push(
      <>
        <b>Foil (2027 rules):</b> foil commons and uncommons no longer exist,
        and no pack is guaranteed a foil.{" "}
        {opts.foilToggle ? (
          "The foil wildcard option above overrides that and foils the last slot whatever it is. "
        ) : (
          <>
            The last wildcard is foil only when it comes out a rare or mythic
            {pFoilSlot != null && (
              <>
                , which is <b>{pct(pFoilSlot)}</b> of packs for this set
              </>
            )}
            .{" "}
          </>
        )}
        The land slot can still add a foil land on top.{" "}
        <Source href="https://magic.wizards.com/en/news/announcements/updating-our-boosters-in-2027">
          Updating Our Boosters in 2027
        </Source>
      </>,
    );
    items.push(
      <>
        <b>God Pack:</b> each pack rolls its own 1 in 1,000 chance (0.1%) of
        being a God Pack instead: all 14 cards rare or mythic — 10 plain, 2
        Booster Fun, 2 traditional foil Booster Fun. Wizards&apos; 15th card,
        the celebration card, belongs to the non-playable slot this app never
        generates. God Packs are marked ✨ in the pack list and the status line.
      </>,
    );
  }

  items.push(
    <>
      <b>Approximate:</b> the last wildcard&apos;s rarity uses per-card weights
      of 4 : 2 : 1 : ½ (common : uncommon : rare : mythic), close to
      Duskmourn&apos;s published foil sheet from when that slot was always foil.
      The non-foil wildcard&apos;s split (18% / 67% / 15%) also comes from the
      Duskmourn sheet.
    </>,
  );

  return (
    <>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Pack layouts: Wizards&apos;{" "}
        <Source href="https://magic.wizards.com/en/news/making-magic/what-are-play-boosters">
          What Are Play Boosters?
        </Source>{" "}
        (slot order and odds),{" "}
        <Source href="https://magic.wizards.com/en/news/announcements/updating-our-boosters-in-2027">
          Updating Our Boosters in 2027
        </Source>{" "}
        (foil slot, God Packs),{" "}
        <Source href="https://magic.wizards.com/en/news/feature/collecting-commander-masters">
          Collecting Commander Masters
        </Source>
        , StarCityGames&apos;{" "}
        <Source href="https://articles.starcitygames.com/magic-the-gathering/your-guide-to-commander-legends-battle-for-baldurs-gate-products/">
          Baldur&apos;s Gate product guide
        </Source>
        , and the booster data on{" "}
        <Source href="https://www.mtg.wtf/pack/cmr-draft">mtg.wtf</Source> (CMR,
        CMM, MKM and DSK Play Boosters).
      </p>
    </>
  );
}
