import QRCode from "qrcode";

export function createQrSvg(text: string, scale = 8, margin = 2): string {
  const qr = QRCode.create(text, {
    errorCorrectionLevel: "M",
    margin,
  });
  const size = qr.modules.size;
  const total = (size + margin * 2) * scale;
  const rects: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.get(col, row)) continue;
      rects.push(
        `<rect x="${(col + margin) * scale}" y="${(row + margin) * scale}" width="${scale}" height="${scale}"/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="MFA setup QR code"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
}
