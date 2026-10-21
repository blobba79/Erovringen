// Brickdata: VAD som finns var på en bricka, aldrig hur det ser ut.
// Kantmodellen följer JCloisterZone så att datan kan konverteras rakt av:
// stad, väg och flod anges per hel kant, fält per halvkant (L/R sett från brickans mitt).

export type Edge = "N" | "E" | "S" | "W";
export type HalfEdge = "NL" | "NR" | "EL" | "ER" | "SL" | "SR" | "WL" | "WR";

/** Medurs rotation i grader. */
export type Rotation = 0 | 90 | 180 | 270;

export type ExpansionId =
  | "base"
  | "river"
  | "abbot"
  | "inns-cathedrals"
  | "traders-builders"
  | "princess-dragon"
  | "flying-machines"
  | "ferries"
  | "gold-mines"
  | "mage-witch"
  | "crop-circles-2";

/** Egenskaper som en expansion lägger på ett område, t.ex. { inn: true } eller { goods: "wine" }. */
export type FeatureProps = Readonly<Record<string, string | number | boolean>>;

interface FeatureBase {
  /** Unikt inom brickan, t.ex. "city0". */
  id: string;
  props?: FeatureProps;
}

export interface CityFeature extends FeatureBase {
  kind: "city";
  edges: Edge[];
  pennants?: number;
}

export interface RoadFeature extends FeatureBase {
  kind: "road";
  /** Tom lista = vägen slutar på brickan (t.ex. vid ett kloster). */
  edges: Edge[];
}

export interface RiverFeature extends FeatureBase {
  kind: "river";
  edges: Edge[];
}

export interface FieldFeature extends FeatureBase {
  kind: "field";
  halfEdges: HalfEdge[];
  /** Id på städerna på samma bricka som fältet gränsar till (för fältpoäng). */
  adjacentCities: string[];
}

/** Områden utan kanter: kloster, trädgård och expansionernas motsvarigheter. */
export interface CenterFeature extends FeatureBase {
  kind: "cloister" | "garden" | (string & {});
}

export type Feature = CityFeature | RoadFeature | RiverFeature | FieldFeature | CenterFeature;
export type FeatureKind = Feature["kind"];

/** Symboler på brickan som inte är områden: "volcano", "dragon", "portal", "gold", "mage", "flier", "crop-circle:pitchfork" … */
export type TileSymbol = string;

export interface TileType {
  /** Stabilt id, t.ex. "base/CcRr+" (JCloisterZones id med vår expansion som prefix). */
  id: string;
  expansion: ExpansionId;
  features: Feature[];
  symbols?: TileSymbol[];
}

export interface TileSet {
  expansion: ExpansionId;
  /** Vilken utgåva av JCloisterZones data som använts, t.ex. "basic:2". */
  source: string;
  tiles: { type: string; count: number }[];
  /** Startbrickan, om expansionen har en. */
  start?: string;
}
