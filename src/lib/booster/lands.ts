/*
 * Bonus / separator land cycles offered in the dropdown. Cycle names follow
 * managathering.com where it has them.
 */
import type { LandCycle } from "./types";

export const LAND_CYCLES: LandCycle[] = [
  { id: "classic", label: "Classic: original duals + fetch lands (built-in printings)", builtIn: true },
  { id: "shock", label: "Shock lands", names: ["Hallowed Fountain", "Watery Grave", "Blood Crypt", "Stomping Ground", "Temple Garden", "Godless Shrine", "Overgrown Tomb", "Breeding Pool", "Steam Vents", "Sacred Foundry"] },
  { id: "slow", label: "Slow lands", names: ["Deserted Beach", "Shipwreck Marsh", "Haunted Ridge", "Rockfall Vale", "Overgrown Farmland", "Shattered Sanctum", "Deathcap Glade", "Dreamroot Cascade", "Stormcarved Coast", "Sundown Pass"] },
  { id: "scry", label: "Scry lands (Temples)", names: ["Temple of Enlightenment", "Temple of Deceit", "Temple of Malice", "Temple of Abandon", "Temple of Plenty", "Temple of Silence", "Temple of Malady", "Temple of Mystery", "Temple of Epiphany", "Temple of Triumph"] },
  { id: "surveil", label: "Surveil lands", names: ["Meticulous Archive", "Undercity Sewers", "Raucous Theater", "Commercial District", "Lush Portico", "Shadowy Backstreet", "Underground Mortuary", "Hedge Maze", "Thundering Falls", "Elegant Parlor"] },
  { id: "verge", label: "Verge lands", names: ["Floodfarm Verge", "Gloomlake Verge", "Blazemire Verge", "Thornspire Verge", "Hushwood Verge", "Bleachbone Verge", "Wastewood Verge", "Willowrush Verge", "Riverpyre Verge", "Sunbillow Verge"] },
  { id: "gain", label: "Gain lands", names: ["Tranquil Cove", "Dismal Backwater", "Bloodfell Caves", "Rugged Highlands", "Blossoming Sands", "Scoured Barrens", "Jungle Hollow", "Thornwood Falls", "Swiftwater Cliffs", "Wind-Scarred Crag"] },
  { id: "fast", label: "Fast lands", names: ["Seachrome Coast", "Darkslick Shores", "Blackcleave Cliffs", "Copperline Gorge", "Razorverge Thicket", "Concealed Courtyard", "Spirebluff Canal", "Blooming Marsh", "Inspiring Vantage", "Botanical Sanctum"] },
  { id: "guildgate", label: "Guildgates", names: ["Azorius Guildgate", "Dimir Guildgate", "Rakdos Guildgate", "Gruul Guildgate", "Selesnya Guildgate", "Orzhov Guildgate", "Golgari Guildgate", "Simic Guildgate", "Izzet Guildgate", "Boros Guildgate"] },
  { id: "desert", label: "Desert pingers", names: ["Lonely Arroyo", "Soured Springs", "Jagged Barrens", "Bristling Backwoods", "Creosote Heath", "Forlorn Flats", "Festering Gulch", "Lush Oasis", "Eroded Canyon", "Abraded Bluffs"] },
  { id: "creature", label: "Creature lands (Restless)", names: ["Restless Anchorage", "Restless Reef", "Restless Vents", "Restless Ridgeline", "Restless Prairie", "Restless Bivouac", "Restless Cottage", "Restless Fortress", "Restless Spire", "Restless Vinestalk"] },
  { id: "fetch", label: "Fetch lands", names: ["Flooded Strand", "Polluted Delta", "Bloodstained Mire", "Wooded Foothills", "Windswept Heath", "Marsh Flats", "Scalding Tarn", "Verdant Catacombs", "Arid Mesa", "Misty Rainforest"] },
  { id: "original", label: "Original dual lands", names: ["Tundra", "Underground Sea", "Badlands", "Taiga", "Savannah", "Scrubland", "Volcanic Island", "Bayou", "Plateau", "Tropical Island"] },
  { id: "check", label: "Check lands", names: ["Glacial Fortress", "Drowned Catacomb", "Dragonskull Summit", "Rootbound Crag", "Sunpetal Grove", "Isolated Chapel", "Sulfur Falls", "Woodland Cemetery", "Clifftop Retreat", "Hinterland Harbor"] },
  { id: "pain", label: "Pain lands", names: ["Adarkar Wastes", "Underground River", "Sulfurous Springs", "Karplusan Forest", "Brushland", "Caves of Koilos", "Shivan Reef", "Llanowar Wastes", "Battlefield Forge", "Yavimaya Coast"] },
  { id: "filter", label: "Filter lands", names: ["Mystic Gate", "Sunken Ruins", "Graven Cairns", "Fire-Lit Thicket", "Wooded Bastion", "Fetid Heath", "Cascade Bluffs", "Twilight Mire", "Rugged Prairie", "Flooded Grove"] },
  { id: "bounce", label: "Bounce lands (Karoos)", names: ["Azorius Chancery", "Dimir Aqueduct", "Rakdos Carnarium", "Gruul Turf", "Selesnya Sanctuary", "Orzhov Basilica", "Golgari Rot Farm", "Simic Growth Chamber", "Izzet Boilerworks", "Boros Garrison"] },
  { id: "bond", label: "Bond lands (Battlebond / CMR)", names: ["Sea of Clouds", "Morphic Pool", "Luxury Suite", "Spire Garden", "Bountiful Promenade", "Vault of Champions", "Training Center", "Undergrowth Stadium", "Rejuvenating Springs", "Spectator Seating"] },
  { id: "battle", label: "Battle lands (tango)", names: ["Prairie Stream", "Sunken Hollow", "Smoldering Marsh", "Cinder Glade", "Canopy Vista"] },
  { id: "horizon", label: "Horizon lands", names: ["Horizon Canopy", "Silent Clearing", "Fiery Islet", "Nurturing Peatland", "Sunbaked Canyon", "Waterlogged Grove"] },
  { id: "triome", label: "Triomes", names: ["Raugrin Triome", "Savai Triome", "Zagoth Triome", "Ketria Triome", "Indatha Triome", "Spara's Headquarters", "Raffine's Tower", "Xander's Lounge", "Ziatora's Proving Ground", "Jetmir's Garden"] },
  // Pathways are modal double-faced; a substring name match finds "Front // Back".
  { id: "pathway", label: "Pathways", substring: true, names: ["Hengegate Pathway", "Clearwater Pathway", "Cragcrown Pathway", "Needleverge Pathway", "Riverglide Pathway", "Brightclimb Pathway", "Darkbore Pathway", "Branchloft Pathway", "Blightstep Pathway", "Barkchannel Pathway"] },
  { id: "random", label: "Random: a different cycle for each pack" },
];

/** Scryfall query for a cycle: every name in it, paper only, no promos. */
export function landCycleQuery(cycle: LandCycle): string {
  const parts = (cycle.names as string[]).map((n) =>
    cycle.substring ? `name:"${n}"` : `!"${n}"`,
  );
  return `(${parts.join(" or ")}) game:paper -is:promo`;
}
