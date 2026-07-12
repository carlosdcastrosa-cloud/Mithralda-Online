// CAS-1745 — build strip manifests for the 3 Caldera characters (emberkin/magmabrute/calderatyrant).
// EAST-only frames (engine renders single-facing + hflip, pattern CAS-1699). fw 64 mobs / 96 boss.
import fs from 'node:fs';
const BASE="https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627";
const U=(cid,aid,n)=>Array.from({length:n},(_,i)=>`${BASE}/${cid}/animations/${aid}/east/${i}.png`);
const chars={
  emberkin:{cid:"ad67743e-311d-4043-a6e1-5b5dd5dd0239",fw:64,states:{
    idle:["92b54560-3b8a-40d3-a583-21ff21f55433",4],
    walk:["fef23fee-a2b3-45a0-81a1-b0202485c15f",6],
    attack:["2c54f298-3005-462f-a6e9-fc36f71e9ab1",9],
    hurt:["99a5bc43-0b16-4a2c-8424-3bfaa79ccb35",7],
    death:["60482c15-b3db-4328-afb7-d99317cf836e",9]}},
  magmabrute:{cid:"779988df-d23d-494d-b6c6-88809f8c87fa",fw:64,states:{
    idle:["d041c2e9-358f-4e62-a12b-a047fca331e9",4],
    walk:["a77f3dc7-326a-4f88-b2ee-0cb2bf1f667d",6],
    attack:["af9a5493-1fcd-48bb-af45-6672ca5acd67",9],
    hurt:["2235742e-9bc7-4db9-a9ac-c768d136ffca",7],
    death:["4d71a32b-631c-40f0-b274-20af16d6d0be",9]}},
  calderatyrant:{cid:"ffe50f75-ab2c-4ae5-80d5-0224aab713e0",fw:96,states:{
    idle:["d1ec4f9c-4a04-4c02-b1c9-b454c3b7147c",4],
    walk:["ff92f98c-aada-4524-8066-1565be4b4e6c",6],
    attack:["73e62e07-6ec8-4f47-ba04-a3ab7794e7c6",9],
    hurt:["69458658-c546-4d16-9713-329bb426680c",7],
    death:["a876d5d8-fb3d-4bcf-9bf2-d9f672ba946b",9]}},
};
for(const [mob,{cid,fw,states}] of Object.entries(chars)){
  const strips={};
  for(const [st,[aid,n]] of Object.entries(states)) strips[st]=U(cid,aid,n);
  fs.writeFileSync(`/tmp/man_${mob}.json`,JSON.stringify({mob,fw,strips}));
  console.log(`wrote /tmp/man_${mob}.json fw=${fw} states=${Object.keys(strips).join(",")}`);
}
