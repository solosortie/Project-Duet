import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/dev-controller.js',import.meta.url),'utf8');
function load(search){const context={window:{},location:{search},URLSearchParams,performance,Date,Map,Math,Number,Promise,setTimeout,matchMedia:()=>({matches:false}),document:{addEventListener(){}}};vm.runInNewContext(source,context);return context.window.DuetDev}
test('preview is opt-in; saves are memory-only, retry-safe and failures preserve posts',async()=>{assert.equal(load(''),undefined);const d=load('?dev=1');const note={nonce:'preview-one',format:3,text:'hello'};await d.request('notes',note);await d.request('notes',note);assert.equal(d.notes.length,1);assert.equal(d.counts.aryan,4);d.fail=true;await assert.rejects(d.request('notes',{...note,nonce:'preview-two'}));assert.equal(d.notes.length,1)});
test('accelerated dates transition completed to renewal to broken',()=>{const d=load('?dev=1');d.status.aryan='complete';const time=d.now();d.setTime(time+86400000);assert.equal(d.state().streaks.aryan.today,false);assert.equal(d.status.aryan,'renew');d.setTime(time+2*86400000);assert.equal(d.state().streaks.aryan.count,0);assert.equal(d.status.aryan,'broken')});
