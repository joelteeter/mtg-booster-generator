"use client";

/*
 * The front door: join a draft somebody told you about, or start one.
 *
 * No accounts, so there is nothing here but a code and a name. The code is
 * typed in rather than clicked, because the way it travels is somebody reading
 * it out or pasting it into a group chat — which is also why `tidyCode` folds
 * the letters Crockford's alphabet says people get wrong.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Direction } from "@/lib/draft";
import { DraftError, makeRoom } from "@/lib/room-client";
import { tidyCode } from "@/lib/room/codes";

import type { Entered } from "./draft-ui";

/** Alternating from the first pack's direction, one entry a round. */
const passPattern = (first: Direction, rounds: number): Direction[] =>
  Array.from({ length: rounds }, (_, i) =>
    i % 2 === 0 ? first : first === "left" ? "right" : "left",
  );

export function RoomGate({
  onEnter,
}: {
  onEnter: (code: string, keys: Entered) => void;
}) {
  const [typed, setTyped] = useState("");
  const [seats, setSeats] = useState(8);
  const [rounds, setRounds] = useState(3);
  const [perTurn, setPerTurn] = useState(1);
  const [first, setFirst] = useState<Direction>("right");
  const [password, setPassword] = useState("");
  const [making, setMaking] = useState(false);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const code = tidyCode(typed);
    if (code.length !== 6) {
      toast.error("A draft code is six characters.");
      return;
    }
    onEnter(code, {});
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setMaking(true);
    try {
      const made = await makeRoom(
        {
          maxSeats: seats,
          rounds,
          picksPerTurn: perTurn,
          pass: passPattern(first, rounds),
        },
        password || undefined,
      );
      onEnter(made.code, { admin: made.adminKey });
    } catch (e) {
      toast.error(
        e instanceof DraftError && e.reason === "not-admin"
          ? "That password is wrong."
          : "The draft could not be started.",
        { description: e instanceof Error ? e.message : undefined },
      );
    } finally {
      setMaking(false);
    }
  };

  return (
    <>
      <section className="rounded-lg border p-4">
        <h2 className="mb-1 font-semibold">Join a draft</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Type the code whoever is running it gave you.
        </p>
        <form onSubmit={join} className="flex flex-wrap items-end gap-2">
          <div className="grow basis-48">
            <Label htmlFor="draft-code">Draft code</Label>
            <Input
              id="draft-code"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="K7M-Q2F"
              autoComplete="off"
              spellCheck={false}
              className="font-mono tracking-widest uppercase"
            />
          </div>
          <Button type="submit">Find it</Button>
        </form>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-1 font-semibold">Start a draft</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          You run it: people join with the code, then you generate the packs on
          the Boosters page and deal them. Nothing is printed until everyone has
          built a deck.
        </p>
        <form onSubmit={start} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="basis-32">
              <Label htmlFor="draft-seats">Seats at most</Label>
              <Input
                id="draft-seats"
                type="number"
                min={2}
                max={12}
                value={seats}
                onChange={(e) => setSeats(Number(e.target.value))}
              />
            </div>
            <div className="basis-32">
              <Label htmlFor="draft-rounds">Packs each</Label>
              <Input
                id="draft-rounds"
                type="number"
                min={1}
                max={6}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
              />
            </div>
            <div className="basis-40">
              <Label htmlFor="draft-perturn">Picks a turn</Label>
              <select
                id="draft-perturn"
                value={perTurn}
                onChange={(e) => setPerTurn(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value={1}>1 — normal draft</option>
                <option value={2}>2 — commander draft</option>
              </select>
            </div>
            <div className="basis-40">
              <Label htmlFor="draft-first">First pack passes</Label>
              <select
                id="draft-first"
                value={first}
                onChange={(e) => setFirst(e.target.value as Direction)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="right">Right, then left</option>
                <option value="left">Left, then right</option>
              </select>
            </div>
          </div>
          {/*
            * Only needed where the deploy sets DRAFT_ADMIN_PASSWORD, which it
            * normally does not. Shown rather than hidden because a wrong guess
            * at whether it is on is a confusing 403.
            */}
          <div className="basis-48">
            <Label htmlFor="draft-password">
              Password{" "}
              <span className="font-normal text-muted-foreground">
                — only if this site asks for one
              </span>
            </Label>
            <Input
              id="draft-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Button type="submit" disabled={making}>
              {making ? "Starting…" : "Start a draft"}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
