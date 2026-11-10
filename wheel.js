/* ============ Ruff Family Wheel ============
   Lives alongside the Feud. The TV stays the boss of the game state (S.w),
   phones send 'wact' messages, the host remote sends 'cmd' messages starting with "w". */

const WHEEL={rounds:5,toss:1000,vowel:250,minWin:1000,bonusPrize:25000,bonusSecs:10};
const WEDGES=[
 {v:2500,c:'#d4af37'},{v:300,c:'#e53935'},{v:600,c:'#2c6bed'},{v:'BANKRUPT',c:'#111111'},
 {v:700,c:'#2fbf71'},{v:450,c:'#f57c00'},{v:'SHOT',c:'#8e44ff'},{v:800,c:'#e53935'},
 {v:350,c:'#2c6bed'},{v:500,c:'#f5c542'},{v:650,c:'#2fbf71'},{v:'LOSE',c:'#f4f4f4'},
 {v:900,c:'#e91e63'},{v:300,c:'#f57c00'},{v:550,c:'#2c6bed'},{v:'BANKRUPT',c:'#111111'},
 {v:400,c:'#2fbf71'},{v:750,c:'#e53935'},{v:'SHOT',c:'#8e44ff'},{v:500,c:'#f5c542'},
 {v:1000,c:'#2c6bed'},{v:350,c:'#e91e63'},{v:600,c:'#f57c00'},{v:450,c:'#2fbf71'}];
const VOWELS='AEIOU'.split(''),CONS='BCDFGHJKLMNPQRSTVWXYZ'.split(''),FREE='RSTLNE'.split('');
const WCATS=['Family Inside Joke','Phrase','Food & Drink','Place','Song Title','Thing','Event','Before & After','What Are You Doing?'];
const WHEEL_STARTER=[
 {cat:'Family Inside Joke',text:"What's burning?"},
 {cat:'Family Inside Joke',text:'Where my grandbabies?'},
 {cat:'Family Inside Joke',text:'Rev up those fryers'},
 {cat:'Family Inside Joke',text:'Looking for Logan'},
 {cat:'Phrase',text:'Can I take a plate home'},
 {cat:'Phrase',text:'Spend what you have and not a penny more'},
 {cat:'Food & Drink',text:'Banana pudding and peach cobbler'},
 {cat:'Before & After',text:'Sweet potato pie in the sky'},
 {cat:'Place',text:'Clover Brook Haven'},
 {cat:'What Are You Doing?',text:'Waiting on the standby list'},
 {cat:'Family Inside Joke',text:'Schatze and Lightweight are back on'},
 {cat:'Phrase',text:'Who made the mac and cheese'},
 {cat:'Song Title',text:'Before I Let Go'},
 {cat:'Place',text:'Seoul South Korea',use:'bonus'},
 {cat:'Event',text:'Family game night',use:'bonus'}
];
const isL=ch=>/[A-Z]/.test(ch);
function wLayout(text){
  const words=String(text||'').toUpperCase().replace(/[^A-Z0-9 '&?!,.\-]/g,'').trim().split(/\s+/).filter(Boolean),rows=[];let cur='';
  for(const w of words){if(w.length>14)return null;if(!cur)cur=w;else if((cur+' '+w).length<=14)cur+=' '+w;else{rows.push(cur);cur=w}}
  if(cur)rows.push(cur);return rows.length&&rows.length<=4?rows:null;
}
const wPuzzles=Q=>{const db=Q.filter(q=>q.section==='wheel').sort((a,b)=>a.position-b.position).map(q=>({id:q.id,cat:(q.labels&&q.labels.cat)||'Phrase',text:q.prompt,use:(q.labels&&q.labels.use)||'main'}));
  return db.length?db:WHEEL_STARTER.map((p,i)=>({id:'ws'+i,use:'main',...p}))};
async function ensureWheel(Q){
  const old=Q.find(q=>q.section==='wheel'&&/^stop asking about grandbabies$/i.test(q.prompt));
  if(old){await sb.from('feud_questions').update({prompt:'Where my grandbabies?'}).eq('id',old.id);return 1}
  if(Q.some(q=>q.section==='wheel'))return 0;
  const base=Math.max(0,...Q.map(q=>q.position||0))+1;
  const rows=WHEEL_STARTER.map((p,i)=>({position:base+i,section:'wheel',prompt:p.text,kind:'open',max_answers:1,options:[],answers:[],decoys:[],use_survey:false,merges:{},labels:{cat:p.cat,use:p.use||'main'}}));
  const {error}=await sb.from('feud_questions').insert(rows);if(error){toast('Could not add wheel puzzles: '+error.message);return 0}
  return rows.length;
}

/* ---------- TV engine ---------- */
function makeWheel(api){
  const {S:getS,push,setEv,nextPlayer,teamPlayers,P,loadQ}=api;
  let layer=null,layerN=-1,rafOn=false,lastIdx=-1;
  const W=()=>getS().w;
  const fresh=()=>({round:0,used:[],score:[0,0],bank:[0,0],pz:null,open:[],called:[],turn:0,active:null,stage:'idle',wedge:null,rot:0,spinN:0,landAt:0,result:null,toss:null,bonus:null,win:null});
  const letterIdx=()=>{const t=W().pz.text;const a=[];for(let i=0;i<t.length;i++)if(isL(t[i]))a.push(i);return a};
  const hidden=()=>letterIdx().filter(i=>!W().open.includes(i));
  const consLeft=()=>{const w=W(),t=w.pz.text;return CONS.some(L=>!w.called.includes(L)&&t.includes(L))};
  const vowLeft=()=>{const w=W(),t=w.pz.text;return VOWELS.some(L=>!w.called.includes(L)&&t.includes(L))};
  function reveal(L){const w=W(),t=w.pz.text;let n=0;for(let i=0;i<t.length;i++)if(t[i]===L&&!w.open.includes(i)){w.open.push(i);n++}return n}
  function openAll(){const w=W();w.open=letterIdx()}
  function give(team){const w=W();w.turn=team;w.active=nextPlayer(team)||nextPlayer(1-team);w.stage='spin';w.wedge=null}
  function passTurn(){give(1-W().turn)}
  async function startPuzzle(pid){
    const S=getS();if(S.w&&S.w.round&&S.phase!=='wheel'&&!['over','solved','idle','bonusEnd'].includes(S.w.stage)){S.phase='wheel';return push()}
    const Q=await loadQ();if(!S.w||S.w.stage==='over'||S.w.round==='B'||S.w.stage==='bonusEnd')S.w=fresh();
    const w=S.w,all=wPuzzles(Q).filter(p=>p.use!=='bonus'&&wLayout(p.text));
    const p=(pid&&all.find(x=>x.id===pid))||all.find(x=>!w.used.includes(x.id))||all[0];if(!p)return toast('No wheel puzzles yet');
    const rows=wLayout(p.text);
    w.round++;w.used.push(p.id);w.pz={id:p.id,cat:p.cat,rows,text:rows.join(' ')};w.open=[];w.called=[];w.bank=[0,0];w.win=null;w.result=null;w.wedge=null;
    const n=letterIdx().length;w.toss={buzzed:null,tried:[],cap:Math.max(2,Math.ceil(n*0.4)),revealed:0,nextAt:Date.now()+2200,doneAt:0};
    w.stage='toss';w.active=null;S.phase='wheel';push();
  }
  function tossTimeout(){const w=W();const t=w.score[0]===w.score[1]?(w.round+1)%2:(w.score[0]<w.score[1]?0:1);w.toss=null;give(t);setEv('none');push()}
  function spin(){
    const w=W();const t=Math.floor(Math.random()*WEDGES.length),a=t*15+3+Math.random()*9,cur=w.rot%360;
    const delta=((360-a)-cur+720)%360;w.rot=w.rot+360*5+delta;w.wedge=t;w.spinN++;w.landAt=Date.now()+5400;w.stage='spinning';w.result=null;push();
  }
  function land(){
    const w=W(),wd=WEDGES[w.wedge];w.landAt=0;
    if(wd.v==='BANKRUPT'){w.result={txt:'BANKRUPT 💀',until:Date.now()+2600};w.bank[w.turn]=0;setEv('bankrupt');passTurn()}
    else if(wd.v==='LOSE'){w.result={txt:'LOSE A TURN 😩',until:Date.now()+2600};setEv('nope');passTurn()}
    else if(wd.v==='SHOT'){w.result={txt:'🥃 TAKE A SHOT!',sub:`${esc(getS().teams[w.turn].name)}, everybody drinks!`,until:Date.now()+4500};setEv('shot');w.stage='spin'}
    else{w.result={txt:'$'+wd.v,until:Date.now()+1800};w.stage='pick';setEv('ding')}
    push();
  }
  function solved(team,amt,how){const w=W();openAll();if(team!=null)w.score[team]+=amt;w.win={team,amt,how};w.stage='solved';w.active=null;setEv(team==null?'none':'solve');push()}
  function act(p){
    const S=getS(),w=S.w;if(!w||S.phase!=='wheel')return;
    if(p.a==='buzz'){const t=w.toss;if(w.stage==='toss'&&t&&!t.buzzed&&P(p.id)&&!t.tried.includes(p.id)){t.buzzed=p.id;w.active=p.id;setEv('buzz');push()}return}
    if(p.id!==w.active&&!(w.stage==='bonusPick'&&w.bonus&&p.id===w.bonus.player))return;
    if(p.a==='spin'&&w.stage==='spin'&&consLeft())return spin();
    if(p.a==='buy'&&w.stage==='spin'&&w.bank[w.turn]>=WHEEL.vowel&&vowLeft()){w.stage='vowel';return push()}
    if(p.a==='back'&&w.stage==='vowel'){w.stage='spin';return push()}
    if(p.a==='solve'&&(w.stage==='spin'||w.stage==='vowel')){w.stage='solving';setEv('buzz');return push()}
    if(p.a==='letter'){
      const L=String(p.L||'').toUpperCase();if(w.called.includes(L))return;
      if(w.stage==='pick'&&CONS.includes(L)){w.called.push(L);const n=reveal(L),v=WEDGES[w.wedge].v;
        if(n){w.bank[w.turn]+=n*v;setEv('letters',{L,count:n});w.stage='spin';w.active=nextPlayer(w.turn)||w.active}else{setEv('nope',{L});passTurn()}return push()}
      if(w.stage==='vowel'&&VOWELS.includes(L)){w.called.push(L);w.bank[w.turn]-=WHEEL.vowel;const n=reveal(L);
        if(n){setEv('letters',{L,count:n});w.stage='spin';w.active=nextPlayer(w.turn)||w.active}else{setEv('nope',{L});passTurn()}return push()}
    }
    if(p.a==='bonus'&&w.stage==='bonusPick'){
      const ps=(p.picks||[]).map(x=>String(x).toUpperCase()).filter(x=>!FREE.includes(x));
      const c=ps.filter(x=>CONS.includes(x)).slice(0,3),v=ps.filter(x=>VOWELS.includes(x)).slice(0,1);
      w.bonus.picks=[...c,...v];[...c,...v].forEach(L=>{w.called.push(L);reveal(L)});w.stage='bonusReady';setEv('letters',{L:'',count:1});return push()}
  }
  function bonusTeam(){const w=W();return w.score[0]===w.score[1]?null:(w.score[0]>w.score[1]?0:1)}
  async function startBonus(team,pid){
    const S=getS(),w=S.w,Q=await loadQ();const bon=wPuzzles(Q).filter(p=>p.use==='bonus'&&wLayout(p.text));
    const p=bon.find(x=>!w.used.includes(x.id))||bon[0]||WHEEL_STARTER.filter(x=>x.use==='bonus').map((x,i)=>({id:'wb'+i,...x}))[0];
    const rows=wLayout(p.text);w.used.push(p.id);w.pz={id:p.id,cat:p.cat,rows,text:rows.join(' ')};w.open=[];w.called=FREE.slice();w.win=null;w.result=null;
    FREE.forEach(reveal);const tm=team!=null?team:0;w.bonus={team:tm,player:pid||teamPlayers(tm)[0]||null,picks:[],endsAt:0,won:null};
    w.turn=tm;w.active=w.bonus.player;w.stage='bonusPick';w.round='B';push();
  }
  function cmd(p){
    const S=getS(),w=S.w,c=p.cmd;
    if(c==='wstart'||c==='wnext')return startPuzzle(p.pid);
    if(!w)return;
    if(c==='wright'){
      if(w.stage==='toss'&&w.toss&&w.toss.buzzed){const t=P(w.toss.buzzed)?P(w.toss.buzzed).team:0;w.toss=null;return solved(t,WHEEL.toss,'toss')}
      if(w.stage==='solving'){const t=w.turn;return solved(t,Math.max(w.bank[t],WHEEL.minWin),'solve')}
      if((w.stage==='bonusGo'||w.stage==='bonusTime'||w.stage==='bonusReady')&&w.bonus){w.bonus.won=true;openAll();w.score[w.bonus.team]+=WHEEL.bonusPrize;w.stage='bonusEnd';setEv('jackpot');return push()}
    }
    if(c==='wwrong'){
      if(w.stage==='toss'&&w.toss&&w.toss.buzzed){const t=P(w.toss.buzzed)?P(w.toss.buzzed).team:0;w.toss=null;setEv('nope');give(1-t);return push()}
      if(w.stage==='solving'){setEv('nope');passTurn();return push()}
      if((w.stage==='bonusGo'||w.stage==='bonusTime'||w.stage==='bonusReady')&&w.bonus){w.bonus.won=false;openAll();w.stage='bonusEnd';setEv('nope');return push()}
    }
    if(c==='wpass'&&['spin','pick','vowel','solving'].includes(w.stage)){passTurn();return push()}
    if(c==='wskipToss'&&w.stage==='toss'){return tossTimeout()}
    if(c==='wgiveup'&&w.pz&&!['solved','bonusEnd','over'].includes(w.stage))return solved(null,0,'nobody');
    if(c==='wbonus')return startBonus(p.team!=null?p.team:bonusTeam(),p.id);
    if(c==='wbonusGo'&&w.stage==='bonusReady'){w.stage='bonusGo';w.bonus.endsAt=Date.now()+WHEEL.bonusSecs*1000;return push()}
    if(c==='wover'){w.stage='over';w.active=null;setEv('over');return push()}
    if(c==='wscore'){w.score[p.team===1?1:0]=Math.max(0,+p.score||0);return push()}
  }
  function tick(){
    const S=getS(),w=S&&S.w;if(!w||S.phase!=='wheel')return;const now=Date.now();
    if(w.stage==='toss'&&w.toss&&!w.toss.buzzed){const t=w.toss;
      if(t.revealed<t.cap&&now>=t.nextAt){const h=hidden();if(h.length>1){w.open.push(h[Math.floor(Math.random()*h.length)]);t.revealed++;t.nextAt=now+1500;SFX.tick();push()}else t.revealed=t.cap}
      else if(t.revealed>=t.cap){if(!t.doneAt){t.doneAt=now+5000}else if(now>=t.doneAt)tossTimeout()}}
    if(w.stage==='spinning'&&w.landAt&&now>=w.landAt)land();
    if(w.stage==='bonusGo'&&w.bonus.endsAt&&now>=w.bonus.endsAt){w.stage='bonusTime';setEv('strike',{count:1,quiet:false});push()}
    const el=$('#wTimer');if(el&&w.stage==='bonusGo'){const s=Math.max(0,Math.ceil((w.bonus.endsAt-now)/1000));if(el.textContent!==String(s)){el.textContent=s;SFX.tick()}}
    if(layer&&layer.classList.contains('show')&&w.stage!=='spinning'&&(!w.result||now>w.result.until))drawLayer();
  }
  /* ---- the spinning wheel overlay (kept outside the redraws so the spin animation isn't cut off) ---- */
  function wheelSVG(){
    const R=50,seg=WEDGES.map((wd,i)=>{const a0=(i*15-90)*Math.PI/180,a1=((i+1)*15-90)*Math.PI/180,x0=R+R*Math.cos(a0),y0=R+R*Math.sin(a0),x1=R+R*Math.cos(a1),y1=R+R*Math.sin(a1);
      const lab=wd.v==='BANKRUPT'?'BANKRUPT':wd.v==='LOSE'?'LOSE A TURN':wd.v==='SHOT'?'TAKE A SHOT':'$'+wd.v,dark=wd.v==='LOSE'||wd.c==='#f5c542'||wd.c==='#d4af37';
      return `<path d="M${R} ${R} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${wd.c}" stroke="#fff" stroke-width=".35"/>
      <text transform="rotate(${i*15+7.5} 50 50) translate(50 3.2) rotate(90)" fill="${dark?'#1d1440':'#fff'}" font-family="Anton,Impact,sans-serif" font-size="${lab.length>6?3:4.2}" dominant-baseline="middle" letter-spacing=".15">${lab}</text>`}).join('');
    return `<svg viewBox="0 0 100 100">${seg}<circle cx="50" cy="50" r="9" fill="#1d1440" stroke="#f5c542" stroke-width="1.2"/><text x="50" y="52.6" fill="#f5c542" font-family="Anton,Impact,sans-serif" font-size="6.5" text-anchor="middle">RFN</text></svg>`;
  }
  function ensureLayer(){
    if(layer&&document.body.contains(layer))return layer;
    layer=document.createElement('div');layer.id='wheelLayer';
    layer.innerHTML=`<div class="wl-wheel"><div class="wl-ptr"></div><div class="wl-spin" id="wlSpin">${wheelSVG()}</div></div><div class="wl-res" id="wlRes"></div>`;
    document.body.appendChild(layer);layerN=-1;return layer;
  }
  function spinSounds(){if(rafOn)return;rafOn=true;const el=$('#wlSpin');
    (function f(){const w=W();if(!w||w.stage!=='spinning'||!el){rafOn=false;return}
      const m=getComputedStyle(el).transform;if(m&&m!=='none'){const v=m.split('(')[1].split(')')[0].split(',');const ang=(Math.atan2(+v[1],+v[0])*180/Math.PI+360)%360;const idx=Math.floor(((360-ang)%360)/15);if(idx!==lastIdx){lastIdx=idx;SFX.tick()}}
      requestAnimationFrame(f)})()}
  function drawLayer(){
    const S=getS(),w=S.w;if(!w){if(layer)layer.classList.remove('show');return}
    ensureLayer();const sp=$('#wlSpin'),res=$('#wlRes'),now=Date.now();
    if(layerN!==w.spinN){if(layerN===-1||w.stage!=='spinning'){sp.style.transition='none';sp.style.transform=`rotate(${w.rot}deg)`;sp.offsetWidth;sp.style.transition=''}else sp.style.transform=`rotate(${w.rot}deg)`;layerN=w.spinN}
    const show=S.phase==='wheel'&&(w.stage==='spinning'||(w.result&&now<w.result.until));
    layer.classList.toggle('show',!!show);
    res.innerHTML=w.stage!=='spinning'&&w.result?`<div class="t">${w.result.txt}</div>${w.result.sub?`<div class="s">${w.result.sub}</div>`:''}`:`<div class="s">${P(w.active)?esc(P(w.active).name)+' is spinning…':''}</div>`;
    if(w.stage==='spinning')spinSounds();
  }
  /* ---- TV screen ---- */
  function boardHTML(){
    const w=W(),rows=w.pz.rows,start=rows.length>=3?0:1,lit=getS().ev&&getS().ev.type==='letters'?getS().ev.L:'';let off=0;const offs=rows.map(r=>{const o=off;off+=r.length+1;return o});
    let h='';for(let r=0;r<4;r++){const ri=r-start,row=rows[ri];const pad=row?Math.floor((14-row.length)/2):0;
      for(let c=0;c<14;c++){const k=c-pad;if(!row||k<0||k>=row.length||row[k]===' '){h+='<div class="wt g"></div>';continue}
        const ch=row[k],gi=offs[ri]+k,shown=!isL(ch)||w.open.includes(gi);h+=`<div class="wt ${shown?'on':''} ${shown&&lit&&ch===lit?'lit':''}">${shown?esc(ch):''}</div>`}}
    return `<div class="wboard">${h}</div>`;
  }
  function scoreHTML(t){const S=getS(),w=W(),ctrl=['spin','pick','vowel','solving','spinning'].includes(w.stage)&&w.turn===t;
    return `<div class="score ${ctrl?'ctrl':''}"><div class="em">${S.teams[t].emoji}</div><div class="nm">${esc(S.teams[t].name)}</div><div class="pts">$${w.score[t].toLocaleString()}</div>${w.round!=='B'?`<div class="wbank">This puzzle: $${w.bank[t].toLocaleString()}</div>`:''}</div>`}
  const nm=id=>P(id)?esc(P(id).name):'Someone';
  function status(){
    const S=getS(),w=W(),tl=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
    switch(w.stage){
      case 'toss':return w.toss&&w.toss.buzzed?`⚡ ${nm(w.toss.buzzed)} buzzed! Say it out loud…`:`⚡ TOSS-UP for $${WHEEL.toss.toLocaleString()}! Know it? BUZZ!`;
      case 'spin':return `${nm(w.active)}, you're up! Spin, buy a vowel, or solve <span class="faint">(${tl(w.turn)})</span>`;
      case 'spinning':return `🎡 ${nm(w.active)} is spinning…`;
      case 'pick':return `${nm(w.active)}, pick a consonant · $${WEDGES[w.wedge].v} each`;
      case 'vowel':return `${nm(w.active)} is buying a vowel 💸`;
      case 'solving':return `🗣️ ${nm(w.active)} is solving… say it out loud!`;
      case 'solved':return w.win&&w.win.team!=null?`🏆 ${tl(w.win.team)} ${w.win.how==='toss'?'wins the toss-up':'solved it'}! +$${w.win.amt.toLocaleString()}`:'Nobody got that one 😅';
      case 'bonusPick':return `🎁 BONUS ROUND · ${nm(w.bonus.player)} picks 3 consonants + 1 vowel`;
      case 'bonusReady':return `🎁 Here are your letters… get ready!`;
      case 'bonusGo':return `⏱ <span id="wTimer">${Math.max(0,Math.ceil((w.bonus.endsAt-Date.now())/1000))}</span> · SOLVE IT, ${tl(w.bonus.team)}!`;
      case 'bonusTime':return `⏰ Time! Did they get it?`;
      case 'bonusEnd':return w.bonus.won?`💰 ${tl(w.bonus.team)} WINS $${WHEEL.bonusPrize.toLocaleString()}!`:`So close! 😩`;
    }return ''}
  function draw(){
    const S=getS(),w=W();drawLayer();
    if(w.stage==='over'){const s=w.score,win=s[0]===s[1]?-1:(s[0]>s[1]?0:1),tl=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
      return `<div class="tv"><div class="tv-head"><h1 class="title">🎡 Ruff Family Wheel</h1></div><div class="reveal-big"><div class="k">${win<0?'🤝 It\'s a tie!':'🏆 And the winner is…'}</div><div class="v" style="font-size:8vw">${win<0?'Everybody!':tl(win)}</div><div class="k">${tl(0)} $${s[0].toLocaleString()} · ${tl(1)} $${s[1].toLocaleString()}</div></div></div>`}
    const rl=w.round==='B'?'🎁 Bonus round':`Puzzle ${w.round} of ${WHEEL.rounds}`;
    const used=w.round==='B'?'':`<div class="wused">${[...CONS,...VOWELS].sort().map(L=>`<span class="${w.called.includes(L)?'x':''} ${VOWELS.includes(L)?'v':''}">${L}</span>`).join('')}</div>`;
    return `<div class="tv wmode"><div class="tv-head"><h1 class="title">🎡 Ruff Family Wheel</h1><span class="spacer"></span><span class="tv-round">${rl}</span></div>
      <div class="tv-mid">${scoreHTML(0)}<div class="wcenter">${boardHTML()}<div class="wcat">${esc(w.pz.cat)}</div>${used}</div>${scoreHTML(1)}</div>
      <div class="tv-foot"><div class="status">${status()}</div></div></div>`;
  }
  function fx(e){
    if(e.type==='letters'&&e.count){for(let i=0;i<Math.min(e.count,6);i++)setTimeout(()=>SFX.ding(),i*380)}
    if(e.type==='bankrupt'){[400,300,200,120].forEach((f,i)=>tone(f,.35,'sawtooth',.2,i*.18))}
    if(e.type==='nope'){SFX.strike()}
    if(e.type==='shot'){SFX.fanfare();confetti(2500)}
    if(e.type==='solve'){SFX.win();confetti(3000)}
  }
  return {fresh,act,cmd,tick,draw,fx,drawLayer,startPuzzle};
}

/* ---------- Player phone ---------- */
function wheelPhone(S,me,send){
  const w=S.w;if(!w)return `<div class="big-msg">🎡 Wheel time! Watch the TV.</div>`;
  const nm=id=>S.players[id]?esc(S.players[id].name):'Someone',mine=w.active===me.id,t=w.turn;
  const grid=(letters,dis=[])=>`<div class="lgrid">${letters.map(L=>`<button class="lk" data-l="${L}" ${w.called.includes(L)||dis.includes(L)?'disabled':''}>${L}</button>`).join('')}</div>`;
  const pz=w.pz,consLeft=pz&&CONS.some(L=>!w.called.includes(L)&&pz.text.includes(L)),vowLeft=pz&&VOWELS.some(L=>!w.called.includes(L)&&pz.text.includes(L));
  switch(w.stage){
    case 'toss':{const tr=w.toss;if(!tr)return '';
      if(tr.buzzed===me.id)return `<div class="big-msg">You buzzed! 🗣️<br>Say the answer out loud!</div>`;
      if(tr.buzzed)return `<div class="big-msg">${nm(tr.buzzed)} buzzed first 😬</div>`;
      if(tr.tried.includes(me.id))return `<div class="big-msg">Watch the TV 📺</div>`;
      return `<div class="big-msg">⚡ Toss-up! Know it?</div><button class="buzzer" data-w="buzz">BUZZ</button>`}
    case 'spin':
      if(!mine)return `<div class="big-msg">${nm(w.active)} is up 🎡</div><p class="muted" style="text-align:center">${S.players[me.id]&&S.players[me.id].team===t?'Your team! Help them out 👀':'Watch the TV 📺'}</p>`;
      return `<div class="big-msg">You're up! 🎡</div>
       <button class="btn gold block wbig" data-w="spin" ${consLeft?'':'disabled'}>🎡 SPIN</button>${consLeft?'':'<p class="faint" style="text-align:center">No consonants left. Buy a vowel or solve!</p>'}
       <div class="row" style="margin-top:12px"><button class="btn block" style="flex:1" data-w="buy" ${w.bank[t]>=WHEEL.vowel&&vowLeft?'':'disabled'}>Buy a vowel · $${WHEEL.vowel}</button></div>
       <button class="btn green block" style="margin-top:12px" data-w="solve">🙋 I want to solve</button>
       <p class="faint" style="text-align:center;margin-top:14px">Your team has $${w.bank[t].toLocaleString()} this puzzle</p>`;
    case 'spinning':return `<div class="big-msg">🎡 Spinning…</div><p class="muted" style="text-align:center">Eyes on the TV 👀</p>`;
    case 'pick':return mine?`<div class="big-msg">$${WEDGES[w.wedge].v}! Pick a consonant</div>${grid(CONS)}`:`<div class="big-msg">${nm(w.active)} is picking a letter…</div>`;
    case 'vowel':return mine?`<div class="big-msg">Buy a vowel · $${WHEEL.vowel}</div>${grid(VOWELS)}<button class="btn block" style="margin-top:14px" data-w="back">‹ Never mind</button>`:`<div class="big-msg">${nm(w.active)} is buying a vowel…</div>`;
    case 'solving':return mine?`<div class="big-msg">🗣️ Say it out loud!<br><span class="muted" style="font-size:17px">The host will tell you if you got it</span></div>`:`<div class="big-msg">${nm(w.active)} is solving… 🤞</div>`;
    case 'solved':return `<div class="big-msg">${w.win&&w.win.team!=null?`🏆 ${S.teams[w.win.team].emoji} ${esc(S.teams[w.win.team].name)} got it! +$${w.win.amt.toLocaleString()}`:'Nobody got it 😅'}</div>`;
    case 'bonusPick':
      if(w.bonus.player!==me.id)return `<div class="big-msg">🎁 Bonus round!<br>${nm(w.bonus.player)} is picking letters</div>`;
      return `<div class="big-msg" style="margin-top:16px">🎁 Bonus round!</div><p class="muted" style="text-align:center">R S T L N E are free. Pick <b>3 consonants</b> and <b>1 vowel</b>.</p>
       <div class="sec-label">Consonants</div>${grid(CONS.filter(L=>!FREE.includes(L)))}<div class="sec-label">Vowel</div>${grid(VOWELS.filter(L=>!FREE.includes(L)))}
       <button class="btn gold block" id="wlock" style="margin-top:16px" disabled>Lock in my letters</button>`;
    case 'bonusReady':case 'bonusGo':case 'bonusTime':return `<div class="big-msg">🎁 ${S.players[me.id]&&S.players[me.id].team===w.bonus.team?'SOLVE IT! Shout it out! 🗣️':'Bonus round! Watch the TV 📺'}</div>`;
    case 'bonusEnd':return `<div class="big-msg">${w.bonus.won?'💰 They got it!':'So close! 😩'}</div>`;
    case 'over':return `<div class="big-msg">Game over! 🎉</div><p class="muted" style="text-align:center">${S.teams[0].emoji} $${w.score[0].toLocaleString()} · ${S.teams[1].emoji} $${w.score[1].toLocaleString()}</p>`;
  }return `<div class="big-msg">🎡 Watch the TV</div>`;
}
function wheelPhoneWire(S,me,send){
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{b.disabled=true;send({a:b.dataset.w})});
  const w=S.w;if(!w)return;
  if(w.stage==='bonusPick'&&w.bonus.player===me.id){const sel=[];const lock=$('#wlock');
    document.querySelectorAll('.lk').forEach(b=>b.onclick=()=>{const L=b.dataset.l,isV=VOWELS.includes(L),i=sel.indexOf(L);
      if(i>=0){sel.splice(i,1);b.classList.remove('on')}else{const nC=sel.filter(x=>!VOWELS.includes(x)).length,nV=sel.filter(x=>VOWELS.includes(x)).length;if((isV&&nV>=1)||(!isV&&nC>=3))return;sel.push(L);b.classList.add('on')}
      lock.disabled=!(sel.filter(x=>!VOWELS.includes(x)).length===3&&sel.filter(x=>VOWELS.includes(x)).length===1)});
    lock.onclick=()=>{lock.disabled=true;send({a:'bonus',picks:sel})};return}
  document.querySelectorAll('.lk').forEach(b=>b.onclick=()=>{document.querySelectorAll('.lk').forEach(x=>x.disabled=true);send({a:'letter',L:b.dataset.l})});
}

/* ---------- Host remote ---------- */
function wheelHost(S,Q,pname,tName){
  const w=S.w;let status='',actions='',board='';
  const puzzles=wPuzzles(Q).filter(p=>p.use!=='bonus'&&wLayout(p.text)),unused=puzzles.filter(p=>!(w&&w.used.includes(p.id)));
  const pick=n=>`<label class="field">Puzzle ${n}<select id="wsel">${unused.map((p,i)=>`<option value="${esc(p.id)}" ${i===0?'selected':''}>${esc(p.cat)}: ${esc(p.text)}</option>`).join('')}</select></label>`;
  if(!w||S.phase!=='wheel')return null;
  const ans=w.pz?`<div class="card" style="padding:12px;font-size:15px"><span class="faint">🤫 Answer:</span> <b>${esc(w.pz.text)}</b> <span class="faint">· ${esc(w.pz.cat)}</span></div>`:'';
  const judge=`<div class="row"><button class="btn green" style="flex:1" data-c="wright">✅ Got it</button><button class="btn red" style="flex:1" data-c="wwrong">❌ Wrong</button></div>`;
  switch(w.stage){
    case 'toss':status=w.toss&&w.toss.buzzed?`${pname(w.toss.buzzed)} buzzed in. Did they say it right?`:'Toss-up: letters are popping in. Anybody can buzz.';
      actions=w.toss&&w.toss.buzzed?judge:`<button class="btn block" data-c="wskipToss">⏭ Skip toss-up</button>`;break;
    case 'spin':case 'pick':case 'vowel':case 'spinning':
      status=`${pname(w.active)}'s turn (${tName(w.turn)}) · this puzzle: ${tName(0)} $${w.bank[0]} · ${tName(1)} $${w.bank[1]}`;
      actions=`<div class="row"><button class="btn" style="flex:1" data-c="wpass">⏭ Pass the turn</button><button class="btn" style="flex:1" data-c="wgiveup">👀 Reveal (nobody got it)</button></div>`;break;
    case 'solving':status=`${pname(w.active)} is solving out loud. Did they get it?`;actions=judge;break;
    case 'solved':{const more=w.round<WHEEL.rounds&&unused.length;status=w.win&&w.win.team!=null?`${tName(w.win.team)} got it! +$${w.win.amt}`:'Nobody got it.';
      const bt=w.score[0]===w.score[1]?null:(w.score[0]>w.score[1]?0:1),ps=t=>S.order.filter(id=>S.players[id]&&S.players[id].team===t);
      actions=more?`${pick(w.round+1)}<button class="btn gold block" data-c="wnext">▶ Next puzzle</button><div style="height:10px"></div>`:'';
      actions+=`<details class="acc"${more?'':' open'}><summary>🎁 Bonus round${more?' (end early)':''}</summary><div class="acc-body">
        ${bt==null?`<p class="muted">It's a tie! Which team plays the bonus?</p><label class="field">Team<select id="wbt">${[0,1].map(t=>`<option value="${t}">${tName(t)}</option>`).join('')}</select></label>`:`<p class="muted">${tName(bt)} is ahead, they play.</p>`}
        <label class="field">Who picks the letters?<select id="wbp">${(bt==null?[...ps(0),...ps(1)]:ps(bt)).map(id=>`<option value="${id}">${pname(id)}</option>`).join('')}</select></label>
        <button class="btn gold block" data-c="wbonus">🎁 Start the bonus round</button></div></details>
        <div style="height:10px"></div><button class="btn block" data-c="wover">🏆 Skip to the winner</button>`;break}
    case 'bonusPick':status=`${pname(w.bonus.player)} is picking 3 consonants + 1 vowel on their phone.`;break;
    case 'bonusReady':status='Letters are up. Start the clock when they are ready.';actions=`<button class="btn gold block" data-c="wbonusGo">⏱ Start ${WHEEL.bonusSecs} seconds</button><div style="height:10px"></div>${judge}`;break;
    case 'bonusGo':status='Clock is running! Tap ✅ the second they say it.';actions=judge;break;
    case 'bonusTime':status="Time's up! Did they say it before the buzzer?";actions=judge;break;
    case 'bonusEnd':status=w.bonus.won?`They won $${WHEEL.bonusPrize.toLocaleString()}! 💰`:'They missed it.';actions=`<button class="btn gold block" data-c="wover">🏆 Show the winner</button>`;break;
    case 'over':status='Wheel game over! 🎉';actions=`<button class="btn block" data-c="lobby">‹ Back to the lobby</button>`;break;
  }
  if(w.stage!=='over')board=ans;
  return {status,actions,board,score:t=>`$${w.score[t].toLocaleString()}`};
}
