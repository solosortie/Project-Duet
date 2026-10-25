import { validateNote } from './validate.js';
import { dbNonce, publicNote } from './util.js';
const result=(status,data)=>({status,data});
export function streakState(rows,now=Date.now(),offset=19800,timezone='Asia/Kolkata'){
 const today=Math.floor((now/1000+offset)/86400),streaks={};for(const author of ['aryan','chat']){const days=new Set(rows.filter(r=>r.author===author).map(r=>r.day));let day=days.has(today)?today:today-1,count=0;while(days.has(day)){count++;day--}streaks[author]={count,today:days.has(today)}}const byPerson=Object.fromEntries(['aryan','chat'].map(p=>[p,new Set(rows.filter(r=>r.author===p).map(r=>r.day))]));const common=new Set([...byPerson.aryan].filter(day=>byPerson.chat.has(day)));let cursor=common.has(today)?today:today-1,count=0;while(common.has(cursor)){count++;cursor--}const shared={count,today:common.has(today),contributions:{aryan:byPerson.aryan.has(today),chat:byPerson.chat.has(today)},lastCompletedDay:common.size?Math.max(...common):null};return {now,timezone,day:today,streaks,shared,lastDays:Object.fromEntries(['aryan','chat'].map(a=>{const days=rows.filter(r=>r.author===a).map(r=>r.day);return [a,days.length?Math.max(...days):null]}))};
}
function unpack(s){if(!s||![2,3].includes(s.stride)||!Array.isArray(s.points)||s.points.length%s.stride||s.points.length>4000*s.stride)return null;const points=[];for(let i=0;i<s.points.length;i+=s.stride){const p=[s.points[i],s.points[i+1]];if(s.stride===3&&s.points[i+2]!==null)p.push(s.points[i+2]);points.push(p)}return {tool:s.tool,color:s.color,width:s.width,points}}
export async function uploadPost(path,data,person,env,room){
 if(!person)return result(403,{error:'Choose your name first.'});if(data.author!==person)return result(409,{error:'Your identity changed. Close this draft and choose your name again.'});
 const id=data.upload;if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))return result(400,{error:'Invalid drawing upload.'});
 const row=await env.DB.prepare('SELECT * FROM uploads WHERE id=? AND room_id=?').bind(id,room.id).first();
 if(path==='/api/uploads'){
  const {nonce,paper,text_size:size,total}=data;if(typeof nonce!=='string'||nonce.length<8||nonce.length>80||!['cream','rose','sage','blue'].includes(paper)||![32,40,52].includes(size)||!Number.isInteger(total)||total<1||total>500)return result(400,{error:'Invalid drawing upload.'});
  if(row&&(row.author!==person||row.nonce!==nonce||row.paper!==paper||row.text_size!==size||row.total!==total))return result(409,{error:'This upload differs from the saved draft.'});
  const stale="SELECT u.id FROM uploads u WHERE u.room_id=? AND u.author=? AND u.created<? AND NOT EXISTS(SELECT 1 FROM notes n WHERE n.format=4 AND json_extract(n.drawing,'$.upload')=u.id)";const cutoff=Date.now()/1000-7*86400;
  await env.DB.batch([env.DB.prepare('DELETE FROM drawing_chunks WHERE upload IN ('+stale+')').bind(room.id,person,cutoff),env.DB.prepare('DELETE FROM uploads WHERE id IN ('+stale+')').bind(room.id,person,cutoff)]);
  await env.DB.prepare('INSERT OR IGNORE INTO uploads(id,author,nonce,paper,text_size,total,created,room_id) VALUES(?,?,?,?,?,?,?,?)').bind(id,person,nonce,paper,size,total,Date.now()/1000,room.id).run();return result(200,{ok:true});
 }
 if(!row||row.author!==person)return result(404,{error:'Drawing upload not found.'});
 if(path==='/api/uploads/chunk'){
  if(!Number.isInteger(data.part)||data.part<0||data.part>=row.total||!Array.isArray(data.drawing)||!data.drawing.length||data.drawing.length>40)return result(400,{error:'Invalid drawing segment.'});
  const drawing=data.drawing.map(unpack);const check=validateNote({nonce:row.nonce,format:2,drawing,paper:row.paper,text_size:row.text_size},person);if(!check.note)return result(400,{error:'Invalid drawing segment.'});
  const packed=JSON.stringify(data.drawing);if(packed.length>180000)return result(413,{error:'Drawing segment is too large.'});
  const previous=await env.DB.prepare('SELECT data FROM drawing_chunks WHERE upload=? AND part=?').bind(id,data.part).first();if(previous&&previous.data!==packed)return result(409,{error:'Drawing segment changed. Your draft is kept.'});
  await env.DB.prepare('INSERT OR IGNORE INTO drawing_chunks VALUES(?,?,?,?)').bind(id,data.part,packed,drawing.length).run();return result(200,{ok:true});
 }
 if(path!=='/api/uploads/commit')return result(404,{error:'Not found.'});
 const counts=await env.DB.prepare('SELECT count(*) n,sum(strokes) strokes FROM drawing_chunks WHERE upload=?').bind(id).first();if(counts.n!==row.total||counts.strokes<1||counts.strokes>500)return result(400,{error:'Drawing is incomplete. Try saving again; your draft is kept.'});
 const manifest={upload:id,chunks:row.total},key=dbNonce(room.id,row.nonce);const previous=await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(key).first();
 if(previous&&previous.author!==person)return result(409,{error:'This draft belongs to the other person.'});
 if(previous&&(previous.format!==4||JSON.parse(previous.drawing).upload!==id))return result(409,{code:'draft_changed',note:{...publicNote(previous),drawing:JSON.parse(previous.drawing)},error:'The earlier version was saved. Stick again to save these changes as a new note.'});
 await env.DB.prepare('INSERT OR IGNORE INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size,room_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,person,person==='aryan'?'chat':'aryan','',JSON.stringify(manifest),row.paper,Date.now()/1000,4,row.text_size,room.id).run();
 const saved=await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(key).first();if(saved.format!==4||JSON.parse(saved.drawing).upload!==id)return result(409,{code:'draft_changed',note:{...publicNote(saved),drawing:JSON.parse(saved.drawing)},error:'The earlier version was saved. Stick again to save these changes as a new note.'});return result(201,{ok:true,note:{...publicNote(saved),drawing:JSON.parse(saved.drawing)}});
}
