/*
 * Proxies: a pasted decklist, resolved against Scryfall and laid out to
 * print. `parse` reads the text, `resolve` turns lines into cards, `pages`
 * puts them on paper, `sets` decides what "no set given" means.
 */
export * from "./pages";
export * from "./parse";
export * from "./resolve";
export * from "./sets";
