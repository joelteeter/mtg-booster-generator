-- The async draft. Planned in docs/async-draft.md.
--
-- One row of `draft` is a whole draft. The engine's state is pure JSON, so it
-- is stored as it stands rather than spread across tables it would have to be
-- reassembled from — which also means there is no second definition of its
-- shape here to drift from the TypeScript one.
--
-- Two version numbers, and conflating them would be a bug:
--   `rev`   an optimistic lock, bumped by every write to the state. A pick is
--           one conditional update, and losing the condition means somebody
--           picked first.
--   `shape` the layout of `state`, `pool` and `seats`. Bumped by a deploy that
--           changes any of them, so that a draft stored at an older layout is
--           refused loudly instead of misread.
--
-- Applied automatically. Netlify runs every migration in
-- `netlify/database/migrations` in lexicographic order, immediately before a
-- deploy is published, and a failure blocks the publish. So there is no
-- command to run — the file being here and named this way is the whole of it.
--
-- `netlify database migrations apply` runs them against the local development
-- database, which is the way to try one before pushing.

create table if not exists draft (
  code         text primary key,
  created_at   timestamptz not null default now(),
  phase        text not null,
  shape        integer not null,
  rev          integer not null default 0,
  rules        jsonb not null,
  pool         jsonb not null default '{}'::jsonb,
  -- Null until the draft is dealt.
  state        jsonb,
  -- Player id to seat number. In here rather than on `player` so that the
  -- deal is one conditional write: packs shuffled by one deal and seats from
  -- another is not a state worth being able to represent.
  seats        jsonb not null default '{}'::jsonb,
  admin_hash   text not null,
  max_seats    integer not null,
  print_basics boolean not null default false
);

create table if not exists player (
  code      text not null references draft(code) on delete cascade,
  id        text not null,
  name      text not null,
  -- The sha-256 of the seat key, never the key: a dump of this table should
  -- not hand out anybody's seat.
  key_hash  text not null,
  joined_at timestamptz not null default now(),
  primary key (code, id)
);

-- One name to a room, however it was capitalised. An index rather than a check
-- in the application, because the case it exists for is two people joining in
-- the same moment.
create unique index if not exists player_name_per_room
  on player (code, lower(name));

create index if not exists player_by_key on player (key_hash);

-- Append-only, and never read while a draft is running. This is the backup:
-- replaying it through `applyPick` rebuilds a draft from nothing. It is also
-- the draft log the players will want afterwards.
create table if not exists pick (
  code    text not null references draft(code) on delete cascade,
  at      integer not null,
  seat    integer not null,
  pack_id text not null,
  cards   text[] not null,
  made_at timestamptz not null default now(),
  primary key (code, at)
);
