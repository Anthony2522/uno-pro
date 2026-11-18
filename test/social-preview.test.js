import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createServer} from "../server.js";

const htmlSource=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const imagePath=new URL("../public/uno-pro-share.jpg",import.meta.url);

test("sharing metadata uses the requested Portuguese copy and large image",()=>{
  assert.match(htmlSource,/<title>Jogue UNO pro: o UNO melhorado<\/title>/);
  assert.match(htmlSource,/content="Jogue com amigos online e contra bots"/);
  assert.match(htmlSource,/og:image:width" content="1200"/);
  assert.match(htmlSource,/og:image:height" content="628"/);
  assert.match(htmlSource,/name="twitter:image"/);
  assert.ok(existsSync(imagePath),"Open Graph image must exist in public/");
  const jpg=readFileSync(imagePath);
  assert.equal(jpg[0],0xff);
  assert.equal(jpg[1],0xd8);
});

test("server provides crawler-readable absolute image URLs on home and room invites",async(t)=>{
  if(!existsSync(new URL("../dist/index.html",import.meta.url))){
    t.skip("requires Vite build in dist/");return;
  }
  const server=createServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  for(const route of ["/","/sala/ABC123"]){
    const response=await fetch(`http://127.0.0.1:${port}${route}`,{
      headers:{"Host":"uno-pro.example","X-Forwarded-Proto":"https"},
    });
    assert.equal(response.status,200);
    const page=await response.text();
    const imageUrl=page.match(/property="og:image" content="([^"]+)"/)?.[1];
    assert.ok(imageUrl,"Open Graph image is missing from the initial HTML");
    const parsedImage=new URL(imageUrl);
    assert.equal(parsedImage.protocol,"https:");
    assert.equal(parsedImage.pathname,"/uno-pro-share.jpg");
    const pageUrl=page.match(/property="og:url" content="([^"]+)"/)?.[1];
    assert.ok(pageUrl,"Open Graph page URL is missing from the initial HTML");
    assert.equal(new URL(pageUrl).pathname,route);
    assert.ok(page.includes('property="og:title" content="Jogue UNO pro: o UNO melhorado"'));
    assert.ok(!page.includes("__UNO_OG_IMAGE_URL__"));
  }
  const image=await fetch(`http://127.0.0.1:${port}/uno-pro-share.jpg`);
  assert.equal(image.status,200);
  assert.match(image.headers.get("content-type")||"",/image\/jpeg/);
  const bytes=new Uint8Array(await image.arrayBuffer());
  assert.equal(bytes[0],0xff);
  assert.equal(bytes[1],0xd8);
});
