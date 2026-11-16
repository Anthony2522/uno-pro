// Google Identity Services sign-in. Verify signatures server-side against Google's public JWKs.
import crypto from "node:crypto";
import {RpcError,store,cleanText} from "./game.js";
let keys=null,expires=0;
export const googleClientId=()=>process.env.GOOGLE_CLIENT_ID?.trim()||"";
async function googleKeys(){
  if(keys&&Date.now()<expires)return keys;
  const response=await fetch("https://www.googleapis.com/oauth2/v3/certs",{signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw new RpcError("GOOGLE_VERIFICATION_UNAVAILABLE",503);
  const data=await response.json();
  if(!Array.isArray(data.keys))throw new RpcError("GOOGLE_VERIFICATION_UNAVAILABLE",503);
  keys=data.keys;
  const maxAge=Number(/max-age=(\d+)/.exec(response.headers.get("cache-control")||"")?.[1]||"3600");
  expires=Date.now()+Math.max(60,Math.min(maxAge,86400))*1000;
  return keys;
}
export async function verifyGoogleCredential(credential){
  const clientId=googleClientId();
  if(!clientId)throw new RpcError("GOOGLE_NOT_CONFIGURED",503);
  if(typeof credential!=="string"||credential.length>16000)throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  const parts=credential.split(".");
  if(parts.length!==3)throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  let header,payload;
  try{
    header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
  }catch{throw new RpcError("INVALID_GOOGLE_TOKEN",401)}
  if(header.alg!=="RS256"||typeof header.kid!=="string")throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  const now=Math.floor(Date.now()/1000);
  if(payload.aud!==clientId||!["accounts.google.com","https://accounts.google.com"].includes(payload.iss)||
    typeof payload.sub!=="string"||!payload.sub||typeof payload.exp!=="number"||payload.exp<=now||
    (payload.iat&&payload.iat>now+60)||payload.email_verified!==true)throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  let jwks;
  try{jwks=await googleKeys()}catch(e){if(e instanceof RpcError)throw e;throw new RpcError("GOOGLE_VERIFICATION_UNAVAILABLE",503)}
  const jwk=jwks.find(k=>k.kid===header.kid&&k.kty==="RSA"&&(!k.use||k.use==="sig"));
  if(!jwk)throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  let valid=false;
  try{
    valid=crypto.verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),
      crypto.createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url"));
  }catch{valid=false}
  if(!valid)throw new RpcError("INVALID_GOOGLE_TOKEN",401);
  return {sub:payload.sub,nickname:cleanText(payload.name||payload.given_name||"Jogador Google").slice(0,18)};
}
function tokenHash(value){return crypto.createHash("sha256").update(value).digest("hex")}
export async function googleLogin({p_credential,p_token}={}){
  const google=await verifyGoogleCredential(p_credential);
  const existing=[...store.guestsById.values()].find(g=>g.google_sub===google.sub);
  let guest=existing;
  if(!guest && p_token){
    const maybe=store.guestsByHash.get(tokenHash(p_token));
    if(maybe && !maybe.bot && (!maybe.google_sub||maybe.google_sub===google.sub))guest=maybe;
  }
  if(!guest){
    if(store.guestsById.size>=20000)throw new RpcError("SERVER_BUSY",503);
    const id=crypto.randomUUID(),name=google.nickname.length>=2?google.nickname:"Jogador Google";
    guest={id,nickname:name,last_seen:Date.now(),google_sub:google.sub};
    store.guestsById.set(id,guest);
  }
  if(guest.google_sub && guest.google_sub!==google.sub)throw new RpcError("GOOGLE_ALREADY_LINKED",409);
  guest.google_sub=google.sub;guest.last_seen=Date.now();
  const token=crypto.randomBytes(32).toString("hex");
  const hash=tokenHash(token);
  guest.tokenHash??=hash;
  store.guestsByHash.set(hash,guest);
  return {guest_id:guest.id,nickname:guest.nickname,token,google_linked:true};
}
