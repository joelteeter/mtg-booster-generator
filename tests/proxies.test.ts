/*
 * The Proxies page: reading a pasted list, resolving it, and laying it out.
 *
 * The list in `EXAMPLE` is the user's own, pasted as it came out of a deck
 * site, because every doubt about the format came from a real line: an
 * apostrophe in a name, a four-digit Secret Lair collector number, a set code
 * that is not the set the rest of the deck is from.
 *
 * The resolver is given a fake `/cards/collection` so the fallback chain can
 * be driven exactly: a printing that does not exist, a name that is not in
 * the set it claims, a number that belongs to a different card.
 */
import { describe, expect, it, vi } from "vitest";

import { expandFaces } from "@/lib/export/layout";
import { printingOf } from "@/lib/preview";

import {
  faceCard,
  matchName,
  mostRecentSet,
  normalizeName,
  noteText,
  parseProxyList,
  proxyEntries,
  proxyFilenames,
  proxyPages,
  resolveProxyList,
} from "@/lib/proxies";
import type {
  Card,
  CardIdentifier,
  CollectionPage,
  ScryfallSet,
} from "@/lib/scryfall/types";

const EXAMPLE = `1 The Borg Queen (TRC) 1
1 Academy Ruins (TRC) 512
1 Ambulatory Reactor (TRC) 35
1 An Offer You Can't Refuse (SLD) 2618
1 Anguished Unmaking (TRC) 472
1 Arc Reactor (MSH) 243
1 Arcane Signet (TRC) 485`;

const uris = (tag: string) => ({
  png: `https://img.test/${tag}.png`,
  large: `https://img.test/${tag}.jpg`,
});

const card = (
  name: string,
  set: string,
  number: string,
  extra: Partial<Card> = {},
): Card =>
  ({
    id: `${set}-${number}`,
    name,
    set,
    collector_number: number,
    type_line: "Artifact",
    image_uris: uris(`${set}-${number}`),
    ...extra,
  }) as Card;

/** A double-faced card: two faces with art, no art of its own. */
const dfc = (name: string, set: string, number: string): Card =>
  ({
    id: `${set}-${number}`,
    name,
    set,
    collector_number: number,
    card_faces: [
      { name: name.split(" // ")[0], image_uris: uris(`${number}-a`) },
      { name: name.split(" // ")[1], image_uris: uris(`${number}-b`) },
    ],
  }) as Card;

/**
 * A fake `/cards/collection` over a fixed shelf of cards, answering each
 * identifier the way Scryfall does and recording what it was asked.
 */
function shelf(cards: Card[]) {
  const asked: CardIdentifier[][] = [];
  const collection = async (ids: CardIdentifier[]): Promise<CollectionPage> => {
    asked.push(ids);
    const data: Card[] = [];
    const not_found: CardIdentifier[] = [];
    for (const id of ids) {
      const hit = cards.find((c) => {
        /* By Scryfall id, which is what the draft's printing asks for. */
        if ("id" in id) return c.id === id.id;
        if ("collector_number" in id)
          return (
            c.set === id.set.toLowerCase() &&
            c.collector_number === id.collector_number
          );
        const sameName =
          normalizeName(c.name ?? "") === normalizeName(id.name);
        return "set" in id
          ? sameName && c.set === id.set.toLowerCase()
          : sameName;
      });
      if (hit) data.push(hit);
      else not_found.push(id);
    }
    return { data, not_found };
  };
  return { collection, asked };
}

describe("reading a pasted list", () => {
  it("reads the format the deck sites export", () => {
    const { lines, bad, total } = parseProxyList(EXAMPLE);
    expect(bad).toEqual([]);
    expect(total).toBe(7);
    expect(lines[0]).toEqual({
      line: 1,
      raw: "1 The Borg Queen (TRC) 1",
      qty: 1,
      name: "The Borg Queen",
      set: "TRC",
      number: "1",
    });
    // An apostrophe in the name, and a four-digit Secret Lair number.
    expect(lines[3]).toMatchObject({
      name: "An Offer You Can't Refuse",
      set: "SLD",
      number: "2618",
    });
    expect(lines.map((l) => l.set)).toEqual([
      "TRC",
      "TRC",
      "TRC",
      "SLD",
      "TRC",
      "MSH",
      "TRC",
    ]);
  });

  it("counts copies", () => {
    const { lines, total } = parseProxyList("4 Sol Ring (C21) 263\n2x Island");
    expect(lines.map((l) => [l.qty, l.name])).toEqual([
      [4, "Sol Ring"],
      [2, "Island"],
    ]);
    expect(total).toBe(6);
  });

  it("takes a line with no set, and one with neither set nor number", () => {
    const { lines } = parseProxyList("1 Plains 318\nSol Ring\n3 Mountain");
    expect(lines).toMatchObject([
      { name: "Plains", set: null, number: "318" },
      { name: "Sol Ring", set: null, number: null, qty: 1 },
      { name: "Mountain", set: null, number: null, qty: 3 },
    ]);
  });

  /*
   * Everything a real export puts in the file that is not a card: headings
   * between the sections, comment lines, Moxfield's foil marker and its
   * category tags.
   */
  it("ignores headings, comments, finish markers and tags", () => {
    const { lines, bad } = parseProxyList(
      [
        "Commander",
        "1 The Borg Queen (TRC) 1",
        "",
        "Deck (99)",
        "// a note to myself",
        "# another",
        "1 Sol Ring (C21) 263 *F*",
        "1 Arcane Signet (TRC) 485 #Ramp",
        "SIDEBOARD:",
      ].join("\n"),
    );
    expect(bad).toEqual([]);
    expect(lines.map((l) => l.name)).toEqual([
      "The Borg Queen",
      "Sol Ring",
      "Arcane Signet",
    ]);
  });

  /*
   * `6 forest neo 302` — a real list, pasted with no brackets at all. It read
   * as a card called "forest neo" with no set, so it took the page's fallback
   * set and the number 302 from it, and printed TRK 302 instead of NEO 302.
   *
   * The set list is what makes this safe: `Academy Ruins 512` has exactly the
   * same shape, and `ruins` is not a set.
   */
  it("reads a set code with no brackets round it", () => {
    const sets = ["neo", "trk", "trc"];
    const { lines } = parseProxyList(
      "6 forest neo 302\n1 island trk 313\n1 Academy Ruins 512\n1 Plains 318",
      sets,
    );
    expect(lines).toMatchObject([
      { qty: 6, name: "forest", set: "NEO", number: "302" },
      { qty: 1, name: "island", set: "TRK", number: "313" },
      // Not a set, so the whole name is kept and only the number is taken.
      { qty: 1, name: "Academy Ruins", set: null, number: "512" },
      // A set here would leave no card name at all.
      { qty: 1, name: "Plains", set: null, number: "318" },
    ]);
  });

  it("only reads bare set codes when it knows the sets", () => {
    const [line] = parseProxyList("6 forest neo 302").lines;
    expect(line).toMatchObject({ name: "forest neo", set: null, number: "302" });
  });

  it("accepts square brackets as well as round ones", () => {
    expect(parseProxyList("1 Academy Ruins [TRC] 512").lines[0]).toMatchObject({
      set: "TRC",
      number: "512",
    });
  });

  it("reports a line it cannot read rather than dropping it", () => {
    const { lines, bad } = parseProxyList("1 Sol Ring (C21) 263\n1 (TRC) 4");
    expect(lines).toHaveLength(1);
    expect(bad).toEqual([
      { line: 2, raw: "1 (TRC) 4", why: "no card name on this line" },
    ]);
  });

  /* Scryfall knows a double-faced card by its front face. */
  it("looks a double-faced card up by its front face", () => {
    const { lines } = parseProxyList(
      "1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki (NEO) 141",
    );
    expect(lines[0].name).toBe(
      "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    );
    expect(matchName(lines[0].name)).toBe("Fable of the Mirror-Breaker");
  });

  it("compares names past case, accents and punctuation", () => {
    expect(normalizeName("Lim-Dûl's Vault")).toBe("lim dul s vault");
    expect(normalizeName("AN OFFER YOU CAN'T REFUSE")).toBe(
      normalizeName("An Offer You Can't Refuse"),
    );
  });
});

describe("resolving a list against Scryfall", () => {
  const borg = card("The Borg Queen", "trc", "1");
  const ruins = card("Academy Ruins", "trc", "512");
  const signet = card("Arcane Signet", "trc", "485");

  it("asks for the exact printing, once per distinct card", async () => {
    const { collection, asked } = shelf([borg, ruins, signet]);
    const resolved = await resolveProxyList(
      parseProxyList("2 Academy Ruins (TRC) 512\n1 Academy Ruins (TRC) 512"),
      "trc",
      { collection },
    );
    // Both lines want the same printing, so Scryfall is asked for it once.
    expect(asked).toEqual([[{ set: "trc", collector_number: "512" }]]);
    expect(resolved.map((r) => r.card?.id)).toEqual(["trc-512", "trc-512"]);
    expect(resolved.flatMap((r) => r.notes)).toEqual([]);
  });

  it("uses the chosen set for a line that names none, and says so", async () => {
    const { collection } = shelf([signet]);
    const [entry] = await resolveProxyList(
      parseProxyList("1 Arcane Signet"),
      "trc",
      { collection },
    );
    expect(entry.card?.id).toBe("trc-485");
    expect(entry.notes).toEqual([
      { kind: "assumed-set", set: "TRC" },
      { kind: "assumed-printing" },
    ]);
    expect(entry.notes.map(noteText)).toEqual([
      "no set on the line, so TRC was used",
      "no collector number, so the set's own printing was taken",
    ]);
  });

  /*
   * The collector number is the first thing to go stale in a hand-edited
   * list. The set is usually still right, so the name is tried within it
   * before giving up on the set entirely.
   */
  it("falls back to the name within the set when the number is wrong", async () => {
    const { collection, asked } = shelf([ruins]);
    const [entry] = await resolveProxyList(
      parseProxyList("1 Academy Ruins (TRC) 999"),
      "trc",
      { collection },
    );
    expect(entry.card?.id).toBe("trc-512");
    expect(entry.notes).toEqual([
      { kind: "other-printing", asked: "TRC 999" },
    ]);
    expect(asked).toEqual([
      [{ set: "trc", collector_number: "999" }],
      [{ name: "Academy Ruins", set: "trc" }],
    ]);
  });

  it("falls back to any set at all, naming the one it used", async () => {
    const elsewhere = card("Sol Ring", "c21", "263");
    const { collection, asked } = shelf([elsewhere]);
    const [entry] = await resolveProxyList(
      parseProxyList("1 Sol Ring (TRC) 1000"),
      "trc",
      { collection },
    );
    expect(entry.card?.id).toBe("c21-263");
    expect(entry.notes).toEqual([
      { kind: "other-set", asked: "TRC 1000", got: "C21" },
    ]);
    expect(asked[2]).toEqual([{ name: "Sol Ring" }]);
  });

  /* The user's call: the number names one printing, so the number wins. */
  it("prints the card at that number and flags the name it is not", async () => {
    const { collection } = shelf([signet]);
    const [entry] = await resolveProxyList(
      parseProxyList("1 Sol Ring (TRC) 485"),
      "trc",
      { collection },
    );
    expect(entry.card?.id).toBe("trc-485");
    expect(entry.notes).toEqual([
      { kind: "name-differs", asked: "Sol Ring", got: "Arcane Signet" },
    ]);
    expect(entry.notes.map(noteText)).toEqual([
      "that number is “Arcane Signet”, not “Sol Ring”",
    ]);
  });

  it("leaves a line that matches nothing out, and reports it", async () => {
    const { collection } = shelf([borg]);
    const resolved = await resolveProxyList(
      parseProxyList("1 The Borg Queen (TRC) 1\n1 Nonesuch (ZZZ) 9"),
      "trc",
      { collection },
    );
    expect(resolved[1].card).toBeNull();
    expect(resolved[1].notes).toEqual([{ kind: "missing" }]);
    // The rest of the list still resolves.
    expect(resolved[0].card?.id).toBe("trc-1");
  });

  it("asks for nothing at all when the list is empty", async () => {
    const collection = vi.fn();
    expect(await resolveProxyList(parseProxyList("\n// nothing\n"), "trc", {
      collection,
    })).toEqual([]);
    expect(collection).not.toHaveBeenCalled();
  });
});

describe("laying the list out", () => {
  const plain = (n: number) => card(`Card ${n}`, "trc", String(n));

  it("one entry per copy, in the order written", () => {
    const resolved = [
      { line: parseProxyList("3 Card 1 (TRC) 1").lines[0], card: plain(1), notes: [] },
      { line: parseProxyList("1 Card 2 (TRC) 2").lines[0], card: plain(2), notes: [] },
    ];
    const entries = proxyEntries(resolved, "separate");
    expect(entries.map((e) => e.card.name)).toEqual([
      "Card 1",
      "Card 1",
      "Card 1",
      "Card 2",
    ]);
    // The slot numbers the preview captions use are positions in the list.
    expect(entries.map((e) => e.slot)).toEqual([1, 2, 3, 4]);
    /*
     * No label: a label says what drew the card, and nothing drew these but
     * the line that was typed. The preview caption names the printing from
     * the card itself — see `printingOf`.
     */
    expect(entries.map((e) => e.label)).toEqual(["", "", "", ""]);
    expect(printingOf(entries[0].card)).toBe("TRC 1");
  });

  it("skips a line that resolved to nothing", () => {
    const resolved = [
      { line: parseProxyList("1 Card 1 (TRC) 1").lines[0], card: plain(1), notes: [] },
      { line: parseProxyList("1 Nope (TRC) 9").lines[0], card: null, notes: [] },
    ];
    expect(proxyEntries(resolved, "separate")).toHaveLength(1);
  });

  /*
   * The exporter splits a double-faced card itself, which reflows the pages.
   * These pages cannot reflow — the page you pick in the table has to be the
   * page you saw — so the split happens here and each entry is one slot.
   */
  it("splits a double-faced card into two slots for sleeving", () => {
    const resolved = [
      {
        line: parseProxyList("1 Fable // Reflection (NEO) 141").lines[0],
        card: dfc("Fable // Reflection", "neo", "141"),
        notes: [],
      },
    ];
    const entries = proxyEntries(resolved, "separate");
    expect(entries.map((e) => e.card.name)).toEqual(["Fable", "Reflection"]);
    // Neither half is double-faced any more, so nothing expands it again.
    expect(entries.map((e) => e.card.card_faces)).toEqual([undefined, undefined]);
    expect(entries[0].card.image_uris).toEqual(uris("141-a"));
    expect(entries[1].card.image_uris).toEqual(uris("141-b"));
  });

  it("leaves it as one slot when the back is printed behind the front", () => {
    const resolved = [
      {
        line: parseProxyList("1 Fable // Reflection (NEO) 141").lines[0],
        card: dfc("Fable // Reflection", "neo", "141"),
        notes: [],
      },
    ];
    expect(proxyEntries(resolved, "frontOnly")).toHaveLength(1);
  });

  it("keeps each face's own name and the card's own id", () => {
    const whole = dfc("Fable // Reflection", "neo", "141");
    expect(faceCard(whole, 0).name).toBe("Fable");
    expect(faceCard(whole, 1).name).toBe("Reflection");
    expect(faceCard(whole, 1).id).toBe("neo-141");
  });

  it("fills nine to a page, the last page short", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      card: plain(i),
      finish: "nonfoil",
      slot: i + 1,
      label: "",
    }));
    const pages = proxyPages(entries);
    expect(pages.map((p) => p.length)).toEqual([9, 9, 2]);
  });

  /*
   * The claim the whole page rests on. `buildPdf` runs `expandFaces` over
   * whatever it is given; if that turned one of these entries into two, the
   * pages would reflow inside the PDF and "Page 3" in the table would be a
   * different nine cards from "Page 3" in the preview.
   */
  it("hands the exporter pages it cannot reflow", () => {
    const resolved = [
      { line: parseProxyList("2 Fable // Reflection (NEO) 141").lines[0], card: dfc("Fable // Reflection", "neo", "141"), notes: [] },
      { line: parseProxyList("9 Card 1 (TRC) 1").lines[0], card: plain(1), notes: [] },
    ];
    for (const mode of ["separate", "frontOnly"] as const) {
      const pages = proxyPages(proxyEntries(resolved, mode));
      const expanded = expandFaces(pages, mode);
      expect(expanded.map((p) => p.length)).toEqual(pages.map((p) => p.length));
      // And every page is a page: nine slots, or the last one short.
      expect(pages.slice(0, -1).every((p) => p.length === 9)).toBe(true);
    }
    // Two double-faced cards split in two, plus nine: 13 slots, so 9 + 4.
    expect(proxyPages(proxyEntries(resolved, "separate")).map((p) => p.length)).toEqual([9, 4]);
    expect(proxyPages(proxyEntries(resolved, "frontOnly")).map((p) => p.length)).toEqual([9, 2]);
  });

  /*
   * The preview's caption, in the shape a decklist is written in: the
   * question a proxy preview answers is "is this the right printing", and
   * the art alone often cannot.
   */
  it("names one printing the way a decklist does", () => {
    expect(printingOf(card("Forest", "neo", "302"))).toBe("NEO 302");
    expect(printingOf(faceCard(dfc("Fable // Reflection", "neo", "141"), 1))).toBe(
      "NEO 141",
    );
    // A card with neither — the built-in separator lands — says nothing.
    expect(printingOf({ name: "Forest" } as Card)).toBe("");
    expect(printingOf(null)).toBe("");
  });

  it("names the files for the page", () => {
    expect(proxyFilenames(3)).toEqual([
      "Proxies-All-3",
      "Proxies-1",
      "Proxies-2",
      "Proxies-3",
    ]);
  });
});

describe("the set a line with no set belongs to", () => {
  const set = (
    code: string,
    released: string | undefined,
    type = "expansion",
    extra: Partial<ScryfallSet> = {},
  ): ScryfallSet => ({ code, name: code.toUpperCase(), set_type: type, released_at: released, ...extra });

  /*
   * Scryfall's list is mostly not what anyone means by "the latest set":
   * token sets, art series and promos share the release date, Arena sets are
   * digital, and next spring's expansion is already listed.
   */
  it("takes the newest set that has actually come out", () => {
    const sets = [
      set("one", "2023-02-10"),
      set("mkm", "2024-02-09"),
      set("tmkm", "2024-02-09", "token"),
      set("amkm", "2024-02-09", "memorabilia"),
      set("ymkm", "2024-03-01", "alchemy", { digital: true }),
      set("fut", "2026-06-01"),
      set("unannounced", undefined),
    ];
    expect(mostRecentSet(sets, "2024-06-01")?.code).toBe("mkm");
  });

  it("has nothing to say about an empty list", () => {
    expect(mostRecentSet([], "2024-06-01")).toBeNull();
  });
});
