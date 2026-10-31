/*
 * The old `js/simulators.js`, loaded as-is.
 *
 * That file is one IIFE, so nothing inside it is in the script's lexical scope
 * and the trick used for `scryfall.js` and `ui.js` — append an expression that
 * collects the declarations — cannot reach it. What it does do is hand one
 * object out through `window.Sims`, so that single line is rewritten to carry
 * the internals as well. The rewrite is an exact string match and throws if it
 * ever stops matching, so this cannot silently start testing nothing.
 *
 * Everything else is the real thing: the two configurations, the shuffle, the
 * planar die, and the deck mechanics, driven through the same functions the
 * buttons call.
 *
 * Deleted with the old app in phase 6.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EXPORT_LINE = "window.Sims = { show };";
const WITH_INTERNALS = `window.Sims = { show, __internals: {
  SIMS, state, DIE,
  isPhenomenon, isOngoing, imageOf, shuffle, nextCostText,
  doShuffle, doDraw, abandon, newTurn,
  getActive: () => active
} };`;

export interface LegacySimsInternals {
  SIMS: Record<string, any>;
  state: Record<string, any>;
  DIE: any[];
  isPhenomenon(card: any): boolean;
  isOngoing(card: any): boolean;
  imageOf(card: any, size: string): string;
  shuffle(arr: any[]): any[];
  nextCostText(rolls: number): string;
  doShuffle(): void;
  doDraw(): void;
  abandon(index: number): void;
  newTurn(): void;
  getActive(): string | null;
}

export interface LegacySims {
  show(kind: string): Promise<void>;
  internals: LegacySimsInternals;
  /** What `#simStatus` currently says. */
  status(): string;
  setPhenomena(on: boolean): void;
}

export interface LegacySimsOptions {
  /** Cards per simulator kind, as one page of a Scryfall search. */
  pools: Record<string, any[]>;
  /** Replaces `Math.random` inside the VM. */
  random?: () => number;
}

export function loadLegacySims(options: LegacySimsOptions): LegacySims {
  const src = readFileSync(
    fileURLToPath(new URL("../js/simulators.js", import.meta.url)),
    "utf8",
  );
  if (!src.includes(EXPORT_LINE))
    throw new Error(
      `js/simulators.js no longer contains "${EXPORT_LINE}"; the simulator ` +
        `parity harness needs updating`,
    );

  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id))
      elements.set(id, {
        id,
        value: "",
        // The phenomena box ships checked, as in index.html.
        checked: id === "simPhenomena",
        textContent: "",
        innerHTML: "",
        disabled: false,
        className: "",
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false,
        },
        setAttribute: () => {},
        appendChild: () => {},
        querySelector: () => element(id + ":child"),
        querySelectorAll: () => [],
        addEventListener: () => {},
      });
    return elements.get(id);
  };

  const page = (cards: any[]) =>
    new Response(JSON.stringify({ object: "list", has_more: false, data: cards }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      createElement: () => element("created"),
      addEventListener: () => {},
      body: { appendChild: () => {} },
    },
    window: {},
    API: "https://api.scryfall.com/",
    /* The simulators' only request: one paginated search per kind. */
    sfFetch: async (url: string) => {
      const q = new URL(url).searchParams.get("q") ?? "";
      const kind = Object.keys(options.pools).find((k) => q.includes(k === "planechase" ? "layout:planar" : "layout:scheme"));
      if (!kind) return new Response("{}", { status: 404 });
      return page(options.pools[kind]);
    },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
    Math: options.random
      ? Object.assign(Object.create(Math), { random: options.random })
      : Math,
  };

  vm.runInNewContext(src.replace(EXPORT_LINE, WITH_INTERNALS), sandbox, {
    filename: "js/simulators.js",
  });

  const sims = (sandbox.window as any).Sims;
  return {
    show: (kind: string) => sims.show(kind),
    internals: sims.__internals as LegacySimsInternals,
    status: () => element("simStatus").textContent,
    setPhenomena: (on: boolean) => {
      element("simPhenomena").checked = on;
    },
  };
}
