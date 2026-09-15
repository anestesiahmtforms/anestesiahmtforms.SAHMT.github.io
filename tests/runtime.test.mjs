import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createPageScope} from '../core/runtime.js';
test('native pages isolate DOM and globals, forward visibility and release listeners',()=>{
 const dom=parseHTML('<html><body></body></html>');
 const events=new dom.window.EventTarget();
 const auth={getSession:()=>({email:'test@example.invalid',authenticated:true}),onChange:()=>()=>{}};
 const fake={SAHMT_AUTH:auth,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:fn=>setTimeout(fn,1),cancelAnimationFrame:clearTimeout,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 const previous={};for(const [k,v] of Object.entries({window:fake,document:dom.document,navigator:{},Event:dom.window.Event,history:{},cancelAnimationFrame:clearTimeout})){previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 try{
 const destinations=[];const shell={base:new URL('https://example.invalid/app/'),navigate:u=>destinations.push(u.href)};
 const make=()=>{const host=dom.document.createElement('section');dom.document.body.append(host);const root=host.attachShadow({mode:'open'}),body=dom.document.createElement('div');body.innerHTML='<span id="same">local</span>';root.append(body);return createPageScope(host,root,body,new URL('apps/checklist/',shell.base),shell);};
 const a=make(),b=make();assert.notEqual(a.document.getElementById('same'),b.document.getElementById('same'));
 a.window.customValue=42;assert.equal(b.window.customValue,undefined);assert.equal(a.window.SAHMT_AUTH.getSession().authenticated,true);
 assert.equal('serviceWorker' in a.navigator,false);
 a.window.location.href='../../';assert.deepEqual(destinations,['https://example.invalid/app/']);
 let changed=0;a.document.addEventListener('visibilitychange',()=>changed++);dom.document.dispatchEvent(new Event('visibilitychange'));assert.equal(changed,1);
 a.deactivate();assert.equal(a.document.hidden,true);assert.equal(changed,2);a.dispose();const before=changed;dom.document.dispatchEvent(new Event('visibilitychange'));assert.equal(changed,before);b.dispose();
 }finally{for(const [k,v] of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
