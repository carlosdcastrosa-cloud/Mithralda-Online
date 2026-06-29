// CAS-254 — verify montage: lay out every frame of the 4 rebuilt warrior strips on a
// grid with a FOOT baseline + ANCHOR_X centre guide so we can eyeball that the extended
// Clarice figure is planted (feet on 163), centred (col 65), and never clipped.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163;
const STRIPS = [
  { f: "warrior.png", fc: 6, label: "idle" },
  { f: "warrior_walk.png", fc: 8, label: "walk" },
  { f: "warrior_attack.png", fc: 6, label: "attack" },
  { f: "warrior_death.png", fc: 6, label: "death" },
];
const b64 = {};
for (const s of STRIPS) b64[s.f] = readFileSync(join(DIR, s.f)).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const dataUrl = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, STRIPS } = CFG;
  const maxFc = Math.max(...STRIPS.map(s => s.fc));
  const cv = document.createElement("canvas");
  cv.width = maxFc * CELL_W; cv.height = STRIPS.length * CELL_H;
  const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false;
  cx.fillStyle = "#202030"; cx.fillRect(0, 0, cv.width, cv.height);
  for (let r = 0; r < STRIPS.length; r++) {
    const s = STRIPS[r];
    const img = new Image(); img.src = "data:image/png;base64," + b64[s.f]; await img.decode();
    for (let j = 0; j < s.fc; j++) {
      const dx = j * CELL_W, dy = r * CELL_H;
      // checker bg so transparency is visible
      cx.fillStyle = (j % 2) ? "#2a2a3a" : "#33334a"; cx.fillRect(dx, dy, CELL_W, CELL_H);
      cx.drawImage(img, j * CELL_W, 0, CELL_W, CELL_H, dx, dy, CELL_W, CELL_H);
      // guides
      cx.strokeStyle = "rgba(0,255,120,0.5)"; cx.beginPath();
      cx.moveTo(dx, dy + FOOT + 0.5); cx.lineTo(dx + CELL_W, dy + FOOT + 0.5); cx.stroke();
      cx.strokeStyle = "rgba(120,180,255,0.5)"; cx.beginPath();
      cx.moveTo(dx + ANCHOR_X + 0.5, dy); cx.lineTo(dx + ANCHOR_X + 0.5, dy + CELL_H); cx.stroke();
    }
    cx.fillStyle = "#fff"; cx.font = "14px sans-serif"; cx.fillText(s.label, 4, r * CELL_H + 16);
  }
  return cv.toDataURL("image/png");
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, STRIPS });
writeFileSync(join(ROOT, "tools", "cas254-verify.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log("wrote tools/cas254-verify.png");
