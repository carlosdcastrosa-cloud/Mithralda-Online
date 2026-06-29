// CAS-253 — Slice PixelLab-native class characters into game-ready strips.
// Sources: per-frame south animation PNGs from PixelLab (backblaze public URLs).
// Target: assets/erw/hero/classes/<cls>{,_walk,_attack,_death}.png
//   cell geometry: 140×166, anchorX=65, foot=163 (must match render.js CLASS_FW/FH/AX/FOOT)
//   idle=6f  walk=8f  attack=6f  death=6f  (CLASS_FC / CLASS_WALK_FC / CLASS_ATTACK_FC / CLASS_DEATH_FC)
//
// Run:   node tools/cas253-class-slice.mjs [--dry-run] [--class druid,priest,mage,paladin]
//
// Strategy: each PixelLab animation frame is already a 180×180 sprite sheet ROW of 1 frame
// (the character is centered on a 180px canvas). We:
//  1. Fetch each frame URL → data URL inside the puppeteer page.
//  2. Compute the tight bounding box of non-transparent pixels across all frames (south only).
//  3. Scale + anchor into the 140×166 cell (anchorX=65 = horizontal centre, foot=163 = feet Y).
//  4. Resample the source frame count to the required output count (e.g. 4-frame idle → 6 cells).
//  5. Write strip PNG.
//
// PixelLab animation state map (character IDs from CAS-253):
//   mage    92b13fdc-88c4-4e2f-a47e-980b78383f98
//   paladin bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a
//   druid   56d8490b-8d55-464a-a5de-d50d48a43184
//   priest  18d8c76c-7361-4a82-8d6d-e0dd4cccb910
//
// The script READS animation frame URLs from ANIM_MANIFEST below.  Update that map each
// heartbeat as new animations complete (poll get_character, copy frame URLs here).

import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT  = join(ROOT, "assets", "erw", "hero", "classes");
const DRY  = process.argv.includes("--dry-run");
const ONLY = (() => { const i = process.argv.indexOf("--class"); return i>=0 ? process.argv[i+1].split(",") : null; })();

// ---- cell geometry (matches render.js) ----
const CELL_W   = 140;
const CELL_H   = 166;
const ANCHOR_X = 65;   // horizontal centre of figure in the cell
const FOOT     = 163;  // Y of feet in the cell
const FIGURE_H = 155;  // target figure height in pixels (slightly shorter than cell to leave headroom)

// ---- output frame counts (matches render.js CLASS_*_FC) ----
const OUT_FC = { idle: 6, walk: 8, attack: 6, death: 6 };

// ---- PixelLab south animation frame URLs per class ----
// Update these as animations complete.  "null" = not yet available → skip that state.
const ANIM_MANIFEST = {
  druid: {
    charId: "56d8490b-8d55-464a-a5de-d50d48a43184",
    idle: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d74a4296-4b82-481b-82c8-760e4b2685f5/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d74a4296-4b82-481b-82c8-760e4b2685f5/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d74a4296-4b82-481b-82c8-760e4b2685f5/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d74a4296-4b82-481b-82c8-760e4b2685f5/south/3.png",
    ],
    walk: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/3519035d-2d01-42c0-90f2-5bdb75345ee5/south/5.png",
    ],
    attack: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/5.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/56d8490b-8d55-464a-a5de-d50d48a43184/animations/d66352ec-6bda-49e9-9c92-13852f8b1dc1/south/6.png",
    ],
    death:  null, // pending ~332s
  },
  priest: {
    charId: "18d8c76c-7361-4a82-8d6d-e0dd4cccb910",
    idle: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/5947404f-e08c-4200-9da5-9cdb9d86dbeb/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/5947404f-e08c-4200-9da5-9cdb9d86dbeb/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/5947404f-e08c-4200-9da5-9cdb9d86dbeb/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/5947404f-e08c-4200-9da5-9cdb9d86dbeb/south/3.png",
    ],
    walk: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/0396f3ee-6354-4274-bf97-4b24b63b7fbf/south/5.png",
    ],
    attack: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/5.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/18d8c76c-7361-4a82-8d6d-e0dd4cccb910/animations/89ff5918-b3d4-40df-820d-b1909d391bbf/south/6.png",
    ],
    death:  null, // pending ~204s
  },
  mage: {
    charId: "92b13fdc-88c4-4e2f-a47e-980b78383f98",
    idle: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/51525263-5498-4c2b-9593-e4aea721200a/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/51525263-5498-4c2b-9593-e4aea721200a/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/51525263-5498-4c2b-9593-e4aea721200a/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/51525263-5498-4c2b-9593-e4aea721200a/south/3.png",
    ],
    walk: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/c0440edf-4571-41d0-827d-a4addb14a997/south/5.png",
    ],
    attack: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/5.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/92b13fdc-88c4-4e2f-a47e-980b78383f98/animations/4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6/south/6.png",
    ],
    death:  null, // pending ~228s
  },
  paladin: {
    charId: "bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a",
    idle: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/c668ed82-193d-42c6-879a-a4fbbfed7f21/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/c668ed82-193d-42c6-879a-a4fbbfed7f21/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/c668ed82-193d-42c6-879a-a4fbbfed7f21/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/c668ed82-193d-42c6-879a-a4fbbfed7f21/south/3.png",
    ],
    walk: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/9e473fd9-9086-44d7-be48-99de53743797/south/5.png",
    ],
    attack: [
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/0.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/1.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/2.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/3.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/4.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/5.png",
      "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a/animations/685bdb78-6f37-4e2e-88d2-df30da8fafb4/south/6.png",
    ],
    death:  null, // pending ~202s
  },
};

// ---- slice a single animation state into a multi-frame strip ----
// frameUrls: array of PNG URL strings (1 URL per source frame, loaded in browser)
// outN: target cell count
// All bounding-box / scale math runs inside page.evaluate for canvas access.
async function sliceState(page, frameUrls, outN, { cellW, cellH, anchorX, foot, figureH }) {
  const dataUrls = await page.evaluate(async (urls) => {
    const results = [];
    for (const url of urls) {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      results.push(dataUrl);
    }
    return results;
  }, frameUrls);

  return await page.evaluate(async (dataUrls, outN, cfg) => {
    const { cellW, cellH, anchorX, foot, figureH } = cfg;

    // load all source frames as ImageBitmap
    async function loadImg(dataUrl) {
      return new Promise((res, rej) => {
        const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = dataUrl;
      });
    }
    const imgs = await Promise.all(dataUrls.map(loadImg));
    const srcN = imgs.length;

    // measure tight bbox across ALL frames (to get a stable scale)
    let minY = 9999, maxY = 0, minX = 9999, maxX = 0;
    for (const img of imgs) {
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 12) {
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
      }
    }
    const figH = maxY - minY + 1;
    const figCx = (minX + maxX) / 2;
    const scale = Math.min(figureH / figH, 2.0); // cap at 2x
    const sw = imgs[0].naturalWidth, sh = imgs[0].naturalHeight;

    // build output strip
    const strip = document.createElement("canvas");
    strip.width = cellW * outN; strip.height = cellH;
    const sx = strip.getContext("2d"); sx.imageSmoothingEnabled = false;

    for (let j = 0; j < outN; j++) {
      const srcIdx = outN === srcN ? j : Math.min(srcN - 1, Math.floor(j * srcN / outN));
      const img = imgs[srcIdx];
      const dW = Math.round(sw * scale);
      const dH = Math.round(sh * scale);
      const dx = j * cellW + anchorX - Math.round(figCx * scale);
      const dy = foot - Math.round(maxY * scale);
      sx.drawImage(img, dx, dy, dW, dH);
    }
    return strip.toDataURL("image/png");
  }, dataUrls, outN, { cellW, cellH, anchorX, foot, figureH });
}

// ---- main ----
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
page.on("console", m => { if (m.type() === "error") console.error("  [page]", m.text()); });

const STATES = { idle: "", walk: "_walk", attack: "_attack", death: "_death" };
const geom = { cellW: CELL_W, cellH: CELL_H, anchorX: ANCHOR_X, foot: FOOT, figureH: FIGURE_H };

let totalWritten = 0;
const skipped = [];

for (const [cls, manifest] of Object.entries(ANIM_MANIFEST)) {
  if (ONLY && !ONLY.includes(cls)) continue;

  const clsReady = Object.entries(STATES).every(([st]) => manifest[st] !== null || st === "attack" || st === "death");
  // we write what we have; skip individual states that are null
  for (const [state, suffix] of Object.entries(STATES)) {
    const frames = manifest[state];
    if (!frames) { skipped.push(`${cls}.${state}`); continue; }
    const outPath = join(OUT, cls + suffix + ".png");
    if (DRY) { console.log(`[dry-run] would write ${outPath} (${frames.length}→${OUT_FC[state]} frames)`); continue; }

    process.stdout.write(`  slicing ${cls} ${state} (${frames.length}→${OUT_FC[state]}f)... `);
    const dataUrl = await sliceState(page, frames, OUT_FC[state], geom);
    const buf = Buffer.from(dataUrl.split(",")[1], "base64");
    writeFileSync(outPath, buf);
    totalWritten += buf.length;
    console.log(`${(buf.length/1024).toFixed(1)}KB → ${outPath}`);
  }
}

await browser.close();

if (skipped.length) console.log(`\nskipped (anims pending): ${skipped.join(", ")}`);
console.log(`\nwrote ${(totalWritten/1024|0)}KB total${DRY?" (dry-run, nothing written)":""}.`);
if (!DRY) console.log("Next: commit + redeploy, then hand to QA like CAS-252.");
