import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/dev-controller.js',import.meta.url),'utf8');
function load(search){const context={window:{},location:{search},URLSearchParams,performance,Date,Map,Math,Number,Promise,setTimeout,matchMedia:()=>({matches:false}),document:{addEventListener(){}}};vm.runInNewContext(source,context);return context.window.DuetDev}
test('preview is opt-in; both must post and retries do not increase the streak',async()=>{assert.equal(load(''),undefined);const d=load('?dev=1'),note={nonce:'one',format:3,text:'hello'};await d.request('notes',note);await d.request('notes',note);assert.equal(d.notes.length,1);assert.equal(d.sharedCount,3);assert.equal(d.state().shared.contributions.aryan,true);d.person='chat';await d.request('notes',{...note,nonce:'two'});assert.equal(d.sharedCount,4);assert.equal(d.state().shared.today,true);d.fail=true;await assert.rejects(d.request('notes',{...note,nonce:'three'}));assert.equal(d.notes.length,2)});
test('shared completion renews at midnight and breaks after an incomplete day',async()=>{const d=load('?dev=1');await d.request('notes',{nonce:'one',format:3,text:'hi'});d.person='chat';await d.request('notes',{nonce:'two',format:3,text:'hi'});const time=d.now();d.setTime(time+86400000);assert.equal(d.state().shared.count,4);assert.equal(d.state().shared.today,false);assert.equal(d.state().shared.contributions.chat,false);d.setTime(time+2*86400000);assert.equal(d.state().shared.count,0)});
