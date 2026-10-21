# Erövringen

A tile-laying game for the browser, played in one room: the world is shown on a shared big screen (a TV or monitor), and every player uses their own phone. It runs locally on one computer over the home wifi, as a single program file for Windows or Linux.

Erövringen is inspired by Carcassonne. It is a fan project and is not affiliated with or endorsed by the publishers of Carcassonne. It uses no original artwork: all tiles are drawn by the game itself.

*Work in progress.* See [SPEC.md](SPEC.md) for what is being built and [PLAN.md](PLAN.md) for how.

## Thanks

Many thanks to **Roman Krejčík** and the contributors of [JCloisterZone](https://github.com/farin/JCloisterZone):

- The tile data (edges, features and tile counts) is converted from [JCloisterZone-Client](https://github.com/farin/JCloisterZone-Client) (`src/extraResources/expansions/`, AGPL-3.0).
- The rules engine of JCloisterZone (MIT) is used as the reference for tricky rule cases. Where logic is ported from it, its copyright line is kept in the code.

## License

[AGPL-3.0](LICENSE), because the tile data from JCloisterZone-Client is AGPL-3.0.
