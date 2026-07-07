import fs from 'node:fs';
const BASE="https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627";
const U=(cid,aid,n)=>Array.from({length:n},(_,i)=>`${BASE}/${cid}/animations/${aid}/east/${i}.png`);
const mobs={
  ashwraith:{cid:"3d41434e-c8a1-481a-9a0c-7c681ee10092",states:{
    idle:["0e1aa0fe-7326-4f3e-91b1-42096ca13f4c",4],
    walk:["c348d02b-4216-4aca-9a82-91c46475f51a",6],
    attack:["8d4ce3a4-e2fd-414c-98a5-ca74c243c5b8",9],
    hurt:["f000917e-c940-4533-a033-03990bd02543",7],
    death:["0198918b-bc7f-4ace-8196-107063850912",9]}},
  ironback:{cid:"8ef0a8b8-b05d-487a-ab3f-a6b07107975f",states:{
    idle:["a6e57399-1bd6-4663-b92c-ce1cbc268304",4],
    walk:["78ec742c-d0eb-4715-bd91-4c85f0b8645c",6],
    attack:["f6f38272-9544-4863-919c-4e1d4549e442",9],
    hurt:["50edec94-e4e1-4764-9480-9182d3cb860e",7],
    death:["323e6488-9865-4c1b-bb8c-35f42dfaa7b0",9]}},
  thornspitter:{cid:"dbbac684-b431-4bef-81be-e799679f2636",states:{
    idle:["19b5ac7c-9e43-4876-b3cb-42192d6996c5",4],
    walk:["79e80019-ade9-4890-abce-00029b14681c",6],
    attack:["ebb7cb87-39ca-4fa8-af69-71563e603520",9],
    hurt:["87965ef1-746a-4480-a42f-ccb68dfbd07a",7],
    death:["2fbe0e29-221a-4e0f-8109-73da7fc0b95f",9]}},
};
for(const [mob,{cid,states}] of Object.entries(mobs)){
  const strips={};
  for(const [st,[aid,n]] of Object.entries(states)) strips[st]=U(cid,aid,n);
  const man={mob,fw:64,strips};
  fs.writeFileSync(`/tmp/man_${mob}.json`,JSON.stringify(man));
  console.log("wrote /tmp/man_"+mob+".json states="+Object.keys(strips).join(","));
}
