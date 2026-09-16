// Public production client settings only; no secrets fetched or printed.
import {build} from 'vite';import assert from 'node:assert/strict';
const r=await fetch('https://rnsolutions.net/northgate/');assert.equal(r.status,200);
const html=await r.text(),asset=html.match(/src="([^"]+\.js)"/)?.[1];assert.ok(asset?.startsWith('/northgate/assets/'));
const response=await fetch(new URL(asset,'https://rnsolutions.net'));assert.equal(response.status,200);const source=await response.text();
const pk=source.match(/pk_live_[A-Za-z0-9=]+/)?.[0],url='https://keogysnoukbendfkfjcn.supabase.co';
const keys=source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[];
const anon=source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]||keys.find(key=>{try{const p=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='keogysnoukbendfkfjcn';}catch{return false;}});
assert.ok(pk&&anon&&source.includes(url),'Public production configuration missing');
Object.assign(process.env,{VITE_CLERK_PUBLISHABLE_KEY:pk,VITE_SUPABASE_ANON_KEY:anon,VITE_SUPABASE_URL:url,VITE_BASE_PATH:'/northgate'});
await build({build:{outDir:'.temp/estimating-release-20260916',emptyOutDir:false}});
