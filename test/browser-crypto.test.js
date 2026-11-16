import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {createHash,randomInt,randomBytes} from "../src/lib/uno/browserCrypto.js";

test("browser shim SHA-256 is byte-for-byte compatible with Node auth hashes",()=>{
  for(const value of ["", "abc", "um-token-de-64-caracteres-"+"a".repeat(40), "ação 💙 こんにちは","x".repeat(1000)]){
    assert.equal(createHash("sha256").update(value).digest("hex"),
      crypto.createHash("sha256").update(value).digest("hex"));
  }
});
test("browser randomInt stays inside bound and generated sessions look valid",()=>{
  for(let bound=1;bound<=128;bound++)for(let i=0;i<10;i++){
    const got=randomInt(bound);
    assert.ok(Number.isInteger(got)&&got>=0&&got<bound);
  }
  assert.match(randomBytes(32).toString("hex"),/^[0-9a-f]{64}$/);
});
