// Build additional sprite strips from purchased Beat 'em Up VFX packs
// Targets: heal (e21/pack5), thorn (e22/pack5), arcane (e27/pack5), spark (e28/pack1)
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const findChromium = () => {
  const candidates = ["/usr/bin/chromium-browser","/usr/bin/chromium","/usr/bin/google-chrome","/snap/bin/chromium"];
  return candidates.find(c => fs.existsSync(c)) || null;
};

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

const STRIPS = [
  { name:"heal",   pack:"pack5", effect:21, n:5,  fw:64  },
  { name:"thorn",  pack:"pack5", effect:22, n:8,  fw:128 },
  { name:"arcane", pack:"pack5", effect:27, n:16, fw:64  },
  { name:"spark",  pack:"pack1", effect:28, n:9,  fw:96  },
];

const browser = await puppeteer.launch({ executablePath: exe, headless: true,
  args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process"] });

const page = await browser.newPage();

for (const {name, pack, effect, n, fw} of STRIPS) {
  // Load frames as base64
  const frames = [];
  for (let i = 1; i <= n; i++) {
    const fpath = `/tmp/png/${pack}/Effect (${effect})${i}.png`;
    if (!fs.existsSync(fpath)) { console.error(`Missing: ${fpath}`); continue; }
    const b64 = fs.readFileSync(fpath).toString("base64");
    frames.push(`data:image/png;base64,${b64}`);
  }
  if (frames.length !== n) { console.error(`${name}: expected ${n} frames, got ${frames.length}`); continue; }

  const stripW = fw * n;
  await page.setViewport({ width: stripW, height: fw });

  const stripB64 = await page.evaluate(async (frames, fw, n, stripW) => {
    const canvas = document.createElement("canvas");
    canvas.width = stripW; canvas.height = fw;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, stripW, fw);
    for (let i = 0; i < frames.length; i++) {
      await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0, fw, fw, i * fw, 0, fw, fw); res(); };
        img.onerror = rej;
        img.src = frames[i];
      });
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, frames, fw, n, stripW);

  const outPath = `/paperclip/instances/default/projects/6e781e86-664b-4e7e-81a5-fc1d3eabbfb9/8542b0f2-5bb3-4a45-89ce-6d08dec8492b/_default/assets/fx/${name}_strip.png`;
  fs.writeFileSync(outPath, Buffer.from(stripB64, "base64"));
  console.log(`✔ ${name}_strip.png  ${stripW}×${fw} (${n} frames, fw=${fw})`);
}

await browser.close();
console.log("done");
process.exit(0);
