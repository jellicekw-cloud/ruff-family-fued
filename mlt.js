/* ============ Most Likely To ============
   Everybody votes for someone in the room. Vote with the majority = +100.
   TV owns the state (S.m). Phones send 'wact' {a:'vote',to}. Host sends cmd 'm…'. */

const MLT={rounds:10,secs:25,pts:100};
const MLT_STARTER=[
 'Who\'s most likely to be "Looking for Logan"? 👀',
 'Who\'s most likely to yell "What\'s burning?!"',
 'Who\'s most likely to miss their flight?',
 'Who\'s most likely to take a plate home without asking?',
 'Who\'s most likely to be on the back porch right now? 🥃',
 'Who\'s most likely to give Jae her first grandbaby? 👶',
 'Who\'s most likely to fall asleep first tonight?',
 'Who\'s most likely to lose their charger on a trip?',
 'Who\'s most likely to break up and make up in the same day?',
 'Who\'s most likely to retire to another country?',
 'Who\'s most likely to show up late to their own party?',
 'Who\'s most likely to start an argument at dinner?',
 'Who\'s most likely to eat the last piece of pie and deny it?',
 'Who\'s most likely to talk their way into first class?',
 'Who\'s most likely to still be dancing at 2am?',
 'Who\'s most likely to go viral for the wrong reason?',
 'Who\'s most likely to win the lottery and tell nobody?',
 'Who\'s most likely to get us kicked out of a restaurant?',
 'Who\'s most likely to cry at a movie?',
 'Who\'s most likely to survive a zombie apocalypse?',
 'Who\'s most likely to forget whose birthday it is?',
 'Who\'s most likely to say "I\'m on my way" while still in bed?'
];
const mltPrompts=Q=>{const db=Q.filter(q=>q.section==='mlt').sort((a,b)=>a.position-b.position).map(q=>({id:q.id,text:q.prompt}));
  return db.length?db:MLT_STARTER.map((t,i)=>({id:'ms'+i,text:t}))};
async function ensureMLT(Q){
  if(Q.some(q=>q.section==='mlt'))return 0;
  const base=Math.max(0,...Q.map(q=>q.position||0))+1;
  const rows=MLT_STARTER.map((t,i)=>({position:base+i,section:'mlt',prompt:t,kind:'open',max_answers:1,options:[],answers:[],decoys:[],use_survey:false,merges:{},labels:{}}));
  const {error}=await sb.from('feud_questions').insert(rows);if(error){toast('Could not add Most Likely To questions: '+error.message);return 0}
  return rows.length;
}
async function saveMLTList(Q,lines){
  const want=lines.map(s=>s.trim()).filter(Boolean),cur=Q.filter(q=>q.section==='mlt');
  for(const q of cur)if(!want.includes(q.prompt))await sb.from('feud_questions').delete().eq('id',q.id);
  const base=Math.max(0,...Q.map(q=>q.position||0))+1;
  for(let i=0;i<want.length;i++){const ex=cur.find(q=>q.prompt===want[i]);
    if(ex)await sb.from('feud_questions').update({position:base+i}).eq('id',ex.id);
    else await sb.from('feud_questions').insert({position:base+i,section:'mlt',prompt:want[i],kind:'open',max_answers:1,options:[],answers:[],decoys:[],use_survey:false,merges:{},labels:{}})}
}

/* ---------- TV engine ---------- */
function makeMLT(api){
  const {S:getS,push,setEv,P,loadQ}=api;
  const M=()=>getS().m;
  const fresh=()=>({round:0,used:[],q:null,votes:{},stage:'idle',endsAt:0,pts:{},crowns:{},top:[],tally:[],gained:[]});
  const voters=()=>getS().order.filter(id=>P(id));
  const teamScore=t=>{const S=getS(),m=M();return voters().filter(id=>P(id).team===t).reduce((n,id)=>n+(m.pts[id]||0),0)};
  async function start(qid){
    const S=getS();if(!S.m||S.m.stage==='over')S.m=fresh();
    if(S.m.round&&S.phase!=='mlt'&&S.m.stage==='vote'){S.phase='mlt';return push()}
    const m=S.m,Q=await loadQ(),all=mltPrompts(Q),left=all.filter(p=>!m.used.includes(p.id));
    const p=(qid&&all.find(x=>x.id===qid))||left[Math.floor(Math.random()*left.length)]||all[0];if(!p)return toast('No questions yet');
    m.round++;m.used.push(p.id);m.q={id:p.id,text:p.text};m.votes={};m.top=[];m.tally=[];m.gained=[];m.stage='vote';m.endsAt=Date.now()+MLT.secs*1000;
    S.phase='mlt';setEv('none');push();
  }
  function reveal(){
    const m=M();if(m.stage!=='vote')return;const c={};
    Object.values(m.votes).forEach(t=>{if(P(t))c[t]=(c[t]||0)+1});
    m.tally=Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([id,n])=>({id,n}));
    const best=m.tally.length?m.tally[0].n:0;m.top=m.tally.filter(x=>x.n===best).map(x=>x.id);
    m.gained=Object.keys(m.votes).filter(v=>m.top.includes(m.votes[v]));
    m.gained.forEach(v=>m.pts[v]=(m.pts[v]||0)+MLT.pts);m.top.forEach(t=>m.crowns[t]=(m.crowns[t]||0)+1);
    m.stage='reveal';m.endsAt=0;setEv(m.top.length?'crown':'none');push();
  }
  function act(p){
    const S=getS(),m=S.m;if(!m||S.phase!=='mlt')return;
    if(p.a==='vote'&&m.stage==='vote'&&P(p.id)&&P(p.to)){m.votes[p.id]=p.to;push();if(voters().every(id=>m.votes[id]))setTimeout(()=>{if(M().stage==='vote')reveal()},1200)}
  }
  function cmd(p){
    const S=getS(),m=S.m,c=p.cmd;
    if(c==='mstart'||c==='mnext')return start(p.qid);
    if(!m)return;
    if(c==='mreveal')return reveal();
    if(c==='mskip'&&m.stage==='vote'){m.used=m.used.filter(x=>x!==m.q.id);m.round--;return start()}
    if(c==='mover'){if(m.stage==='vote')reveal();m.stage='over';setEv('over');return push()}
  }
  function tick(){const S=getS(),m=S&&S.m;if(!m||S.phase!=='mlt'||m.stage!=='vote')return;
    const left=m.endsAt-Date.now();if(left<=0)return reveal();
    const el=$('#mTimer');if(el){const s=Math.ceil(left/1000);if(el.textContent!==String(s)){el.textContent=s;if(s<=5)SFX.tick()}}}
  const nm=id=>P(id)?esc(P(id).name):'Someone';
  const em=id=>P(id)?getS().teams[P(id).team].emoji:'';
  function draw(){
    const S=getS(),m=M(),vs=voters(),tl=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
    const head=`<div class="tv-head"><h1 class="title">🗳️ Most Likely To</h1><span class="spacer"></span><span class="tv-round">${m.stage==='over'?'Final results':`Question ${m.round} of ${MLT.rounds}`}</span></div>`;
    if(m.stage==='over'){
      const s=[teamScore(0),teamScore(1)],win=s[0]===s[1]?-1:(s[0]>s[1]?0:1),cr=Object.entries(m.crowns).filter(([id])=>P(id)).sort((a,b)=>b[1]-a[1]),mostN=cr.length?cr[0][1]:0,most=cr.filter(x=>x[1]===mostN).map(x=>nm(x[0]));
      const reader=Object.entries(m.pts).filter(([id])=>P(id)).sort((a,b)=>b[1]-a[1])[0];
      return `<div class="tv">${head}<div class="reveal-big"><div class="k">${win<0?'🤝 The teams tied!':'🏆 Winning team'}</div><div class="v" style="font-size:7vw">${win<0?'Everybody!':tl(win)}</div>
        <div class="k">${tl(0)} ${s[0]} · ${tl(1)} ${s[1]}</div>
        ${most.length?`<div class="mcrown">👑 Most Roasted of the Weekend: <b>${most.join(' & ')}</b> · ${mostN} crown${mostN>1?'s':''}</div>`:''}
        ${reader?`<div class="k" style="font-size:2vw">🧠 Reads the room best: ${nm(reader[0])} (${reader[1]} pts)</div>`:''}</div></div>`;
    }
    const score=`<div class="mscore">${tl(0)} <b>${teamScore(0)}</b><span class="faint"> · </span>${tl(1)} <b>${teamScore(1)}</b></div>`;
    if(m.stage==='vote'){
      const n=Object.keys(m.votes).filter(id=>P(id)).length;
      return `<div class="tv">${head}<div class="mq">${esc(m.q.text)}</div>
        <div class="mvoted">${vs.map(id=>`<span class="${m.votes[id]?'on':''}">${m.votes[id]?'✅':'🤔'} ${nm(id)}</span>`).join('')}</div>
        <div class="tv-foot"><div class="bank" style="font-size:4vw">⏱ <span id="mTimer">${Math.max(0,Math.ceil((m.endsAt-Date.now())/1000))}</span></div><div class="status">Vote on your phone! ${n} of ${vs.length} in</div></div>${score}</div>`;
    }
    const max=m.tally.length?m.tally[0].n:1;
    const bars=m.tally.map((x,i)=>`<div class="mbar ${m.top.includes(x.id)?'top':''}" style="--w:${Math.max(8,x.n/max*100)}%;--d:${(m.tally.length-1-i)*.35}s"><span class="who">${m.top.includes(x.id)?'👑 ':''}${em(x.id)} ${nm(x.id)}</span><i></i><b>${x.n}</b></div>`).join('');
    return `<div class="tv">${head}<div class="mq small">${esc(m.q.text)}</div>
      ${m.top.length?`<div class="mwin">${m.top.map(nm).join(' & ')}!</div>`:'<div class="mwin">Nobody voted 😴</div>'}
      <div class="mbars">${bars}</div>
      <div class="tv-foot"><div class="status">${m.gained.length?`+${MLT.pts} for ${m.gained.length} who called it: ${m.gained.map(nm).join(', ')}`:'Nobody called it 😅'}</div></div>${score}</div>`;
  }
  function fx(e){if(e.type==='crown'){setTimeout(()=>{SFX.fanfare();confetti(2500)},Math.min(2400,(M().tally.length)*350))}}
  return {act,cmd,tick,draw,fx,teamScore};
}

/* ---------- Player phone ---------- */
function mltPhone(S,me){
  const m=S.m;if(!m)return `<div class="big-msg">🗳️ Watch the TV</div>`;const P=id=>S.players[id],nm=id=>P(id)?esc(P(id).name):'Someone';
  if(m.stage==='vote'){const mine=m.votes[me.id];
    return `<div class="big-msg" style="margin-top:16px">${esc(m.q.text)}</div><p class="muted" style="text-align:center">${mine?`You picked <b>${nm(mine)}</b>. Tap someone else to change it.`:'Tap a name. Your vote is secret 🤫'}</p>
     <div class="mvote">${S.order.filter(id=>P(id)).map(id=>`<button class="mv ${mine===id?'on':''}" data-to="${id}"><span>${S.teams[P(id).team].emoji}</span>${nm(id)}${id===me.id?' <small>(me)</small>':''}</button>`).join('')}</div>`}
  if(m.stage==='reveal'){const got=m.gained.includes(me.id),crowned=m.top.includes(me.id);
    return `<div class="big-msg">${crowned?'👑 It\'s YOU! 🤣':''}${crowned?'<br>':''}${got?`You called it! +${MLT.pts} 🎯`:m.votes[me.id]?'Not this time 😅':'You didn\'t vote 😴'}</div><p class="muted" style="text-align:center">Your points: ${m.pts[me.id]||0}</p>`}
  if(m.stage==='over')return `<div class="big-msg">That's a wrap! 🎉</div><p class="muted" style="text-align:center">You scored ${m.pts[me.id]||0} points${m.crowns[me.id]?` and got crowned ${m.crowns[me.id]} time${m.crowns[me.id]>1?'s':''} 👑`:''}</p>`;
  return `<div class="big-msg">🗳️ Watch the TV</div>`;
}
function mltPhoneWire(S,me,send){document.querySelectorAll('.mv').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mv').forEach(x=>x.classList.toggle('on',x===b));send({a:'vote',to:b.dataset.to})})}

/* ---------- Host remote ---------- */
function mltHost(S,Q,pname,tName){
  const m=S.m;if(!m||S.phase!=='mlt')return null;
  const all=mltPrompts(Q),left=all.filter(p=>!m.used.includes(p.id));
  const pick=`<label class="field">Next question<select id="msel"><option value="">🎲 Surprise me</option>${left.map(p=>`<option value="${esc(p.id)}">${esc(p.text)}</option>`).join('')}</select></label>`;
  const ids=S.order.filter(id=>S.players[id]),n=Object.keys(m.votes).filter(id=>S.players[id]).length;
  const ts=t=>ids.filter(id=>S.players[id].team===t).reduce((k,id)=>k+(m.pts[id]||0),0);
  let status='',actions='';
  if(m.stage==='vote'){status=`Question ${m.round}: ${n} of ${ids.length} voted`;actions=`<button class="btn gold block" data-c="mreveal">👀 Reveal now</button><div style="height:10px"></div><button class="btn block" data-c="mskip">🔁 Swap this question</button>`}
  else if(m.stage==='reveal'){status=m.top.length?`👑 ${m.top.map(pname).join(' & ')} got crowned`:'Nobody voted.';
    actions=m.round<MLT.rounds&&left.length?`${pick}<button class="btn gold block" data-c="mnext">▶ Next question (${m.round+1} of ${MLT.rounds})</button><div style="height:10px"></div><button class="btn block" data-c="mover">🏆 End and show the results</button>`:`<button class="btn gold block" data-c="mover">🏆 Show the final results</button>`}
  else if(m.stage==='over'){status='Most Likely To is done! 🎉';actions=`<button class="btn block" data-c="lobby">‹ Back to the lobby</button>`}
  return {status,actions,board:'',score:t=>String(ts(t))};
}
