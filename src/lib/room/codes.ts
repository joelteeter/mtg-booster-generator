/*
 * Room codes, seat keys, and the hash the keys are stored as.
 *
 * Nothing here is a password: a seat key is a capability, so it is long and
 * random and never chosen by a person. The room code is the opposite — it is
 * read aloud and typed in, so it is short and drawn from an alphabet with no
 * character anybody has to ask about.
 */

/**
 * Crockford's base32: the digits and the capitals, without I, L, O or U.
 *
 * Picked rather than invented, because the requirements are exactly the ones
 * it was designed for. It is meant to be read aloud and typed in, so the
 * characters people confuse are gone — and because it is *exactly* 32
 * characters, a random byte reduced modulo the alphabet stays uniform, since
 * 256 is a whole number of 32s. An alphabet of 31 would quietly bias the
 * early letters unless the sampling rejected part of the range.
 *
 * It also defines how to read a mistyped one, which `tidyCode` follows: I and
 * L are 1, O is 0. U is left out so a code cannot spell something unfortunate.
 */
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Random bytes. Injected so a test can pin a code. */
export type Bytes = (n: number) => Uint8Array;

const systemBytes: Bytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Six characters: about a billion rooms, which is enough for a kitchen. */
export const roomCode = (bytes: Bytes = systemBytes): string =>
  Array.from(bytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** 128 bits as hex. The thing that actually authorises a seat. */
export const secretKey = (bytes: Bytes = systemBytes): string =>
  Array.from(bytes(16), (b) => b.toString(16).padStart(2, "0")).join("");

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

/**
 * What goes in the database instead of the key.
 *
 * A plain SHA-256 with no salt and no stretching, which would be wrong for a
 * password and is right here: the input is 128 random bits, so there is no
 * dictionary to run and nothing for a work factor to buy. It exists so that a
 * database dump does not hand out everybody's seat.
 */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/**
 * Normalise what somebody typed: case, spaces, the dash we print, and the
 * four letters Crockford folds — I and L read as 1, O reads as 0. Somebody
 * reading a code off a screen to somebody else gets those wrong first.
 */
export const tidyCode = (typed: string): string =>
  typed
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");

/** `K7M-Q2F` — how a code is shown, never how it is stored. */
export const prettyCode = (code: string): string =>
  code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
