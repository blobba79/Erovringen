// Programmets version. Bygget ersätter `EROVRINGEN_VERSION` med versionen i package.json
// (`bun build --define`); under `npm run dev` och i tester är den "dev".

declare const EROVRINGEN_VERSION: string | undefined;

export const VERSION: string = typeof EROVRINGEN_VERSION === "string" ? EROVRINGEN_VERSION : "dev";
