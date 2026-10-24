// Cellshadad stil: ALLA färger och mått finns här och ingen annanstans.
// Mått anges som andel av brickans sida (1 = hela brickan), utom där det står annat.

export const THEME = {
  id: "cellshaded",
  /** Ljuset kommer från övre vänstra hörnet: skuggor faller åt höger och nedåt. */
  shadowDir: [0.6, 0.8] as const,
  shadowAlpha: 0.24,

  outline: "#1F2A2E",
  outlineW: 0.016,

  grass: { base: "#7FD05B", dark: "#5FB043", patch: "#A8E978" },
  /** Antal gräsfläckar per bricka och deras storlek (radie). */
  grassPatches: { light: 6, dark: 5, minR: 0.04, maxR: 0.1 },

  road: { light: "#F3DCA2", dark: "#CFAA66", width: 0.17, shade: 0.045 },
  river: { light: "#3FB3EC", dark: "#2290CF", glint: "#E9F8FF", width: 0.25, shade: 0.06, glintW: 0.012, dash: [0.05, 0.06] as const },
  city: { light: "#F6C766", dark: "#D99A3C", wallBand: 0.05 },

  /** Vägslut mitt på brickan (se junction.ts): avstånd från mitten där vägen slutar, och husstorlek. */
  junction: { stub: 0.23, houseSize: 0.095 },

  house: { wallLight: "#FFF4DC", wallDark: "#DCC496", roofLight: "#EE6A4A", roofDark: "#B8432D", size: 0.13 },
  cloister: { size: 0.4, cross: "#FFF4DC", door: "#7A4B2A" },
  garden: { hedge: "#2B8A42", hedgeLight: "#43B257", flower: "#F06292", flower2: "#FFE066" },
  tree: { light: "#43B257", dark: "#2B8A42", glint: "#9BE47F", r: 0.07 },
  treesPerTile: [2, 4] as const,

  shield: { light: "#2F63E0", dark: "#1D42A6", trim: "#FFFFFF", size: 0.15 },

  /** Märken på brickan. */
  symbol: {
    size: 0.2,
    volcano: { rock: "#8C5A3C", rockDark: "#6B4129", lava: "#FF8A2A", lavaLight: "#FFD23F" },
    dragon: { body: "#7A3DB8", bodyDark: "#592B8A", wing: "#C77DFF", eye: "#FFE066" },
    portal: { ring: "#9B5DE5", ringDark: "#6A35B0", core: "#E9D5FF" },
    gold: { light: "#FFD23F", dark: "#E0A800", glint: "#FFF3B0" },
    mage: { hat: "#5B3FD0", hatDark: "#3F2A9E", star: "#FFE066", beard: "#F5F5F5" },
    flier: { body: "#D9D9D9", dark: "#9AA5A8", prop: "#7A4B2A", arrow: "#EE6A4A" },
    cropCircle: { ring: "#E8C85A", ringDark: "#B89A32", fill: "#D4B24A" },
    ferry: { hull: "#8C5A3C", hullDark: "#6B4129", sail: "#FFF4DC", sailDark: "#DCC496" },
    cathedral: { wall: "#FFF4DC", wallDark: "#DCC496", roof: "#2F63E0", roofDark: "#1D42A6", cross: "#FFD23F" },
    goods: { wine: "#9B2D5E", wineDark: "#6E1C42", grain: "#F2C14E", grainDark: "#C9962E", cloth: "#4FB0C6", clothDark: "#2F8499" },
    inn: { wall: "#FFF4DC", wallDark: "#DCC496", roof: "#7A4B2A", roofDark: "#563420", sign: "#FFD23F" },
    princess: { crown: "#FFD23F", crownDark: "#E0A800", gem: "#EE6A4A" },
    unknown: { fill: "#C9D1D3", dark: "#9AA5A8" },
  },

  figure: {
    neutral: "#C9D1D3",
    /** Andel av mörk blandning för skuggsidan. */
    shadeMix: 0.28,
    glint: "#FFFFFF",
    outlineW: 0.06,
    largeScale: 1.28,
    shadowScale: [0.5, 0.16] as const,
    /** Neutrala och särskilda pjäser. */
    extra: {
      hat: "#FFD23F", wood: "#8C5A3C", metal: "#B8C2C6", skin: "#F6D2A8",
      pig: "#F7A8B8", pigDark: "#D9788F",
      mage: "#7A4BD8", witch: "#3A2D4D", witchBand: "#9B5DE5",
      dragon: "#E5372F", dragonBelly: "#F6C766", dragonWing: "#B8221C", eye: "#FFE066",
      fairy: "#FFE9F5", fairyWing: "#BFEFFF", sparkle: "#FFF3B0",
    },
    dragonScale: 1.3,
  },

  highlight: {
    area: { fill: "rgba(255, 210, 63, 0.38)", stroke: "#FFD23F" },
    open: { fill: "rgba(88, 214, 141, 0.38)", stroke: "#58D68D" },
    blocked: { fill: "rgba(235, 87, 87, 0.34)", stroke: "#EB5757" },
    preview: { fill: "rgba(255, 255, 255, 0.28)", stroke: "#FFFFFF" },
    strokeW: 3,
    dash: [8, 5] as const,
  },

  /** Färger som gränssnittet runt kartan använder. */
  ui: {
    background: "#2E5E3A",
    backgroundDark: "#244A2E",
    outline: "#1F2A2E",
    text: "#FFF4DC",
    panel: "#FFF4DC",
    panelDark: "#DCC496",
    accent: "#EE6A4A",
  },
} as const;

export type Theme = typeof THEME;
