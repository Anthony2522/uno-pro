import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {proRpc} from "../server/pro.js";
import {store} from "../server/game.js";
const aud="google-test-client-id.apps.googleusercontent.com";
function makeJwt(privateKey,claims){
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid:"unit-test-key",typ:"JWT"})).toString("base64url");
  const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input=header+"."+payload;
  const sig=crypto.sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url");
  return input+"."+sig;
}
test("Google signed ID tokens link to same anonymous account, survive re-login, reject impostors",async()=>{
  const prior=process.env.GOOGLE_CLIENT_ID;
  const originalFetch=globalThis.fetch;
  const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=publicKey.export({format:"jwk"});
  process.env.GOOGLE_CLIENT_ID=aud;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    keys:[{...jwk,kid:"unit-test-key",use:"sig",alg:"RS256"}]
  }),{status:200,headers:{"cache-control":"public,max-age=3600","content-type":"application/json"}});
  try{
    const old=proRpc("register_guest",{p_nickname:"MinhaConta"});
    const now=Math.floor(Date.now()/1000);
    const claims={iss:"https://accounts.google.com",aud,sub:"test-google-sub",exp:now+900,iat:now-2,email_verified:true,name:"Meu Nome"};
    const jwt=makeJwt(privateKey,claims);
    const linked=await proRpc("google_login",{p_credential:jwt,p_token:old.token});
    assert.equal(linked.guest_id,old.guest_id);
    assert.equal(linked.nickname,"MinhaConta");
    assert.equal(linked.google_linked,true);
    assert.equal(proRpc("whoami",{p_token:linked.token}).google_linked,true);
    const another=await proRpc("google_login",{p_credential:jwt});
    assert.equal(another.guest_id,old.guest_id,"new login restores same Google account");
    assert.notEqual(another.token,linked.token,"fresh game session token");
    assert.equal(store.guestsById.get(old.guest_id).google_sub,"test-google-sub");
    await assert.rejects(proRpc("google_login",{
      p_credential:makeJwt(privateKey,{...claims,aud:"attacker-client.apps.googleusercontent.com"})
    }),/INVALID_GOOGLE_TOKEN/,"wrong audience rejected");
    await assert.rejects(proRpc("google_login",{
      p_credential:makeJwt(privateKey,{...claims,exp:now-60})
    }),/INVALID_GOOGLE_TOKEN/,"expired token rejected");
    await assert.rejects(proRpc("google_login",{
      p_credential:jwt.slice(0,-3)+"bad"
    }),/INVALID_GOOGLE_TOKEN/,"tampered signature rejected");
  }finally{
    if(prior===undefined)delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID=prior;
    globalThis.fetch=originalFetch;
  }
});
