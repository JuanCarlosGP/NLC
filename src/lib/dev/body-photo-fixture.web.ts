import { BODY_POSES, type BodyPose } from "@/lib/health/body-photos/model";
import { bodyStore } from "@/lib/health/body-photos/storage";
import { prepareBodyFile } from "@/lib/health/body-photos/picker.web";
import { localDateKey, shiftDateKey } from "@/lib/health/weight/model";
import { requireLocalDemo } from "./local-demo";

// Code-drawn illustrations, explicitly labeled. No personal or remote photos.
async function illustration(pose: BodyPose, phase: number): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 640;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1c1a17"; ctx.fillRect(0, 0, 480, 640);
  ctx.strokeStyle = "#35302a"; ctx.lineWidth = 1;
  for (let x = 40; x < 480; x += 40) { ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, 580); ctx.stroke(); }
  for (let y = 100; y < 600; y += 40) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(450, y); ctx.stroke(); }
  ctx.fillStyle = "#e4d5b8"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.fillText("ILUSTRACIÓN DE PRUEBA", 240, 40);
  ctx.fillStyle = "#a49c91"; ctx.font = "15px sans-serif"; ctx.fillText(`Día ${phase ? "B" : "A"} · ${pose}`, 240, 67);
  ctx.fillStyle = "#b4a38f"; ctx.beginPath(); ctx.ellipse(240, 160, 32, 39, 0, 0, Math.PI * 2); ctx.fill();
  const side = pose === "left" || pose === "right";
  ctx.fillStyle = phase ? "#91aaa4" : "#d0b88f";
  ctx.beginPath(); ctx.moveTo(side ? 222 : 188, 215); ctx.lineTo(side ? 258 : 292, 215); ctx.lineTo(side ? 270 : 280, 365); ctx.lineTo(side ? 218 : 200, 365); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#b4a38f"; ctx.lineWidth = 22; ctx.lineCap = "round";
  for (const offset of side ? [8] : [-58, 58]) { ctx.beginPath(); ctx.moveTo(240 + offset, 235); ctx.lineTo(240 + offset + (offset < 0 ? -16 : 16), 390); ctx.stroke(); }
  ctx.strokeStyle = "#7d8188"; ctx.lineWidth = 32;
  for (const offset of side ? [0, 8] : [-24, 24]) { ctx.beginPath(); ctx.moveTo(240 + offset, 370); ctx.lineTo(240 + offset + (offset < 0 ? -12 : 12), 535); ctx.stroke(); }
  ctx.fillStyle = "#e4d5b8"; ctx.font = "15px sans-serif"; ctx.fillText("Datos ficticios · no es una foto personal", 240, 608);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Demo illustration failed")), "image/png"));
}
export async function seedBodyPhotoDemo(): Promise<void> {
  requireLocalDemo();
  let entries = await bodyStore.list();
  for (const [phase, offset] of [-30, -7].entries()) {
    let date = shiftDateKey(localDateKey(), offset);
    while (entries.some((entry) => entry.date === date && !entry.note.startsWith("Ilustración de prueba"))) date = shiftDateKey(date, -1);
    let entry = entries.find((row) => row.date === date);
    if (!entry) { entries = await bodyStore.save(date, `Ilustración de prueba ${phase ? "B" : "A"}. Sin fotografías personales.`); entry = entries.find((row) => row.date === date)!; }
    for (const pose of BODY_POSES) {
      if (entry.photos[pose]) continue;
      const picked = await prepareBodyFile(await illustration(pose, phase));
      try { entries = await bodyStore.setPhoto(entry.id, pose, picked); entry = entries.find((row) => row.id === entry!.id)!; }
      finally { await picked.dispose(); }
    }
  }
}
