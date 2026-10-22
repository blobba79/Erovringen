// Spelmotorn för grundspelet. Moduler (river, abbot) och expansioner byggs ihop med createEngine.

export { createEngine, type EngineApi } from "./engine";
export { baseModule, makeBaseModule } from "./base-module";
export { newGame, STATE_VERSION } from "./setup";
export { legalSteps, figureSteps } from "./legal";
export { legalPlacements, isLegalPlacement, hasAnyPlacement } from "./placement";
export { analyze, type Area, type Analysis } from "./features";
export { areaValue, majorityOwners, completedCitiesAround, strength } from "./scoring";
export { rotateTile, distinctRotations, type RotatedTile } from "./tileinfo";
export { frontier, geometricPlacements, toTileTypes, type Board, type TileTypes } from "./board";
export { nextRandom, randomInt, shuffle } from "./rng";
export * from "./geometry";
export { baseExt, activeModules, type Env, type EngineHookContext, type BaseExt } from "./context";
