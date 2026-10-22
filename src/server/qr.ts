// QR-koder som SVG (biblioteket qrcode-generator, MIT).

import qrcode from "qrcode-generator";

export const MAX_QR_TEXT = 400;

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M"); // 0 = välj storlek själv
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
