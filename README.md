# mtg-booster-generator
Generate booster packs from Magic the Gathering sets mostly following Booster Play odds

Lots of vibing here, the goal was to be able to proxy cards for a draft or sealed setting.  For easy importing into https://chiselapp.com/user/luziferius/repository/MTGProxyPrinter/index I output packs into separate csv files as MTGProxyPrinter will group duplicates and I need packs to be strictly as they are generated.

* Output will be in scryfall csv format
* Replaced the basic land with a random non-basic land from the set
* Option to seperate boosters with a random dual or fetch land
* Option to increase the odds of good cards, this removes the chances of a wildcard being common
* Option to evenly swap for a Guest List card if it exists in the set
* Will grab a random non-foil version of each card if mulitple versions exist in scryfall


Un this on a local server as scryfall will fail on CORS