import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {checklistResponse} from '../core/checklist-contract.js';
for(const id of ['home','eventos','etiquetas','gestao','treinamentos','checklist'])test(`${id} initializes its native view`,async()=>{
 const spec=JSON.parse(await fs.readFile(`core/views/${id}.json`,'utf8'));
 const {document,window:dom}=parseHTML(`<html><head></head><body>${spec.html}</body></html>`);
 const noop=()=>{};const storage={getItem:()=>null,setItem:noop,removeItem:noop};
 const location=new URL('https://example.invalid/'+spec.base);
 const session={email:'test@example.invalid',authenticated:true};
 const w={document,location,addEventListener:noop,removeEventListener:noop,matchMedia:()=>({matches:false,addEventListener:noop}),SAHMT_SHELL:{navigate:noop},SAHMT_AUTH:{getSession:()=>session,requireAccess:async()=>session,onChange:()=>noop,withPayload:x=>x,addAuthToUrl:x=>x},innerWidth:400,innerHeight:800,scrollTo:noop};w.window=w;w.parent=w;w.top=w;
 document.querySelectorAll('input,select').forEach(el=>{if(el.tagName==='SELECT')Object.defineProperty(el,'value',{value:el.querySelector('option')?.getAttribute('value')||'',writable:true,configurable:true});});
 for(const el of document.querySelectorAll('select'))Object.defineProperty(el,'selectedOptions',{get:()=>Array.from(el.options).filter(o=>o.selected)});
 const context={checklistResponse,document,window:w,location,navigator:{userAgent:'Test',onLine:true},history:{replaceState:noop,pushState:noop},console,URL,URLSearchParams,Intl,Date,JSON,Map,Set,Promise,AbortController,Event:dom.Event,CustomEvent:dom.CustomEvent,HTMLElement:dom.HTMLElement,HTMLSelectElement:dom.HTMLSelectElement,HTMLInputElement:dom.HTMLInputElement,localStorage:storage,sessionStorage:storage,setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:()=>0,cancelAnimationFrame:noop,fetch:async()=>({ok:true,json:async()=>({}),text:async()=>JSON.stringify({ok:false,message:'Test offline'})}),getComputedStyle:()=>({getPropertyValue:()=>''}),alert:noop,confirm:()=>false,crypto:globalThis.crypto};
 Object.assign(w,{setTimeout:context.setTimeout,clearTimeout:noop,setInterval:context.setInterval,clearInterval:noop,requestAnimationFrame:context.requestAnimationFrame});
 const source=(await fs.readFile(`core/views/${id}.js`,'utf8')).replace('export async function mount(ctx)', 'async function mount(ctx)').replace("(await import('../checklist-contract.js')).checklistResponse",'checklistResponse');
 const sandbox=vm.createContext(context);vm.runInContext(source,sandbox);await sandbox.mount(context);await new Promise(resolve=>setImmediate(resolve));
});
