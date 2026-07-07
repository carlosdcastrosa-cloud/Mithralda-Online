// CAS-1779 — stitch PixelLab east-direction animation frames into horizontal
// sprite strips for the Caldera zone (CAS-1744). Frames were downloaded from the
// PixelLab MCP character-download endpoint (art generated under CAS-1778) and
// extracted to /tmp/caldera_frames/<clave>_<estado>/NNN.png.
// Output: assets/pixellab/fountains/anim/<clave>_<estado>_strip.png (canonical
// zone-mob strip dir, same convention as ashwraith/orc/skeleton).
// Reuses the puppeteer canvas stitch pattern from tools/build-strips2.mjs.
import puppeteer from "puppeteer-core";
import fs from "fs";

const findChromium = () => ["/usr/bin/chromium-browser","/usr/bin/chromium","/usr/bin/google-chrome","/snap/bin/chromium"].find(c => fs.existsSync(c)) || null;
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

const SRC = "/tmp/caldera_frames";
const OUT = "/paperclip/instances/default/projects/6e781e86-664b-4e7e-81a5-fc1d3eabbfb9/8542b0f2-5bb3-4a45-89ce-6d08dec8492b/_default/assets/pixellab/fountains/anim";

// clave -> frame size (native PixelLab canvas), states -> frame count
const CHARS = {
  calderatyrant: { fw: 188, states: { idle:4, walk:6, attack:9, hurt:7, death:9 } },
  magmabrute:    { fw: 124, states: { idle:4, walk:6, attack:9, hurt:7, death:9 } },
  emberkin:      { fw: 120, states: { idle:4, walk:6, attack:9, hurt:7, death:9 } },
};

const browser = await puppeteer.launch({ executablePath: exe, headless: true,
  args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process"] });
const page = await browser.newPage();

for (const [clave, { fw, states }] of Object.entries(CHARS)) {
  for (const [state, n] of Object.entries(states)) {
    const dir = `${SRC}/${clave}_${state}`;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const fp = `${dir}/${String(i).padStart(3,"0")}.png`;
      if (!fs.existsSync(fp)) { console.error(`MISSING ${fp}`); process.exit(1); }
      frames.push(`data:image/png;base64,${fs.readFileSync(fp).toString("base64")}`);
    }
    const stripW = fw * n;
    await page.setViewport({ width: stripW, height: fw });
    const b64 = await page.evaluate(async (frames, fw, stripW) => {
      const c = document.createElement("canvas"); c.width = stripW; c.height = fw;
      const ctx = c.getContext("2d"); ctx.clearRect(0,0,stripW,fw);
      for (let i=0;i<frames.length;i++) await new Promise((res,rej)=>{
        const img=new Image(); img.onload=()=>{ ctx.drawImage(img,0,0,fw,fw,i*fw,0,fw,fw); res(); }; img.onerror=rej; img.src=frames[i];
      });
      return c.toDataURL("image/png").split(",")[1];
    }, frames, fw, stripW);
    const out = `${OUT}/${clave}_${state}_strip.png`;
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
    console.log(`✔ ${clave}_${state}_strip.png  ${stripW}×${fw}  (${n}f @ ${fw}px)`);
  }
}
await browser.close();
