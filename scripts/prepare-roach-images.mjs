// Build the exact user-supplied Barata images from small Git binary blobs.
// WebP keeps the transparent backgrounds and makes offline caching inexpensive.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const root=process.cwd();
const assets=[
  {
    output:"roach-top.webp",size:5780,
    sha256:"6b9f0dcb9bc485228b09e983cd3a7e351bad2d029cf637bc297449d1e650ebbf",
    pieces:["top-00.bin","top-01.bin","top-02a.bin","top-02b.bin","top-02c.bin","top-02d.bin","top-03.bin","top-04.bin"]
  },
  {
    output:"roach-front.webp",size:10360,
    sha256:"5c3c486ac19e9dea51e53b79001be6e661534f878ec926d0ced5125de04446d0",
    pieces:["front-00.bin","front-01.bin","front-02.bin","front-03.bin","front-04.bin","front-05.bin","front-06.bin"]
  }
];

for(const asset of assets){
  const body=Buffer.concat(asset.pieces.map(name=>fs.readFileSync(path.join(root,"assets/roach",name))));
  const digest=createHash("sha256").update(body).digest("hex");
  if(body.length!==asset.size||digest!==asset.sha256||
      body.toString("ascii",0,4)!=="RIFF"||body.toString("ascii",8,12)!=="WEBP")
    throw Error("Barata asset mismatch: "+asset.output+" bytes="+body.length+" sha256="+digest);
  const target=path.join(root,"public",asset.output);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,body);
  console.log("Prepared "+asset.output+" ("+body.length+" bytes)");
}
