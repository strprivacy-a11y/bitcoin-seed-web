import QRCode from "./QRCode/index.js";
import QRErrorCorrectLevel from "./QRCode/QRErrorCorrectLevel.js";

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createQrSvg(text, options = {}) {
  const cellSize = options.cellSize ?? 6;
  const margin = options.margin ?? 4;
  const foreground = options.foreground ?? "#b7ff85";
  const background = options.background ?? "#08110a";

  const qr = new QRCode(0, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const size = (count + margin * 2) * cellSize;
  const rects = [];

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }

      rects.push(
        `<rect x="${(col + margin) * cellSize}" y="${(row + margin) * cellSize}" width="${cellSize}" height="${cellSize}" />`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(text)}"><rect width="${size}" height="${size}" fill="${background}" rx="${cellSize * 2}" /><g fill="${foreground}">${rects.join("")}</g></svg>`;
}
