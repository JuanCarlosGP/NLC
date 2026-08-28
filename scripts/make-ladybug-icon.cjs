const path = require("path");
const sharp = require(path.join(process.env.TEMP, "nlc-sharp", "node_modules", "sharp"));

const SRC = "e:/dev/SND/assets/ladybug-sheet.png";
const OUT_DIR = "e:/dev/SND/assets";
const COLS = 8;
const ROWS = 6;
const CANVAS = 1024;
const FILL = 0.5;
const CREAM = { r: 240, g: 235, b: 227, alpha: 1 };

function isInk(r, g, b, a) {
  if (a < 40) return false;
  const cream =
    Math.abs(r - CREAM.r) < 12 && Math.abs(g - CREAM.g) < 12 && Math.abs(b - CREAM.b) < 12;
  if (cream) return false;
  return r + g + b > 40;
}

async function croppedSprite() {
  const meta = await sharp(SRC).metadata();
  const fw = Math.round(meta.width / COLS);
  const fh = Math.round(meta.height / ROWS);
  const frame = await sharp(SRC).extract({ left: 0, top: 0, width: fw, height: fh }).png().toBuffer();
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = await sharp(frame).extract({ left: minX, top: minY, width, height }).png().toBuffer();
  return { cropped, width, height };
}

async function sprite() {
  const { cropped, width, height } = await croppedSprite();
  const scale = Math.max(1, Math.floor((CANVAS * FILL) / Math.max(width, height)));
  const spriteW = width * scale;
  const spriteH = height * scale;
  const scaled = await sharp(cropped)
    .resize(spriteW, spriteH, { kernel: "nearest" })
    .png()
    .toBuffer();
  return { scaled, spriteW, spriteH, scale };
}

async function silhouette(size, fill, file) {
  const { cropped, width, height } = await croppedSprite();
  const { data, info } = await sharp(cropped).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (isInk(out[i], out[i + 1], out[i + 2], out[i + 3])) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    } else {
      out[i + 3] = 0;
    }
  }
  const white = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  const scale = Math.max(1, Math.floor((size * fill) / Math.max(width, height)));
  const spriteW = width * scale;
  const spriteH = height * scale;
  const scaled = await sharp(white)
    .resize(spriteW, spriteH, { kernel: "nearest" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: scaled,
        left: Math.round((size - spriteW) / 2),
        top: Math.round((size - spriteH) / 2),
      },
    ])
    .png()
    .toFile(path.join(OUT_DIR, file));
  return { scale, spriteW, spriteH };
}

async function paint(bg, file) {
  const { scaled, spriteW, spriteH } = await sprite();
  const left = Math.round((CANVAS - spriteW) / 2);
  const top = Math.round((CANVAS - spriteH) / 2);
  await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: bg },
  })
    .composite([{ input: scaled, left, top }])
    .png()
    .toFile(path.join(OUT_DIR, file));
}

async function writeHdSheet(factor) {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 8) pixels[i + 3] = 0;
  }
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .toColourspace("srgb")
    .resize(info.width * factor, info.height * factor, { kernel: "nearest" })
    .png()
    .toFile(path.join(OUT_DIR, "ladybug-sheet-hd.png"));
}

async function main() {
  await paint(CREAM, "icon.png");
  await paint(CREAM, "adaptive-icon.png");
  const notify = await silhouette(256, 0.5, "notification-icon.png");
  await silhouette(1024, 0.7, "monochrome-icon.png");
  await writeHdSheet(6);
  const { scale, spriteW, spriteH } = await sprite();
  console.log(`scale ${scale}x  sprite ${spriteW}x${spriteH}  fill ${(Math.max(spriteW, spriteH) / CANVAS).toFixed(2)}`);
  console.log(`notify ${notify.scale}x  ${notify.spriteW}x${notify.spriteH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
