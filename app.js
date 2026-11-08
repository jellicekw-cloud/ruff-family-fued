/* Ruff Family Feud — survey, question manager, TV game, host remote, player phones */
'use strict';

/* ============ Config ============ */
const CFG={
  url:'https://sllhzpqohpwuvxczaksg.supabase.co',
  key:'sb_publishable_m8QCuCIZm4Ho99JE_lNQRA_dO3KiRg6',
  room:'RUFF',
  pin:'1126',
  teams:[{name:'Team Mac & Cheese',emoji:'🧀'},{name:'Team Rice & Peas',emoji:'🍚'}],
  multipliers:[1,1,2,3],
  fmTimes:[20,25],
  fmTarget:200,
  plan:{1:/first grandbaby\?/i,2:/grandbaby will be/i,3:/Bubb always loses/i,4:/Schatze & Lightweight/i} /* default question for these rounds */
};
const MOCK=/[?&]mock=1/.test(location.search);

/* ============ Helpers ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'id-'+Math.random().toString(36).slice(2)+Date.now().toString(36);
const KEYS='ABCDEFGHIJKL'.split('');
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2600)}
const ls={get(k,d){try{const v=localStorage.getItem('rff_'+k);return v==null?d:JSON.parse(v)}catch(_e){return d}},set(k,v){try{localStorage.setItem('rff_'+k,JSON.stringify(v))}catch(_e){}}};
const ss={get(k){try{return sessionStorage.getItem('rff_'+k)}catch(_e){return null}},set(k,v){try{sessionStorage.setItem('rff_'+k,v)}catch(_e){}}};
function hash(str){let h=2166136261;for(const c of String(str)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function shuffle(arr,seed){const a=arr.slice();let s=hash(seed)||1;for(let i=a.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
const pstore=MOCK?{get(k,d){try{const v=sessionStorage.getItem('rffp_'+k);return v==null?d:JSON.parse(v)}catch(_e){return d}},set(k,v){try{sessionStorage.setItem('rffp_'+k,JSON.stringify(v))}catch(_e){}}}:ls;
function myId(){let id=pstore.get('pid');if(!id){id=uid();pstore.set('pid',id)}return id}
const siteBase=()=>location.origin+location.pathname.replace(/index\.html$/,'');

/* ============ Mock backend (for testing: add ?mock=1) ============ */
function mockClient(){
  const k=t=>'rffmock_'+t,read=t=>{try{return JSON.parse(localStorage.getItem(k(t))||'[]')}catch(_e){return []}},write=(t,r)=>localStorage.setItem(k(t),JSON.stringify(r));
  function from(table){
    let op='select',payload=null,filters=[],ord=null,single=false;
    const api={select(){return api},order(c){ord=c;return api},eq(c,v){filters.push(r=>r[c]===v);return api},
      ilike(c,v){filters.push(r=>String(r[c]).toLowerCase()===String(v).toLowerCase());return api},
      insert(r){op='insert';payload=[].concat(r);return api},update(o){op='update';payload=o;return api},
      upsert(r){op='upsert';payload=[].concat(r);return api},delete(){op='delete';return api},
      maybeSingle(){single=true;return api},then(a,b){return run().then(a,b)}};
    async function run(){
      let rows=read(table);const m=r=>filters.every(f=>f(r));
      if(op==='select'){let d=rows.filter(m);if(ord)d.sort((a,b)=>a[ord]>b[ord]?1:a[ord]<b[ord]?-1:0);return {data:single?(d[0]||null):d,error:null}}
      if(op==='insert'){const add=payload.map(r=>({id:uid(),created_at:new Date().toISOString(),...r}));write(table,[...rows,...add]);return {data:add,error:null}}
      if(op==='update'){write(table,rows.map(r=>m(r)?{...r,...payload}:r));return {data:null,error:null}}
      if(op==='upsert'){payload.forEach(p=>{const pk=p.id!==undefined?'id':'room',i=rows.findIndex(r=>r[pk]===p[pk]);if(i>=0)rows[i]={...rows[i],...p};else rows.push(p)});write(table,rows);return {data:null,error:null}}
      if(op==='delete'){write(table,rows.filter(r=>!m(r)));return {data:null,error:null}}
    }
    return api;
  }
  return {from,channel(name){const bc=new BroadcastChannel(name),hs={};bc.onmessage=e=>(hs[e.data.event]||[]).forEach(h=>h({payload:e.data.payload}));
    return {on(t,f,cb){(hs[f.event]=hs[f.event]||[]).push(cb);return this},subscribe(cb){setTimeout(()=>cb('SUBSCRIBED'),5);return this},
      send(m){bc.postMessage({event:m.event,payload:JSON.parse(JSON.stringify(m.payload))});return Promise.resolve('ok')}}}};
}
const sb=MOCK?mockClient():window.supabase.createClient(CFG.url,CFG.key,{realtime:{params:{eventsPerSecond:30}}});

/* ============ Data ============ */
async function loadQuestions(){
  const {data,error}=await sb.from('feud_questions').select('*').order('position');if(error)throw error;
  const qs=data||[];
  for(const q of qs){ /* one-time upgrade: song + party questions become pick-your-top-2 */
    if(q.kind!=='open')continue;
    const st=STARTER.find(x=>x.kind==='vote'&&x.section==='main'&&x.prompt===q.prompt);if(!st)continue;
    const up={kind:'vote',max_answers:st.max_answers,options:st.options,answers:st.answers,decoys:st.decoys};
    try{await sb.from('feud_questions').update(up).eq('id',q.id);Object.assign(q,up)}catch(_e){}
  }
  return qs;
}
async function loadResponses(){const {data,error}=await sb.from('feud_responses').select('*');if(error)throw error;return data||[]}
async function saveQuestion(q){const {id,...rest}=q;const {error}=id?await sb.from('feud_questions').update(rest).eq('id',id):await sb.from('feud_questions').insert(rest);if(error)throw error}

const A=(...pairs)=>pairs.map(([text,points])=>({text,points}));
const STARTER=[
 {section:'main',prompt:'Name a side dish that HAS to be on the Thanksgiving table.',answers:A(['Mac & cheese',38],['Collard greens',22],['Dressing',14],['Candied yams',12],['Potato salad',8],['Rolls',6]),decoys:['Green bean casserole','Cranberry sauce','Mashed potatoes','Corn','Deviled eggs','Rice']},
 {section:'main',prompt:'Name something people do after eating too much.',answers:A(['Nap',40],['Lie on the couch',25],['Go back for seconds',15],['Go smoke',12],['Go to the restroom',8]),decoys:['Unbutton their pants','Watch football','Take a walk','Drink water','Complain','Play cards']},
 {section:'main',prompt:'Name something guests take home from Thanksgiving.',answers:A(['Plate of leftovers',52],['Dessert',18],['Your containers',12],['A full stomach',9],['The gossip',5],['A coat they forgot',4]),decoys:['Napkins','A recipe','Extra rolls','The remote','Pictures','A headache']},
 {section:'main',prompt:"Name a reason the food isn't ready on time.",answers:A(['Started cooking late',34],['Oven too full',22],["Waiting on someone's dish",18],['Too many people in the kitchen',12],['Burned something',9],['Forgot an ingredient',5]),decoys:['Meat still frozen','Ran out of foil','Cook got distracted','Store was closed','Somebody ate it already','Power went out']},
 {section:'main',prompt:'Name something a relative always asks you at the holidays.',answers:A(['When are you getting married?',33],["How's work?",24],['Who made the mac & cheese?',15],['When are you having kids?',13],['Can I take a plate?',9],['You still with them?',6]),decoys:["Where's the remote?",'You got a new car?','Can you fix my phone?',"When's dinner?",'Can I borrow $20?','Did you lose weight?']},
 {section:'main',prompt:'Name something people forget to pack.',answers:A(['Phone charger',36],['Toothbrush',22],['Underwear',15],['Socks',11],['Passport',9],['Medicine',7]),decoys:['Shampoo','Sunglasses','Pajamas','Deodorant','Belt','Umbrella']},
 {section:'main',prompt:'Name something you do while waiting at the airport gate.',answers:A(['Scroll your phone',34],['Eat',21],['Charge your phone',16],['People-watch',13],['Check the standby list',10],['Grab a drink',6]),decoys:['Read a book','Shop','Call someone','Stretch','Watch a movie','Sleep']},
 {section:'main',prompt:'Name a reason you might miss your flight.',answers:A(['Traffic',31],['Long security line',25],['Overslept',18],['Wrong gate',11],["Didn't clear standby",10],['Lost ID',5]),decoys:['Car broke down','Lyft was late','Got lost in the airport','Was shopping','Bad weather','Forgot something at home']},
 {section:'main',prompt:"Name something you'd find in a carry-on.",answers:A(['Snacks',30],['Phone charger',24],['Headphones',18],['Change of clothes',14],['Neck pillow',9],['Water bottle',5]),decoys:['Laptop','Book','Makeup bag','Blanket','Gum','Sunglasses']},
 {section:'main',prompt:"Name something that's always missing when you need it.",answers:A(['TV remote',38],['Keys',25],['Phone charger',16],['Scissors',9],['Glasses',7],['Tape',5]),decoys:['Pen','Wallet','Lighter','Hair tie','Batteries','Socks']},
 {section:'main',prompt:'Name a chore the kids refuse to do.',answers:A(['Dishes',40],['Cleaning the bathroom',25],['Taking out the trash',15],['Laundry',12],['Cleaning their room',8]),decoys:['Vacuuming','Walking the dog','Mopping','Dusting','Cooking','Folding clothes']},
 {section:'main',prompt:'Name something people do at a family cookout.',answers:A(['Eat',30],['Play spades',22],['Dance',16],['Gossip',12],['Grill',12],['Play music',8]),decoys:['Swim','Play dominoes','Take pictures','Argue','Sleep','Play cornhole']},
 {section:'main',kind:'vote',max_answers:2,prompt:'Name a song that gets everybody on the dance floor.',options:['Electric Slide','Cupid Shuffle','Wobble','Before I Let Go','Cha Cha Slide','Candy'],answers:A(['Electric Slide',30],['Before I Let Go',24],['Cupid Shuffle',18],['Wobble',12],['Cha Cha Slide',9],['Candy',7]),decoys:['September','Uptown Funk','Shout','Macarena','Single Ladies','Hot in Herre']},
 {section:'main',kind:'vote',max_answers:2,prompt:'Name something that makes a party turn up.',options:['The DJ','Drinks','Food','Dancing','Family drama','Karaoke','Good vibes','The guest list'],answers:A(['The DJ',30],['Drinks',22],['Food',16],['Dancing',12],['Good vibes',11],['Family drama',9]),decoys:['Balloons','Games','A photo booth','Fireworks','The guest of honor','A live band']},
 {section:'finale',kind:'vote',max_answers:1,prompt:'Where should our next family trip be?',options:['Amsterdam','Hawaii','Paris'],answers:A(['Amsterdam',34],['Hawaii',33],['Paris',33]),decoys:['Tokyo','London','Jamaica','Cancún','Dubai']},
 {section:'fast',prompt:'Name a Thanksgiving dessert.',answers:A(['Sweet potato pie',40],['Peach cobbler',22],['Banana pudding',15],['Pound cake',13],['Pecan pie',10]),decoys:['Apple pie','Cheesecake','Red velvet cake','Brownies','Ice cream']},
 {section:'fast',prompt:'Name something you bring to a potluck.',answers:A(['Mac & cheese',30],['Dessert',25],['Drinks',18],['Chips',12],['Paper plates',9],['Potato salad',6]),decoys:['Ice','Napkins','Bread','Fruit tray','Wings','Salad']},
 {section:'fast',prompt:'Name a reason to call in "sick."',answers:A(['Actually sick',30],['Hangover',25],['Too tired',18],['Mental health day',14],['Family emergency',8],['Car trouble',5]),decoys:['Concert tickets','Bad weather','Kid is sick','Doctor appointment','Big game','Vacation']},
 {section:'fast',prompt:'Name something in your junk drawer.',answers:A(['Batteries',30],['Rubber bands',22],['Pens',18],['Takeout menus',12],['Tape',10],['Old keys',8]),decoys:['Scissors','Coupons','Lighters','Twist ties','Screwdriver','Chargers']},
 {section:'fast',prompt:'Name a word you would use to describe really good food.',answers:A(['Delicious',35],["Bussin'",25],['Fire',18],['Yummy',12],['Slaps',10]),decoys:['Tasty','Amazing','Scrumptious','Divine','Perfect','Lit']}
];
const EXTRA=[
 {section:'main',kind:'vote',max_answers:1,prompt:"Who's giving Jae her first grandbaby?",options:['Schatze','Bubb','Shots','Nobody, stop asking! 🤣'],answers:A(['Nobody, stop asking! 🤣',40],['Schatze',25],['Bubb',20],['Shots',15]),decoys:['Chicken','Thor','Lightweight','The neighbor','Lil Bit']},
 {section:'main',kind:'vote',max_answers:1,prompt:"Jae's first grandbaby will be…",options:['A boy 💙','A girl 💗','Twins 👯','Triplets 😱','A grand-puppy instead 🐶'],answers:A(['A grand-puppy instead 🐶',30],['A girl 💗',25],['A boy 💙',22],['Twins 👯',15],['Triplets 😱',8]),decoys:['Quadruplets','A goldfish','A surprise!','A grand-kitten','Nothing, ever']},
 {section:'main',kind:'vote',max_answers:1,prompt:'How many times a week do Schatze & Lightweight break up?',options:['Never, they\'re solid 💕','Once','2 or 3 times','Every other day','Daily, like clockwork',"I've lost count 🤣"],answers:A(["I've lost count 🤣",30],['Daily, like clockwork',24],['2 or 3 times',18],['Every other day',14],['Once',8],['Never, they\'re solid 💕',6]),decoys:['Twice a day','Only on holidays','Every weekend','Once a month','Hourly','Only when the phone dies']},
 {section:'main',prompt:'Name something Bubb always loses on a trip.',answers:A(['Phone charger',30],['AirPods',22],['Sunglasses',16],['Room key',12],['ID',10],['Wallet',10]),decoys:['Passport','Boarding pass','Hat','Jacket','Luggage','His mind','Keys','Toothbrush']}
];
async function ensureExtras(Q){
  let added=0;
  for(const x of EXTRA){if(Q.some(q=>q.prompt===x.prompt))continue;const pos=Math.max(0,...Q.filter(q=>q.section==='main').map(q=>q.position))+1;
    const {error}=await sb.from('feud_questions').insert({position:pos,section:x.section,prompt:x.prompt,kind:x.kind||'open',max_answers:x.max_answers||2,options:x.options||[],answers:x.answers,decoys:x.decoys,use_survey:true,merges:{},labels:{}});if(!error)added++}
  return added;
}
async function addStarter(){
  const rows=[...STARTER,...EXTRA].map((q,i)=>({position:i+1,section:q.section,prompt:q.prompt,kind:q.kind||'open',max_answers:q.max_answers||2,options:q.options||[],answers:q.answers,decoys:q.decoys,use_survey:true,merges:{},labels:{}}));
  const {error}=await sb.from('feud_questions').insert(rows);if(error)throw error;
}

/* ============ Survey → board ============ */
function norm(s){
  return String(s).toLowerCase().replace(/&/g,' and ').replace(/\bn\b/g,' and ').replace(/['’`]/g,'').replace(/[^a-z0-9 ]+/g,' ')
    .replace(/\b(the|a|an|my|your|some)\b/g,' ').replace(/\s+/g,' ').trim().split(' ').map(w=>w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w).join(' ');
}
/* Answers that mean the same thing, grouped automatically (matched anywhere in what someone typed) */
const ALIASES={
  "didn't clear standby":['no seat','no seats','no open seat','flight full','full flight','flight was full','oversold','overbooked','didnt clear','didn t clear','did not clear','standby','stand by','bumped','didnt get on','didn t get on','did not get on','didnt make it on','didnt make the flight','non rev','nonrev','non-rev','load','loads','weight restriction','sat out'],
  'check the standby list':['standby','stand by','check the list','check list','watch the list','watch the board','check the board','upgrade list','seat list','monitor','check load','check loads'],
  'traffic':['traffic','accident','wreck','road work','construction','i 85','i 285','highway'],
  'long security line':['security','tsa','checkpoint','screening','precheck','pre check','long line'],
  'overslept':['overslept','oversleep','slept','alarm','woke up late','sleep'],
  'wrong gate':['wrong gate','gate change','wrong terminal','gate'],
  'lost id':['lost id','lost my id','no id','forgot id','license','lost wallet'],
  'airpods':['airpod','air pod','earbud','ear bud','headphone','earphone','beats'],
  'room key':['room key','key card','keycard','hotel key'],
  'phone charger':['charger','charging cable','cord','charging block'],
  'id':['id','license','drivers license','identification'],
  'grab a drink':['drink','drinks','bar','cocktail','beer','wine'],
  'go smoke':['smoke','smoking','cigarette','vape'],
  'go to the restroom':['restroom','bathroom','toilet','potty'],
  'mac & cheese':['mac','macaroni'],
  'collard greens':['greens','collard','collards']
};
function aliasKey(q,raw){
  const n=' '+norm(raw)+' ';
  for(const a of q.answers||[]){const list=ALIASES[String(a.text).toLowerCase()];if(!list)continue;
    if(list.some(al=>n.includes(' '+norm(al)+' ')))return {key:norm(a.text),label:a.text}}
  return null;
}
function groupsFor(q,responses){
  const rs=responses.filter(r=>r.question_id===q.id),map={},merges=q.merges||{},labels=q.labels||{},aliasLabel={};
  let total=0;
  rs.forEach(r=>(r.answers||[]).forEach(raw=>{
    const t=String(raw).trim();if(!t)return;total++;
    const al=q.kind==='vote'?null:aliasKey(q,t);let key=q.kind==='vote'?t:(al?al.key:norm(t));if(!key)return;if(al)aliasLabel[al.key]=al.label;
    let hop=0;while(merges[key]&&hop++<10)key=merges[key];
    const g=map[key]||(map[key]={key,count:0,raws:{}});g.count++;g.raws[t]=(g.raws[t]||0)+1;
  }));
  const groups=Object.values(map).map(g=>{const top=Object.entries(g.raws).sort((a,b)=>b[1]-a[1])[0][0];
    return {...g,label:labels[g.key]||aliasLabel[g.key]||top.charAt(0).toUpperCase()+top.slice(1),variants:Object.keys(g.raws)}}).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  if(q.kind==='vote')(q.options||[]).forEach(o=>{if(!groups.some(g=>g.key===o))groups.push({key:o,count:0,raws:{},label:o,variants:[]})});
  return {groups,total,people:new Set(rs.map(r=>r.respondent.toLowerCase())).size};
}
function boardFor(q,responses){
  const {groups,total,people}=groupsFor(q,responses);
  const strong=groups.filter(g=>g.count>=2).length;
  const thin=q.kind==='vote'?false:strong<3;
  const useSurvey=q.use_survey!==false&&total>0&&(q.kind==='vote'||!thin||(q.labels||{}).__force===true);
  if(useSurvey){
    const top=groups.filter(g=>g.count>0).slice(0,6);const sum=top.reduce((n,g)=>n+g.count,0)||1;
    let answers=top.map(g=>({text:g.label,points:Math.max(1,Math.round(g.count/sum*100))}));
    if(q.kind==='vote')answers=groups.filter(g=>g.count>0||q.section==='finale').slice(0,6).map(g=>({text:g.label,points:Math.round(g.count/Math.max(1,total)*100)}));
    const takenV=q.kind==='vote'?groups.filter(g=>g.count>0).slice(0,6).map(g=>norm(g.label)):null;
    const taken=takenV||top.flatMap(g=>[g.key,...g.variants.map(norm)]);
    return {answers,source:'survey',thin,people,total,taken};
  }
  return {answers:(q.answers||[]).slice(0,6),source:'placeholder',thin,people,total};
}
function optionsFor(board,q,seed,taken=[]){
  const used=new Set([...board.map(a=>norm(a.text)),...taken.map(norm)]);
  const pool=[...(q.decoys||[]),...(q.answers||[]).map(a=>a.text)].filter(t=>{const n=norm(t);if(used.has(n))return false;used.add(n);return true});
  const fakes=shuffle(pool,seed+'f').slice(0,Math.max(0,12-board.length));
  const all=[...board.map((a,i)=>({text:a.text,real:true,idx:i})),...fakes.map(t=>({text:t,real:false}))];
  return shuffle(all,seed).map((o,i)=>({...o,key:KEYS[i]}));
}

/* ============ Realtime ============ */
function joinChannel(onEvent){
  const ch=sb.channel('feud-'+CFG.room,{config:{broadcast:{self:false}}});
  ['state','hello','ask','buzz','pick','fmpick','cmd'].forEach(ev=>ch.on('broadcast',{event:ev},({payload})=>onEvent(ev,payload||{})));
  let ok;const ready=new Promise(r=>ok=r);
  ch.subscribe(st=>{if(st==='SUBSCRIBED')ok()});
  return {ready,send:async(event,payload)=>{await ready;return ch.send({type:'broadcast',event,payload})}};
}

/* ============ Sound + confetti ============ */
let AC=null;
function audio(){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(_e){}return AC}
function tone(f,d,type='sine',vol=.25,when=0){const ac=audio();if(!ac)return;const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,ac.currentTime+when);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+when+d);o.connect(g).connect(ac.destination);o.start(ac.currentTime+when);o.stop(ac.currentTime+when+d)}
const SFX={
  ding(){tone(880,.5,'sine',.3);tone(1320,.6,'sine',.2,.08)},
  strike(){tone(130,.7,'square',.25);tone(98,.7,'sawtooth',.18)},
  buzz(){tone(520,.25,'square',.2)},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,.35,'triangle',.25,i*.12))},
  tick(){tone(1000,.05,'square',.08)},
  fanfare(){[392,523,659,784,659,784,1047].forEach((f,i)=>tone(f,.4,'triangle',.25,i*.14))}
};
function confetti(ms=3500){
  const c=$('#confetti'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;
  const cols=['#f5c542','#e53935','#2c6bed','#2fbf71','#ffffff','#b07cff'];
  const ps=Array.from({length:180},()=>({x:Math.random()*c.width,y:-20-Math.random()*c.height*.5,r:4+Math.random()*6,c:cols[Math.random()*cols.length|0],vx:-2+Math.random()*4,vy:2+Math.random()*4,a:Math.random()*6,va:-.2+Math.random()*.4}));
  const end=Date.now()+ms;
  (function f(){x.clearRect(0,0,c.width,c.height);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.a+=p.va;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r,-p.r/2,p.r*2,p.r);x.restore()});
    if(Date.now()<end)requestAnimationFrame(f);else x.clearRect(0,0,c.width,c.height)})();
}

/* ============ Router ============ */
const app=()=>$('#app');
let cleanup=null;
function route(){
  if(cleanup){try{cleanup()}catch(_e){}cleanup=null}
  const r=(location.hash||'#').slice(1).split('?')[0];
  ({'':homePage,tv:tvPage,host:hostPage,join:joinPage,survey:surveyPage,admin:adminPage}[r]||homePage)();
}
window.addEventListener('hashchange',route);

function pinGate(next){
  if(ss.get('pin')===CFG.pin)return next();
  app().innerHTML=`<div class="wrap"><h1 class="title" style="font-size:34px">Host only 🔒</h1>
  <div class="card"><label class="field">Host PIN<input id="pin" type="password" inputmode="numeric" autocomplete="off"></label><div class="err" id="perr"></div>
  <button class="btn gold block" id="pgo">Enter</button></div><a class="btn small" href="#">‹ Back</a></div>`;
  const go=()=>{if($('#pin').value.trim()===CFG.pin){ss.set('pin',CFG.pin);next()}else $('#perr').textContent='That PIN is not right.'};
  $('#pgo').onclick=go;$('#pin').onkeydown=e=>{if(e.key==='Enter')go()};$('#pin').focus();
}

/* ============ Home ============ */
function homePage(){
  app().innerHTML=`<div class="wrap" style="text-align:center;padding-top:40px">
   <div style="font-size:64px">🦃</div><h1 class="title" style="font-size:46px">Ruff Family Feud</h1>
   <p class="muted">Thanksgiving 2026 · Team Mac &amp; Cheese 🧀 vs Team Rice &amp; Peas 🍚</p>
   <div class="home-grid">
    <a class="btn gold" href="#join">📱 Join the game</a>
    <a class="btn" href="#survey">📝 Take the family survey</a>
    <a class="btn" href="#tv">📺 This is the TV</a>
    <a class="btn" href="#host">🎤 I'm the host</a>
    <a class="btn" href="#admin">⚙️ Questions &amp; survey results</a>
   </div></div>`;
}

/* ============ Survey ============ */
async function surveyPage(){
  app().innerHTML=`<div class="wrap"><p class="muted">Loading the survey…</p></div>`;
  window.scrollTo(0,0);
  let qs;try{qs=(await loadQuestions())}catch(e){app().innerHTML=`<div class="wrap"><div class="card">Could not load the survey. ${esc(e.message)}</div></div>`;return}
  const order={main:0,fast:1,finale:2};qs=qs.sort((a,b)=>order[a.section]-order[b.section]||a.position-b.position);
  if(!qs.length){app().innerHTML=`<div class="wrap"><div class="card">The survey isn't ready yet. Check back soon!</div></div>`;return}
  const draft=ls.get('survey',{name:'',i:-1,ans:{}});
  const st={name:draft.name,i:draft.i,ans:draft.ans||{}};
  const saveDraft=()=>ls.set('survey',st);
  function draw(){
    if(st.i<0){
      app().innerHTML=`<div class="wrap"><div style="font-size:52px;text-align:center">🦃</div><h1 class="title" style="font-size:34px;text-align:center">Ruff Family Survey</h1>
      <div class="card"><p style="margin-top:0">We're playing <b>Family Feud</b> at Thanksgiving, and <b>your answers</b> become the board! 🤫</p>
      <p class="muted">${qs.length} quick questions. Answer with the first thing that pops in your head. Don't overthink it, and don't tell anybody what you said.</p>
      <label class="field">Your name<input id="nm" value="${esc(st.name)}" placeholder="First name or nickname" autocomplete="given-name"></label><div class="err" id="e"></div>
      <button class="btn gold block" id="go">Let's go</button></div></div>`;
      const go=()=>{const n=$('#nm').value.trim();if(!n){$('#e').textContent='Type your name first.';return}st.name=n;st.i=0;saveDraft();draw()};
      $('#go').onclick=go;$('#nm').onkeydown=e=>{if(e.key==='Enter')go()};return;
    }
    if(st.i>=qs.length)return drawReview();
    const q=qs[st.i],cur=st.ans[q.id]||[],n=Math.max(1,q.max_answers||1),pct=Math.round(st.i/qs.length*100);
    const body=q.kind==='vote'
      ?`<p class="muted">${n>1?`Pick your top ${n}.`:'Pick one.'} Your vote is secret! 🤫</p>${(q.options||[]).map(o=>`<button class="vote-opt ${cur.includes(o)?'on':''}" data-v="${esc(o)}">${cur.includes(o)?'✓ ':''}${esc(o)}</button>`).join('')}`
      :`<p class="muted">${n>1?`Give up to ${n} answers.`:'Give one answer.'}</p>${Array.from({length:n},(_,k)=>`<label class="field">${n>1?'Answer '+(k+1)+(k?' (optional)':''):'Your answer'}<input class="ans" data-k="${k}" value="${esc(cur[k]||'')}" autocomplete="off"></label>`).join('')}`;
    app().innerHTML=`<div class="wrap"><div class="row"><span class="muted">${esc(st.name)}</span><span class="spacer"></span><span class="muted">${st.i+1} of ${qs.length}</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="card"><div class="q-prompt">${esc(q.prompt)}</div>${body}<div class="err" id="e"></div></div>
    <div class="row"><button class="btn" id="back">‹ Back</button><span class="spacer"></span><button class="btn gold" id="next">${st.i===qs.length-1?'Review':'Next ›'}</button></div></div>`;
    document.querySelectorAll('.vote-opt').forEach(b=>b.onclick=()=>{const v=b.dataset.v,c=(st.ans[q.id]||[]).slice();
      if(c.includes(v))c.splice(c.indexOf(v),1);else if(n===1)c.splice(0,c.length,v);else if(c.length<n)c.push(v);else{const e=$('#e');if(e)e.textContent=`You can pick ${n}. Tap one to unpick it first.`;return}
      st.ans[q.id]=c;saveDraft();draw()});
    const collect=()=>{if(q.kind==='vote')return st.ans[q.id]||[];return [...document.querySelectorAll('.ans')].map(i=>i.value.trim()).filter(Boolean)};
    $('#back').onclick=()=>{if(q.kind!=='vote')st.ans[q.id]=collect();st.i--;saveDraft();draw()};
    $('#next').onclick=()=>{const a=collect();if(!a.length){$('#e').textContent=q.kind==='vote'?'Pick one to keep going.':'Type at least one answer.';return}st.ans[q.id]=a;st.i++;saveDraft();draw()};
    document.querySelectorAll('.ans').forEach((inp,ix,all)=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(all[ix+1]&&!all[ix+1].value)all[ix+1].focus();else $('#next').click()}});
    const f=document.querySelector('.ans');if(f&&!f.value)f.focus();
  }
  function drawReview(){
    app().innerHTML=`<div class="wrap"><h1 class="title" style="font-size:30px">Almost done, ${esc(st.name)}!</h1>
    <div class="card"><p style="margin-top:0">You answered all ${qs.length} questions. Tap send and that's it.</p><div class="err" id="e"></div>
    <button class="btn gold block" id="send">📨 Send my answers</button><div style="height:10px"></div><button class="btn block" id="edit">‹ Go back and change something</button></div></div>`;
    $('#edit').onclick=()=>{st.i=qs.length-1;draw()};
    $('#send').onclick=async()=>{const b=$('#send');b.disabled=true;b.textContent='Sending…';
      try{
        const {error:de}=await sb.from('feud_responses').delete().ilike('respondent',st.name);if(de)throw de;
        const rows=qs.filter(q=>(st.ans[q.id]||[]).length).map(q=>({question_id:q.id,respondent:st.name,answers:st.ans[q.id]}));
        const {error}=await sb.from('feud_responses').insert(rows);if(error)throw error;
        ls.set('survey',{name:st.name,i:-1,ans:{}});ls.set('surveyDone',st.name);
        app().innerHTML=`<div class="wrap" style="text-align:center;padding-top:50px"><div style="font-size:70px">🎉</div><h1 class="title" style="font-size:38px">Thank you, ${esc(st.name)}!</h1><p class="muted" style="font-size:18px">Your answers are in. See you at Thanksgiving. Now keep it a secret! 🤫</p><p class="faint" style="font-size:14px">Want to change something? Take it again with the same name and your new answers replace these.</p><div class="row" style="justify-content:center;margin-top:18px"><a class="btn small" href="#">‹ Home</a><button class="btn small" id="again">Take it again</button></div></div>`;confetti();$('#again').onclick=()=>{ls.set('survey',{name:st.name,i:0,ans:{}});surveyPage()};
      }catch(e){$('#e').textContent='Could not send: '+e.message+'. Try again.';b.disabled=false;b.textContent='📨 Send my answers'}};
  }
  draw();
}

/* ============ Admin: questions + survey results ============ */
function adminPage(){pinGate(adminMain)}
async function adminMain(){
  app().innerHTML=`<div class="wrap"><p class="muted">Loading…</p></div>`;
  let Q=[],R=[];
  try{[Q,R]=await Promise.all([loadQuestions(),loadResponses()]);if(Q.length&&await ensureExtras(Q))Q=await loadQuestions()}catch(e){app().innerHTML=`<div class="wrap"><div class="card"><b>Can't reach the database.</b><p class="muted">${esc(e.message)}</p><p class="muted">If this is the first time, run the setup script in Supabase first.</p></div></div>`;return}
  const open=new Set(ls.get('adminOpen',[]));
  const keepOpen=()=>{const s=[...document.querySelectorAll('details.acc[open]')].map(d=>d.dataset.k).filter(Boolean);open.clear();s.forEach(k=>open.add(k));ls.set('adminOpen',s)};
  const SEC={main:'Rounds (4 get played)',finale:'Finale: the big vote',fast:'Fast Money'};
  const people=new Set(R.map(r=>r.respondent.toLowerCase()));
  const surveyUrl=siteBase()+'#survey';
  function qCard(q){
    const b=boardFor(q,R),g=groupsFor(q,R);
    const flag=g.total===0?'<span class="pill">No answers yet</span>':b.thin?'<span class="pill warn">Needs a look</span>':'<span class="pill ok">Ready</span>';
    const groupRows=g.groups.length?g.groups.map(gr=>`<div class="group-row"><div>${esc(gr.label)} <span class="faint">· ${gr.count}</span>${gr.variants.length>1?`<div class="raw">${esc(gr.variants.join(', '))}</div>`:''}</div>
      ${q.kind==='vote'?'':`<button class="btn small" data-act="rename" data-q="${q.id}" data-g="${esc(gr.key)}">Rename</button>
      <select data-act="merge" data-q="${q.id}" data-g="${esc(gr.key)}"><option value="">Merge into…</option>${g.groups.filter(o=>o.key!==gr.key).map(o=>`<option value="${esc(o.key)}">${esc(o.label)}</option>`).join('')}</select>`}</div>`).join(''):'<p class="faint">Nobody has answered this one yet.</p>';
    const merged=Object.keys(q.merges||{}).length;
    return `<details class="acc" data-k="${q.id}" ${open.has(q.id)?'open':''}><summary><span style="flex:1">${esc(q.prompt)}</span>${flag}</summary><div class="acc-body">
     <div class="sec-label">Board on game night (${b.source==='survey'?'from the survey':'placeholder answers'})</div>
     <div class="board-preview">${b.answers.map((a,i)=>`<div><span>${i+1}. ${esc(a.text)}</span><b>${a.points}</b></div>`).join('')}</div>
     ${b.thin&&g.total?`<p class="pill warn" style="margin-top:10px;display:inline-block">Not enough matching answers yet</p><p class="faint" style="font-size:14px">Fewer than 3 answers were given by more than one person. Merge answers that mean the same thing, or choose what to show:</p>
      <div class="row"><button class="btn small ${b.source==='placeholder'?'gold':''}" data-act="force" data-v="0" data-q="${q.id}">Keep placeholder answers</button><button class="btn small ${b.source==='survey'?'gold':''}" data-act="force" data-v="1" data-q="${q.id}">Use survey answers anyway</button></div>`:''}
     <div class="sec-label">Survey answers · ${g.people} ${g.people===1?'person':'people'}</div>${groupRows}
     ${merged?`<button class="btn small" data-act="unmerge" data-q="${q.id}" style="margin-top:10px">Undo all merges (${merged})</button>`:''}
     <label class="row" style="margin-top:14px;gap:8px"><input type="checkbox" data-act="usesurvey" data-q="${q.id}" ${q.use_survey!==false?'checked':''} style="width:20px;height:20px"> Use survey answers when they're ready</label>
     <div class="sec-label">Edit question</div>
     <label class="field">Question<input data-f="prompt" data-q="${q.id}" value="${esc(q.prompt)}"></label>
     ${q.kind==='vote'?`<label class="field">Picks per person<select data-f="max_answers" data-q="${q.id}">${[1,2,3].map(n=>`<option ${n===(q.max_answers||1)?'selected':''}>${n}</option>`).join('')}</select></label><label class="field">Choices (one per line)<textarea data-f="options" data-q="${q.id}">${esc((q.options||[]).join('\n'))}</textarea></label>`:
      `<label class="field">Answers per person in the survey<select data-f="max_answers" data-q="${q.id}">${[1,2,3].map(n=>`<option ${n===(q.max_answers||2)?'selected':''}>${n}</option>`).join('')}</select></label>
      <label class="field">Placeholder answers (one per line: answer | points)<textarea data-f="answers" data-q="${q.id}">${esc((q.answers||[]).map(a=>a.text+' | '+a.points).join('\n'))}</textarea></label>`}
     <label class="field">Fake answers for the phones (one per line)<textarea data-f="decoys" data-q="${q.id}">${esc((q.decoys||[]).join('\n'))}</textarea></label>
     <div class="row"><button class="btn small red" data-act="delq" data-q="${q.id}">Delete question</button><span class="spacer"></span><button class="btn small gold" data-act="saveq" data-q="${q.id}">Save changes</button></div>
    </div></details>`;
  }
  function draw(){
    const bySec=s=>Q.filter(q=>q.section===s);
    app().innerHTML=`<div class="wrap"><div class="row"><a class="btn small" href="#">‹ Home</a><span class="spacer"></span><a class="btn small" href="#tv">📺 TV</a><a class="btn small" href="#host">🎤 Host</a></div>
    <h1 class="title" style="font-size:32px;margin-top:16px">Questions &amp; Survey</h1>
    ${Q.length?'':`<div class="card"><p style="margin-top:0">No questions yet. Add the starter set we planned (14 round questions, the big vote, and 5 Fast Money).</p><button class="btn gold block" data-act="starter">➕ Add the starter questions</button></div>`}
    <details class="acc" data-k="link" ${open.has('link')?'open':''}><summary>📨 Send the survey <span class="pill" style="margin-left:6px">${people.size} answered</span></summary><div class="acc-body">
     <p class="muted" style="margin-top:6px">Text this to the family by <b>Wed, Nov 18</b>:</p>
     <div class="card" id="msg" style="margin:8px 0;font-size:15px;white-space:pre-wrap">🦃 Ruff Family Feud is coming to Thanksgiving! Take the secret survey (5 min). Your answers become the game board 👀
${surveyUrl}</div>
     <button class="btn small gold" data-act="copy">📋 Copy message</button>
     ${people.size?`<p class="faint" style="font-size:14px">Answered so far: ${esc([...new Set(R.map(r=>r.respondent))].join(', '))}</p>`:''}
    </div></details>
    ${['main','finale','fast'].map(s=>bySec(s).length?`<div class="sec-label">${SEC[s]}</div>${bySec(s).map(qCard).join('')}`:'').join('')}
    ${Q.length?`<div class="sec-label">More</div><div class="row"><button class="btn small" data-act="addq" data-s="main">＋ Round question</button><button class="btn small" data-act="addq" data-s="fast">＋ Fast Money question</button><span class="spacer"></span><button class="btn small red" data-act="wipe">Clear all survey answers</button></div>`:''}
    </div>`;
  }
  async function reload(){[Q,R]=await Promise.all([loadQuestions(),loadResponses()]);keepOpen();draw()}
  const getQ=id=>Q.find(q=>q.id===id);
  async function patch(q,obj,msg){try{await saveQuestion({id:q.id,...obj});Object.assign(q,obj);if(msg)toast(msg);keepOpen();draw()}catch(e){toast('Save failed: '+e.message)}}
  app().onclick=async ev=>{
    const el=ev.target.closest('[data-act]');if(!el||el.tagName==='SELECT'||el.type==='checkbox')return;
    const q=el.dataset.q&&getQ(el.dataset.q),act=el.dataset.act;
    if(act==='starter'){el.disabled=true;try{await addStarter();toast('Starter questions added 🎉');await reload()}catch(e){toast('Failed: '+e.message);el.disabled=false}}
    if(act==='copy'){const t=$('#msg').textContent;try{await navigator.clipboard.writeText(t);toast('Copied! Paste it in the family text 📋')}catch(_e){toast('Select the message and copy it')}}
    if(act==='rename'){const g=el.dataset.g,cur=(q.labels||{})[g]||'';const v=prompt('What should this answer say on the board?',cur||el.closest('.group-row').firstElementChild.firstChild.textContent.trim());if(v===null)return;const labels={...(q.labels||{})};if(v.trim())labels[g]=v.trim();else delete labels[g];await patch(q,{labels},'Renamed')}
    if(act==='unmerge')await patch(q,{merges:{}},'Merges undone');
    if(act==='force'){const labels={...(q.labels||{})};if(el.dataset.v==='1')labels.__force=true;else delete labels.__force;await patch(q,{labels},el.dataset.v==='1'?'Using survey answers':'Using placeholder answers')}
    if(act==='saveq'){
      const val=f=>{const i=document.querySelector(`[data-f="${f}"][data-q="${q.id}"]`);return i?i.value:null};
      const obj={prompt:val('prompt').trim(),decoys:val('decoys').split('\n').map(s=>s.trim()).filter(Boolean)};
      if(!obj.prompt){toast('The question needs words');return}
      if(q.kind==='vote'){obj.options=val('options').split('\n').map(s=>s.trim()).filter(Boolean);obj.max_answers=+val('max_answers')||1}
      else{obj.max_answers=+val('max_answers');obj.answers=val('answers').split('\n').map(l=>{const [t,p]=l.split('|');return {text:(t||'').trim(),points:Math.max(1,parseInt(p)||1)}}).filter(a=>a.text).slice(0,6)}
      await patch(q,obj,'Saved ✓');
    }
    if(act==='delq'&&confirm('Delete this question and its survey answers?')){const {error}=await sb.from('feud_questions').delete().eq('id',q.id);if(error)toast(error.message);else{toast('Deleted');await reload()}}
    if(act==='addq'){const s=el.dataset.s,pos=Math.max(0,...Q.map(x=>x.position))+1;try{await saveQuestion({position:pos,section:s,prompt:'New question — tap to edit',kind:'open',max_answers:2,options:[],answers:[],decoys:[],use_survey:true,merges:{},labels:{}});await reload();toast('Added at the bottom')}catch(e){toast(e.message)}}
    if(act==='wipe'&&confirm('Delete EVERY survey answer? This cannot be undone.')){const ids=R.map(r=>r.id);for(const id of ids)await sb.from('feud_responses').delete().eq('id',id);await reload();toast('Survey answers cleared')}
  };
  app().onchange=async ev=>{
    const el=ev.target,q=el.dataset.q&&getQ(el.dataset.q);
    if(el.dataset.act==='merge'&&el.value){const merges={...(q.merges||{}),[el.dataset.g]:el.value};await patch(q,{merges},'Merged ✓')}
    if(el.dataset.act==='usesurvey')await patch(q,{use_survey:el.checked},el.checked?'Using survey answers':'Using placeholder answers');
  };
  app().addEventListener('toggle',keepOpen,true);
  draw();
  cleanup=()=>{app().onclick=null;app().onchange=null};
}

/* ============ TV (runs the game) ============ */
function tvPage(){
  let S=null,Q=[],R=[],ch=null,lastEv=0,evn=0,saveT=null,tickT=null,started=false;
  app().innerHTML=`<div class="tv-gate"><div style="font-size:8vw">🦃</div><h1 class="title">Ruff Family Feud</h1><p class="muted" style="font-size:2vw">Press OK on the remote to start</p><button class="btn gold" id="startTv" autofocus>▶ Start</button><p class="faint" id="tvmsg" style="font-size:1.4vw"></p></div><div id="tvroot"></div>`;
  $('#startTv').onclick=()=>{audio();boot()};
  setTimeout(()=>{const b=$('#startTv');if(b)b.focus()},100);
  const fresh=()=>({phase:'lobby',teams:CFG.teams.map(t=>({...t,score:0})),players:{},order:[],ptr:[0,0],round:0,used:[],q:null,board:[],opts:[],picked:[],strikes:0,bank:0,mult:1,control:null,active:null,face:null,turn:0,fm:null,ev:null,win:null,trip:null,_t:Date.now()});
  async function boot(){
    $('#tvmsg').textContent='Connecting…';
    try{[Q,R]=await Promise.all([loadQuestions(),loadResponses()])}catch(e){$('#tvmsg').textContent='Could not reach the game database: '+e.message;return}
    if(!Q.length){$('#tvmsg').textContent='No questions yet. Add them on the host phone under Questions & survey results.';return}
    try{const {data}=await sb.from('feud_state').select('*').eq('room',CFG.room).maybeSingle();if(data&&data.state&&Date.now()-(data.state._t||0)<12*3600e3)S=data.state}catch(_e){}
    if(!S)S=fresh();
    evn=S.ev?S.ev.n:0;lastEv=evn;
    ch=joinChannel(onEvent);await ch.ready;started=true;
    document.querySelector('.tv-gate').remove();push();
    tickT=setInterval(tick,250);
  }
  cleanup=()=>{clearInterval(tickT)};
  function push(){if(MOCK)window.__S=S;S._t=Date.now();ch.send('state',S);clearTimeout(saveT);saveT=setTimeout(()=>sb.from('feud_state').upsert({room:CFG.room,state:S,updated_at:new Date().toISOString()}).then(()=>{}),400);draw()}
  const P=id=>S.players[id];
  const teamOf=id=>P(id)?P(id).team:0;
  const teamPlayers=t=>S.order.filter(id=>P(id)&&P(id).team===t);
  function nextPlayer(t){const ps=teamPlayers(t);if(!ps.length)return null;const id=ps[S.ptr[t]%ps.length];S.ptr[t]=(S.ptr[t]+1)%ps.length;return id}
  const allRevealed=()=>S.board.every(b=>b.revealed);
  function setEv(type,extra={}){S.ev={type,n:++evn,...extra}}
  function startFaceoff(){
    const a=nextPlayer(0),b=nextPlayer(1);
    if(!a||!b){S.control=a?0:1;S.phase='play';S.face=null;S.active=nextPlayer(S.control);return}
    S.face={ids:[a,b],buzzed:null,tried:[]};S.active=null;S.phase='faceoff';
  }
  async function startRound(qid){
    try{R=await loadResponses();Q=await loadQuestions()}catch(_e){}
    const q=qid?Q.find(x=>x.id===qid):Q.filter(x=>x.section==='main'&&!S.used.includes(x.id))[0];
    if(!q)return;
    S.round++;S.mult=CFG.multipliers[S.round-1]||3;S.used.push(q.id);
    const b=boardFor(q,R);S.q={id:q.id,prompt:q.prompt};S.board=b.answers.map(a=>({...a,revealed:false}));
    S.opts=optionsFor(S.board,q,q.id+S.round,b.taken);S.picked=[];S.strikes=0;S.bank=0;S.control=null;S.win=null;
    startFaceoff();push();
  }
  function right(idx){
    const slot=S.board[idx];if(!slot||slot.revealed)return;slot.revealed=true;const pts=slot.points*S.mult;setEv('ding',{slot:idx});
    const ph=S.phase;
    if(ph==='faceoff'){S.bank+=pts;S.control=teamOf(S.active);S.face=null;S.phase='play';if(allRevealed())return award(S.control,false);S.active=nextPlayer(S.control)}
    else if(ph==='play'){S.bank+=pts;if(allRevealed())return award(S.control,false);S.active=nextPlayer(S.control)}
    else if(ph==='steal'){S.bank+=pts;return award(1-S.control,true)}
    else if(ph==='finale'){const t=teamOf(S.active);S.teams[t].score+=slot.points;if(allRevealed())return finaleDone();S.turn=1-t;S.active=nextPlayer(S.turn)||nextPlayer(t)}
    push();
  }
  function wrong(){
    const ph=S.phase;
    if(ph==='faceoff'){setEv('strike',{count:1});S.face.tried.push(S.active);const other=S.face.ids.find(i=>!S.face.tried.includes(i));
      if(other){S.active=other;S.face.buzzed=other}else startFaceoff()}
    else if(ph==='play'){S.strikes++;setEv('strike',{count:S.strikes});if(S.strikes>=3){S.phase='steal';S.active=nextPlayer(1-S.control)||null;if(!S.active)return award(S.control,false)}else S.active=nextPlayer(S.control)}
    else if(ph==='steal'){setEv('strike',{count:1});return award(S.control,false)}
    else if(ph==='finale'){setEv('strike',{count:1});const t=teamOf(S.active);S.turn=1-t;S.active=nextPlayer(S.turn)||nextPlayer(t)}
    push();
  }
  function award(t,stolen){S.teams[t].score+=S.bank;S.win={team:t,bank:S.bank,stolen};S.phase='roundEnd';S.active=null;S.face=null;setEv('win');push()}
  function pick(key){const o=S.opts.find(x=>x.key===key);if(!o||S.picked.includes(key))return;S.picked.push(key);if(o.real)right(o.idx);else wrong()}
  async function startFinale(){
    try{R=await loadResponses();Q=await loadQuestions()}catch(_e){}
    const q=Q.find(x=>x.section==='finale');if(!q){toast('No finale question');return}
    const b=boardFor(q,R);S.q={id:q.id,prompt:q.prompt};S.board=b.answers.map(a=>({...a,revealed:false}));
    S.opts=optionsFor(S.board,q,q.id+'finale',b.taken);S.picked=[];S.strikes=0;S.bank=0;S.mult=1;S.win=null;S.round='F';S.phase='finale';
    S.turn=S.teams[0].score<=S.teams[1].score?0:1;S.active=nextPlayer(S.turn)||nextPlayer(1-S.turn);push();
  }
  function finaleDone(){const top=S.board.slice().sort((a,b)=>b.points-a.points)[0];S.trip=top?top.text:'';S.phase='finaleEnd';S.active=null;setEv('trip');push()}
  async function startFm(ids){
    try{R=await loadResponses();Q=await loadQuestions()}catch(_e){}
    const team=S.teams[0].score>=S.teams[1].score?0:1,ps=teamPlayers(team);
    const p=ids&&ids.length===2?ids:[ps[0],ps[1]||ps[0]];
    const qs=Q.filter(x=>x.section==='fast').slice(0,5).map(q=>{const bf=boardFor(q,R),b=bf.answers;return {prompt:q.prompt,board:b,opts:optionsFor(b,q,q.id+'fm',bf.taken)}});
    if(!qs.length){toast('No Fast Money questions');return}
    S.fm={team,ids:p,qs,picks:[[],[]],stage:'ready1',qi:0,endsAt:0,shown:[0,0]};S.phase='fm';S.active=null;push();
  }
  function fmResolve(q,key){const o=q.opts.find(x=>x.key===key);if(!o)return null;return o.real?{text:q.board[o.idx].text,pts:q.board[o.idx].points,key}:{text:o.text,pts:0,key}}
  function fmAdvance(){const f=S.fm;f.qi++;if(f.qi>=f.qs.length){f.stage=f.stage==='p1'?'reveal1':'reveal2';f.endsAt=0}}
  const fmTotal=()=>S.fm?[0,1].reduce((n,p)=>n+S.fm.picks[p].slice(0,S.fm.shown[p]).reduce((m,x)=>m+(x?x.pts:0),0),0):0;
  function tick(){
    const f=S&&S.fm;if(!f||!(f.stage==='p1'||f.stage==='p2'))return;
    const left=f.endsAt-Date.now();
    if(left<=0){f.stage=f.stage==='p1'?'reveal1':'reveal2';f.endsAt=0;push();return}
    const el=$('#fmTimer');if(el){const s=Math.ceil(left/1000);if(el.textContent!==String(s)){el.textContent=s;if(s<=5)SFX.tick()}}
  }
  function onEvent(ev,p){
    if(!started)return;
    if(ev==='ask')return push();
    if(ev==='hello'){
      if(!p.id||!p.name)return;
      if(!P(p.id)){S.players[p.id]={name:String(p.name).slice(0,20),team:p.team===1?1:0};S.order.push(p.id)}
      else{P(p.id).name=String(p.name).slice(0,20);if(p.switchTeam!==undefined&&S.phase==='lobby')P(p.id).team=p.switchTeam===1?1:0}
      return push();
    }
    if(ev==='buzz'){if(S.phase==='faceoff'&&S.face&&!S.face.buzzed&&S.face.ids.includes(p.id)&&!S.face.tried.includes(p.id)){S.face.buzzed=p.id;S.active=p.id;setEv('buzz');push()}return}
    if(ev==='pick'){if(p.id&&p.id===S.active&&['faceoff','play','steal','finale'].includes(S.phase)&&(S.phase!=='faceoff'||(S.face&&S.face.buzzed===p.id)))pick(p.key);return}
    if(ev==='fmpick'){
      const f=S.fm;if(!f)return;const pi=f.stage==='p1'?0:f.stage==='p2'?1:-1;if(pi<0||p.id!==f.ids[pi]||p.qi!==f.qi)return;
      const q=f.qs[f.qi];let r=p.key?fmResolve(q,p.key):null;
      if(r&&pi===1&&f.picks[0][f.qi]&&norm(f.picks[0][f.qi].text)===norm(r.text))return;
      f.picks[pi][f.qi]=r;fmAdvance();return push();
    }
    if(ev==='cmd')return cmd(p);
  }
  async function cmd(p){
    const c=p.cmd;
    if(c==='start'||c==='next'){
      if(S.phase==='lobby'||(S.phase==='roundEnd'&&S.round<CFG.multipliers.length))return startRound(p.qid);
      if(S.phase==='roundEnd')return startFinale();
      if(S.phase==='finaleEnd')return startFm(p.ids);
    }
    if(c==='round')return startRound(p.qid);
    if(c==='finale')return startFinale();
    if(c==='fm')return startFm(p.ids);
    if(c==='reveal'){const i=p.idx;if(['faceoff','play','steal','finale'].includes(S.phase)&&S.active){const o=S.opts.find(x=>x.real&&x.idx===i);if(o&&!S.picked.includes(o.key))S.picked.push(o.key);return right(i)}
      if(S.board[i]&&!S.board[i].revealed){S.board[i].revealed=true;S.board[i].missed=true;setEv('ding');return push()}}
    if(c==='strike'){if(['faceoff','play','steal','finale'].includes(S.phase)&&S.active)return wrong()}
    if(c==='revealRest'){let d=0;S.board.forEach((b,i)=>{if(!b.revealed){b.revealed=true;b.missed=true;d++}});if(d)setEv('ding');return push()}
    if(c==='skip'){if(S.phase==='faceoff'&&S.face){startFaceoff();return push()}if(S.phase==='play')S.active=nextPlayer(S.control);else if(S.phase==='steal')S.active=nextPlayer(1-S.control);else if(S.phase==='finale'){S.turn=1-S.turn;S.active=nextPlayer(S.turn)}return push()}
    if(c==='award'){if(['play','steal','faceoff'].includes(S.phase))return award(p.team===1?1:0,false)}
    if(c==='move'&&P(p.id)){P(p.id).team=p.team===1?1:0;return push()}
    if(c==='remove'&&P(p.id)){delete S.players[p.id];S.order=S.order.filter(x=>x!==p.id);if(S.active===p.id)S.active=null;return push()}
    if(c==='rename'){S.teams[p.team===1?1:0].name=String(p.name||'').slice(0,28)||CFG.teams[p.team].name;return push()}
    if(c==='score'){S.teams[p.team===1?1:0].score=Math.max(0,+p.score||0);return push()}
    if(c==='fmGo'&&S.fm){const f=S.fm;if(f.stage==='ready1'){f.stage='p1';f.qi=0;f.endsAt=Date.now()+CFG.fmTimes[0]*1000}else if(f.stage==='ready2'){f.stage='p2';f.qi=0;f.endsAt=Date.now()+CFG.fmTimes[1]*1000}return push()}
    if(c==='fmReveal'&&S.fm){const f=S.fm,pi=f.stage==='reveal1'?0:f.stage==='reveal2'?1:-1;if(pi<0)return;
      if(f.shown[pi]<f.qs.length){f.shown[pi]++;const x=f.picks[pi][f.shown[pi]-1];setEv(x&&x.pts?'ding':'strike',{count:1,quiet:!x})}
      if(f.shown[pi]>=f.qs.length){if(pi===0)f.stage='ready2';else{f.stage='done';if(fmTotal()>=CFG.fmTarget)setEv('jackpot')}}
      return push()}
    if(c==='fmSwap'&&S.fm&&S.fm.stage==='ready1'&&p.ids){S.fm.ids=p.ids;return push()}
    if(c==='finish'){S.phase='over';S.active=null;setEv('over');return push()}
    if(c==='newGame'){const keep={players:S.players,order:S.order};S=fresh();Object.assign(S,keep);evn++;S.ev={type:'none',n:evn};return push()}
    if(c==='lobby'){S.phase='lobby';S.active=null;return push()}
  }
  /* ---- drawing ---- */
  const name=id=>P(id)?esc(P(id).name):'Someone';
  const teamLbl=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
  function scoreBox(t){return `<div class="score ${S.control===t&&['play','steal'].includes(S.phase)?'ctrl':''}"><div class="em">${S.teams[t].emoji}</div><div class="nm">${esc(S.teams[t].name)}</div><div class="pts">${S.teams[t].score}</div></div>`}
  function boardHTML(){const n=Math.max(4,S.board.length%2?S.board.length+1:S.board.length),slots=[];
    for(let i=0;i<n;i++){const b=S.board[i];slots.push(b?`<div class="slot ${b.revealed?'rev':''} ${b.missed?'missed':''}"><div class="slot-in"><div class="face front"><span>${i+1}</span></div><div class="face back"><span class="t">${esc(b.text)}</span><span class="p">${b.points*(S.mult||1)}</span></div></div></div>`:'<div class="slot empty"></div>')}
    const order=[];const half=n/2;for(let r=0;r<half;r++){order.push(slots[r],slots[r+half])}
    return `<div class="board" style="grid-template-rows:repeat(${half},1fr)">${order.join('')}</div>`}
  function statusText(){
    switch(S.phase){
      case 'faceoff':return S.face&&S.face.buzzed?`⚡ ${name(S.face.buzzed)} buzzed in! Pick an answer`:`⚡ FACEOFF: ${name(S.face.ids[0])} vs ${name(S.face.ids[1])}. Buzz in!`;
      case 'play':return `${name(S.active)}, you're up! <span class="faint">(${teamLbl(S.control)})</span>`;
      case 'steal':return `🚨 ${teamLbl(1-S.control)} can STEAL! ${name(S.active)}, one pick`;
      case 'roundEnd':return `🏆 ${teamLbl(S.win.team)} ${S.win.stolen?'steals':'wins'} ${S.win.bank} points!`;
      case 'finale':return `${name(S.active)}, you're up! <span class="faint">(${teamLbl(teamOf(S.active))})</span>`;
    }return ''}
  function draw(){
    const root=$('#tvroot');if(!root||!S)return;
    let h='';
    const joinUrl=siteBase()+'#join';
    if(S.phase==='lobby'){
      h=`<div class="tv"><div class="tv-head"><div style="font-size:4vw">🦃</div><h1 class="title">Ruff Family Feud</h1><span class="spacer"></span><span class="tv-round">Waiting for the host to start</span></div>
      <div class="lobby"><div class="join-box"><div class="qr" id="qr"></div><div class="url">${esc(joinUrl.replace(/^https?:\/\//,''))}</div><div class="hint">Scan with your phone camera to join</div></div>
      ${[0,1].map(t=>`<div class="team-col"><div class="em">${S.teams[t].emoji}</div><h3>${esc(S.teams[t].name)}</h3>${teamPlayers(t).map(id=>`<div class="p">${name(id)}</div>`).join('')||'<div class="faint" style="font-size:1.6vw">Nobody yet</div>'}</div>`).join('')}</div></div>`;
    }else if(['faceoff','play','steal','roundEnd','finale'].includes(S.phase)){
      const rl=S.phase==='finale'?'🌍 The big vote':`Round ${S.round}${S.mult>1?` · ${S.mult===2?'Double':'Triple'} points!`:''}`;
      h=`<div class="tv"><div class="tv-head"><h1 class="title">Ruff Family Feud</h1><span class="spacer"></span><span class="tv-round">${rl}</span></div>
      <div class="tv-prompt">${esc(S.q.prompt)}</div>
      <div class="tv-mid">${scoreBox(0)}${boardHTML()}${scoreBox(1)}</div>
      <div class="tv-foot">${S.phase!=='finale'?`<div class="bank">BANK ${S.bank}</div>`:''}<div class="status">${statusText()}</div>${S.phase==='play'||S.phase==='steal'?`<div class="strikes">${'<i>X</i>'.repeat(Math.min(3,S.strikes))}</div>`:''}</div></div>`;
    }else if(S.phase==='finaleEnd'){
      h=`<div class="tv"><div class="tv-head"><h1 class="title">Ruff Family Feud</h1></div><div class="reveal-big"><div class="k">🥁 The family has spoken… our next trip is</div><div class="v">${esc(S.trip)}!</div>
      <div class="k" style="font-size:2vw">${S.board.slice().sort((a,b)=>b.points-a.points).map(b=>`${esc(b.text)} ${b.points}%`).join(' · ')}</div></div></div>`;
    }else if(S.phase==='fm'){
      const f=S.fm,stageTxt={ready1:`${name(f.ids[0])} is up first. Everyone else, no peeking! 🙈`,p1:`${name(f.ids[0])} is answering…`,reveal1:`Let's see what ${name(f.ids[0])} said!`,ready2:`${name(f.ids[1])}, your turn. Don't repeat an answer!`,p2:`${name(f.ids[1])} is answering…`,reveal2:`Let's see what ${name(f.ids[1])} said!`,done:fmTotal()>=CFG.fmTarget?`💰 JACKPOT! ${teamLbl(f.team)} hits ${fmTotal()}!`:`Fast Money total: ${fmTotal()}`}[f.stage];
      const col=pi=>`<div class="fm-col"><h3>${name(f.ids[pi])}</h3>${f.qs.map((q,i)=>{const x=f.picks[pi][i],sh=i<f.shown[pi];return `<div class="fm-row"><span class="t">${sh?(x?esc(x.text):'—'):(x!==undefined&&(f.stage==='p'+(pi+1)||f.stage.startsWith('reveal'))?'•••':'')}</span><span class="p">${sh?(x?x.pts:0):''}</span></div>`}).join('')}</div>`;
      const live=f.stage==='p1'||f.stage==='p2';
      h=`<div class="tv"><div class="tv-head"><h1 class="title">⚡ Fast Money</h1><span class="spacer"></span><span class="tv-round">${teamLbl(f.team)} · goal ${CFG.fmTarget}</span></div>
      ${live?`<div class="tv-prompt">${esc(f.qs[Math.min(f.qi,f.qs.length-1)].prompt)}</div>`:''}
      <div class="fm">${col(0)}${col(1)}</div>
      <div class="tv-foot">${live?`<div class="bank" style="font-size:4vw">⏱ <span id="fmTimer">${Math.max(0,Math.ceil((f.endsAt-Date.now())/1000))}</span></div>`:''}<div class="status">${stageTxt}</div><div class="bank">TOTAL ${fmTotal()}</div></div></div>`;
    }else if(S.phase==='over'){
      const w=S.teams[0].score===S.teams[1].score?-1:S.teams[0].score>S.teams[1].score?0:1;
      h=`<div class="tv"><div class="tv-head"><h1 class="title">Ruff Family Feud</h1></div><div class="reveal-big"><div class="k">${w<0?'🤝 It\'s a tie!':'🏆 And the winner is…'}</div><div class="v" style="font-size:8vw">${w<0?'Everybody!':teamLbl(w)}</div>
      <div class="k">${teamLbl(0)} ${S.teams[0].score} · ${teamLbl(1)} ${S.teams[1].score}</div>${S.trip?`<div class="k" style="font-size:2vw">Next family trip: ${esc(S.trip)} ✈️</div>`:''}</div></div>`;
    }
    root.innerHTML=h;
    if(S.phase==='lobby'&&window.qrcode){try{const qr=qrcode(0,'M');qr.addData(joinUrl);qr.make();$('#qr').innerHTML=qr.createSvgTag({cellSize:8,margin:2,scalable:true})}catch(_e){}}
    if(S.ev&&S.ev.n!==lastEv){lastEv=S.ev.n;fx(S.ev)}
  }
  function fx(e){
    if(e.type==='ding')SFX.ding();
    if(e.type==='buzz')SFX.buzz();
    if(e.type==='win')SFX.win();
    if(e.type==='strike'){if(!e.quiet)SFX.strike();const o=document.createElement('div');o.className='bigx';o.innerHTML='<i>X</i>'.repeat(Math.max(1,Math.min(3,e.count||1)));document.body.appendChild(o);setTimeout(()=>o.remove(),1400)}
    if(e.type==='trip'||e.type==='jackpot'||e.type==='over'){SFX.fanfare();confetti(5000)}
  }
}

/* ============ Player phone ============ */
function joinPage(){
  const me={id:myId(),name:pstore.get('name',''),team:pstore.get('team',0)};
  let S=null,ch=null,joined=false,lastActive=null,timerT=null,off=0;
  const left=()=>S&&S.fm?Math.max(0,Math.ceil((S.fm.endsAt-(Date.now()+off))/1000)):0;
  function form(){
    app().innerHTML=`<div class="wrap" style="padding-top:30px"><div style="font-size:52px;text-align:center">🦃</div><h1 class="title" style="font-size:34px;text-align:center">Join the game</h1>
    <div class="card"><label class="field">Your name<input id="nm" value="${esc(me.name)}" maxlength="20" placeholder="First name or nickname"></label>
    <div class="field">Pick your team</div><div class="team-pick">${CFG.teams.map((t,i)=>`<button data-t="${i}" class="${me.team===i?'on':''}"><span class="em">${t.emoji}</span>${esc(t.name)}</button>`).join('')}</div>
    <div class="err" id="e"></div><button class="btn gold block" id="go" style="margin-top:14px">I'm in!</button></div></div>`;
    document.querySelectorAll('.team-pick button').forEach(b=>b.onclick=()=>{me.team=+b.dataset.t;document.querySelectorAll('.team-pick button').forEach(x=>x.classList.toggle('on',x===b))});
    $('#nm').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};
    $('#go').onclick=()=>{const n=$('#nm').value.trim();if(!n){$('#e').textContent='Type your name first.';return}me.name=n;pstore.set('name',n);pstore.set('team',me.team);start()};
  }
  function start(){
    joined=true;pstore.set('joinedRoom',CFG.room);app().innerHTML=`<div class="wrap"><p class="muted">Connecting to the TV…</p></div>`;
    ch=joinChannel((ev,p)=>{if(ev==='state'){S=p;off=(p._t||Date.now())-Date.now();if(!S.players[me.id])ch.send('hello',{id:me.id,name:me.name,team:me.team});draw()}});
    ch.ready.then(()=>{ch.send('hello',{id:me.id,name:me.name,team:me.team});ch.send('ask',{})});
    const vis=()=>{if(document.visibilityState==='visible'&&ch)ch.send('ask',{})};document.addEventListener('visibilitychange',vis);
    timerT=setInterval(()=>{const el=$('#pTimer');if(el)el.textContent=left()},250);
    cleanup=()=>{document.removeEventListener('visibilitychange',vis);clearInterval(timerT)};
  }
  const tName=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
  const pname=id=>S.players[id]?esc(S.players[id].name):'Someone';
  function optsHTML(opts,picked,dis=[]){return `<div class="opts">${opts.map(o=>`<button class="opt" data-k="${o.key}" ${picked.includes(o.key)||dis.includes(o.key)?'disabled':''}><b>${o.key}</b><span>${esc(o.text)}</span></button>`).join('')}</div>`}
  function draw(){
    if(!S)return;const mine=S.players[me.id];if(!mine){app().innerHTML=`<div class="wrap"><p class="muted">Joining…</p></div>`;return}
    const t=mine.team;let body='';
    const myTurn=S.active===me.id;
    if(myTurn&&lastActive!==me.id&&navigator.vibrate)try{navigator.vibrate([120,60,120])}catch(_e){}
    lastActive=S.active;
    switch(S.phase){
      case 'lobby':body=`<div class="big-msg">You're in! 🎉</div><p class="muted" style="text-align:center">Waiting for the host to start. Watch the TV.</p>
        <div class="card" style="text-align:center"><div style="font-size:44px">${S.teams[t].emoji}</div><b>${esc(S.teams[t].name)}</b><div style="height:10px"></div><button class="btn small" id="sw">Switch to ${tName(1-t)}</button></div><p style="text-align:center"><a class="faint" href="#join?new=1" id="chg">Not ${esc(mine.name)}? Change name</a></p>`;break;
      case 'faceoff':
        if(S.face&&S.face.ids.includes(me.id)&&!S.face.tried.includes(me.id)){
          if(!S.face.buzzed)body=`<div class="big-msg">⚡ Faceoff! Buzz first!</div><button class="buzzer" id="buzz">BUZZ</button>`;
          else if(S.face.buzzed===me.id)body=`<div class="big-msg">You buzzed first! Pick an answer 👇</div>${optsHTML(S.opts,S.picked)}`;
          else body=`<div class="big-msg">${pname(S.face.buzzed)} buzzed first 😬</div>`;
        }else body=`<div class="big-msg">⚡ Faceoff!</div><p class="muted" style="text-align:center">${S.face?pname(S.face.ids[0])+' vs '+pname(S.face.ids[1]):''}</p>`;break;
      case 'play':case 'steal':case 'finale':
        if(myTurn)body=`<div class="big-msg">${S.phase==='steal'?'🚨 One pick to STEAL!':"You're up! Pick an answer 👇"}</div>${optsHTML(S.opts,S.picked)}`;
        else body=`<div class="big-msg">${pname(S.active)} is picking…</div><p class="muted" style="text-align:center">Watch the TV 📺</p>`;break;
      case 'roundEnd':body=`<div class="big-msg">🏆 ${tName(S.win.team)} ${S.win.stolen?'stole':'won'} ${S.win.bank} points!</div>`;break;
      case 'finaleEnd':body=`<div class="big-msg">Next family trip:<br><span style="font-size:40px;color:var(--gold)">${esc(S.trip)}!</span> ✈️</div>`;break;
      case 'fm':{const f=S.fm,pi=f.stage==='p1'?0:f.stage==='p2'?1:-1;
        if(pi>=0&&f.ids[pi]===me.id&&f.qi<f.qs.length){const q=f.qs[f.qi],dis=pi===1&&f.picks[0][f.qi]?q.opts.filter(o=>o.text&&f.picks[0][f.qi]&&o.key===f.picks[0][f.qi].key).map(o=>o.key):[];
          body=`<div class="timer">⏱ <span id="pTimer">${left()}</span></div><div class="big-msg" style="margin:10px 0">${esc(q.prompt)}</div>${optsHTML(q.opts,[],dis)}<button class="btn block" id="pass" style="margin-top:12px">Pass ›</button>`}
        else if(f.ids.includes(me.id)&&(f.stage==='ready1'||f.stage==='ready2')&&f.ids[f.stage==='ready1'?0:1]===me.id)body=`<div class="big-msg">⚡ Fast Money!<br>Get ready, you're next.</div><p class="muted" style="text-align:center">The host will start your timer.</p>`;
        else body=`<div class="big-msg">⚡ Fast Money!</div><p class="muted" style="text-align:center">Watch the TV 📺</p>`;break}
      case 'over':body=`<div class="big-msg">Game over! 🎉</div><p class="muted" style="text-align:center">${tName(0)} ${S.teams[0].score} · ${tName(1)} ${S.teams[1].score}</p>`;break;
    }
    app().innerHTML=`<div class="ph-top"><span style="font-size:24px">${S.teams[t].emoji}</span><span class="ph-team">${esc(mine.name)}</span><span class="spacer"></span><span class="pill">${S.teams[0].emoji} ${S.teams[0].score} · ${S.teams[1].emoji} ${S.teams[1].score}</span></div><div class="ph-main">${body}</div>`;
    const sw=$('#sw');if(sw)sw.onclick=()=>{me.team=1-t;pstore.set('team',me.team);ch.send('hello',{id:me.id,name:me.name,team:me.team,switchTeam:me.team})};
    const bz=$('#buzz');if(bz)bz.onclick=()=>{bz.disabled=true;bz.textContent='…';ch.send('buzz',{id:me.id})};
    document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{document.querySelectorAll('.opt').forEach(x=>x.disabled=true);
      if(S.phase==='fm')ch.send('fmpick',{id:me.id,qi:S.fm.qi,key:b.dataset.k});else ch.send('pick',{id:me.id,key:b.dataset.k})});
    const ps=$('#pass');if(ps)ps.onclick=()=>{ps.disabled=true;ch.send('fmpick',{id:me.id,qi:S.fm.qi,key:null})};
  }
  if(me.name&&pstore.get('joinedRoom','')===CFG.room&&!/[?&]new=1/.test(location.hash))start();else{pstore.set('joinedRoom','');form()}
}

/* ============ Host remote ============ */
function hostPage(){pinGate(hostMain)}
async function hostMain(){
  let S=null,Q=[],R=[];
  app().innerHTML=`<div class="wrap"><p class="muted">Connecting to the TV…</p></div>`;
  try{[Q,R]=await Promise.all([loadQuestions(),loadResponses()])}catch(e){app().innerHTML=`<div class="wrap"><div class="card">Can't reach the database: ${esc(e.message)}</div></div>`;return}
  const ch=joinChannel((ev,p)=>{if(ev==='state'){S=p;draw()}});
  ch.ready.then(()=>ch.send('ask',{}));
  const vis=()=>{if(document.visibilityState==='visible')ch.send('ask',{})};document.addEventListener('visibilitychange',vis);
  cleanup=()=>document.removeEventListener('visibilitychange',vis);
  setTimeout(()=>{if(!S)app().innerHTML=`<div class="wrap"><div class="card"><b>Waiting for the TV…</b><p class="muted">Open the game on the TV browser and press Start. This screen will connect by itself.</p></div><a class="btn small" href="#admin">⚙️ Questions &amp; survey</a></div>`},2500);
  const send=(cmd,extra={})=>ch.send('cmd',{cmd,...extra});
  const pname=id=>S.players[id]?esc(S.players[id].name):'—';
  const tName=t=>`${S.teams[t].emoji} ${esc(S.teams[t].name)}`;
  let openPlayers=false;
  function draw(){
    if(!S)return;
    const ph=S.phase,unused=Q.filter(q=>q.section==='main'&&!S.used.includes(q.id));
    let status='',actions='',board='';
    const nextR=typeof S.round==='number'?S.round+1:1,planRe=CFG.plan[nextR],reserved=Object.entries(CFG.plan).filter(([r])=>+r>nextR).map(([,re])=>re);
    const pref=(planRe&&unused.find(q=>planRe.test(q.prompt)))||unused.find(q=>!reserved.some(re=>re.test(q.prompt)))||unused[0];
    const roundPick=`<label class="field">Question for round ${nextR}<select id="qsel">${unused.map(q=>`<option value="${q.id}" ${pref&&q.id===pref.id?'selected':''}>${esc(q.prompt)}</option>`).join('')}</select></label>`;
    if(ph==='lobby'){status=`${S.order.length} player${S.order.length===1?'':'s'} joined. Start when everyone's in.`;actions=`${roundPick}<button class="btn gold block" data-c="start" ${S.order.length<2?'disabled':''}>▶ Start round 1</button>`}
    else if(['faceoff','play','steal','finale'].includes(ph)){
      status={faceoff:S.face&&S.face.buzzed?`${pname(S.face.buzzed)} buzzed. Waiting for their pick.`:`Faceoff: ${pname(S.face&&S.face.ids[0])} vs ${pname(S.face&&S.face.ids[1])}`,
        play:`${pname(S.active)} is picking · ${S.strikes} strike${S.strikes===1?'':'s'} · bank ${S.bank}`,steal:`${tName(1-S.control)} stealing · ${pname(S.active)} picks`,finale:`Big vote · ${pname(S.active)} is picking`}[ph];
      board=`<div class="sec-label">Board (tap to reveal if someone says it out loud)</div><div class="host-board">${S.board.map((b,i)=>`<button class="hb ${b.revealed?'rev':''}" data-c="reveal" data-i="${i}" ${b.revealed?'disabled':''}><span class="n">${i+1}</span>${esc(b.text)}<span class="pts">${b.points*(S.mult||1)}</span></button>`).join('')}</div>`;
      actions=`<div class="row"><button class="btn red" data-c="strike">❌ Strike</button><button class="btn" data-c="skip">⏭ Skip turn</button></div>
      ${ph!=='finale'?`<details class="acc"><summary>More</summary><div class="acc-body"><div class="row"><button class="btn small" data-c="award" data-t="0">Give bank to ${tName(0)}</button><button class="btn small" data-c="award" data-t="1">Give bank to ${tName(1)}</button></div></div></details>`:''}`;
    }
    else if(ph==='roundEnd'){status=`${tName(S.win.team)} ${S.win.stolen?'stole':'won'} ${S.win.bank}.`;
      const more=S.round<4;actions=`${S.board.some(b=>!b.revealed)?'<button class="btn block" data-c="revealRest">👀 Show the answers nobody got</button><div style="height:10px"></div>':''}
      ${more?`${roundPick}<button class="btn gold block" data-c="next">▶ Start round ${S.round+1}${[0,0,2,3][S.round]?` (${S.round+1===3?'double':'triple'} points)`:''}</button>`:`<button class="btn gold block" data-c="finale">🌍 Start the big vote</button>`}`}
    else if(ph==='finaleEnd'){const team=S.teams[0].score>=S.teams[1].score?0:1,ps=S.order.filter(id=>S.players[id]&&S.players[id].team===team);
      status=`Next trip: ${esc(S.trip)}! Fast Money goes to ${tName(team)}.`;
      actions=`<label class="field">Player 1<select id="fm1">${ps.map((id,i)=>`<option value="${id}" ${i===0?'selected':''}>${pname(id)}</option>`).join('')}</select></label>
      <label class="field">Player 2<select id="fm2">${ps.map((id,i)=>`<option value="${id}" ${i===(ps.length>1?1:0)?'selected':''}>${pname(id)}</option>`).join('')}</select></label>
      <button class="btn gold block" data-c="fm">⚡ Start Fast Money</button><div style="height:10px"></div><button class="btn block" data-c="finish">Skip to the winner</button>`}
    else if(ph==='fm'){const f=S.fm;
      status={ready1:`${pname(f.ids[0])} answers first (${CFG.fmTimes[0]} sec). Send ${pname(f.ids[1])} out of the room!`,p1:`${pname(f.ids[0])} is answering…`,reveal1:`Reveal ${pname(f.ids[0])}'s answers one by one.`,ready2:`Bring ${pname(f.ids[1])} back (${CFG.fmTimes[1]} sec).`,p2:`${pname(f.ids[1])} is answering…`,reveal2:`Reveal ${pname(f.ids[1])}'s answers.`,done:'Fast Money is done!'}[f.stage];
      actions=f.stage.startsWith('ready')?`<button class="btn gold block" data-c="fmGo">⏱ Start the timer</button>`:f.stage.startsWith('reveal')?`<button class="btn gold block" data-c="fmReveal">👀 Reveal next answer</button>`:f.stage==='done'?`<button class="btn gold block" data-c="finish">🏆 Show the winner</button>`:'<p class="muted">Timer is running…</p>';
      board=`<div class="sec-label">Their answers</div>${[0,1].map(pi=>`<div class="card" style="padding:12px"><b>${pname(f.ids[pi])}</b>${f.qs.map((q,i)=>{const x=f.picks[pi][i];return `<div class="row" style="font-size:14px;padding:4px 0"><span class="faint" style="flex:1">${esc(q.prompt)}</span><span>${x===undefined?'':x?esc(x.text)+' · '+x.pts:'pass'}</span></div>`}).join('')}</div>`).join('')}`}
    else if(ph==='over'){status='Game over! 🎉';actions=`<button class="btn block" data-c="newGame">🔁 New game (same players)</button>`}
    const players=[0,1].map(t=>`<div class="sec-label">${tName(t)} · ${S.teams[t].score}</div>${S.order.filter(id=>S.players[id]&&S.players[id].team===t).map(id=>`<div class="player-row"><span style="flex:1">${pname(id)}${S.active===id?' 👈':''}</span><button class="btn small" data-c="move" data-id="${id}" data-t="${1-t}">Move</button><button class="btn small" data-c="remove" data-id="${id}">✕</button></div>`).join('')||'<p class="faint">Nobody</p>'}
      <div class="row"><button class="btn small" data-c="rename" data-t="${t}">Rename team</button><button class="btn small" data-c="score" data-t="${t}">Fix score</button></div>`).join('');
    app().innerHTML=`<div class="wrap"><div class="row"><span class="pill">🎤 Host</span><span class="spacer"></span><span class="pill">${S.teams[0].emoji} ${S.teams[0].score} · ${S.teams[1].emoji} ${S.teams[1].score}</span></div>
    <div class="card"><div class="host-status">${status}</div><div style="height:12px"></div>${actions}</div>${board}
    <details class="acc" id="pl" ${openPlayers?'open':''}><summary>👥 Players &amp; teams (${S.order.length})</summary><div class="acc-body">${players}</div></details>
    <details class="acc"><summary>⚙️ Game tools</summary><div class="acc-body"><div class="row"><button class="btn small" data-c="lobby">Back to lobby</button><button class="btn small red" data-c="newGame">Restart game</button><a class="btn small" href="#admin">Questions &amp; survey</a></div></div></details></div>`;
    $('#pl').ontoggle=e=>openPlayers=e.target.open;
  }
  app().onclick=async ev=>{
    const b=ev.target.closest('[data-c]');if(!b||!S)return;const c=b.dataset.c;
    if(c==='start'||c==='next'){const qs=$('#qsel');return send(c,{qid:qs?qs.value:undefined})}
    if(c==='reveal')return send('reveal',{idx:+b.dataset.i});
    if(c==='award'){if(confirm('Give the bank to this team and end the round?'))send('award',{team:+b.dataset.t});return}
    if(c==='move')return send('move',{id:b.dataset.id,team:+b.dataset.t});
    if(c==='remove'){if(confirm('Remove this player?'))send('remove',{id:b.dataset.id});return}
    if(c==='rename'){const v=prompt('New team name',S.teams[+b.dataset.t].name);if(v)send('rename',{team:+b.dataset.t,name:v});return}
    if(c==='score'){const v=prompt('Set the score',S.teams[+b.dataset.t].score);if(v!==null)send('score',{team:+b.dataset.t,score:+v});return}
    if(c==='fm')return send('fm',{ids:[$('#fm1').value,$('#fm2').value]});
    if(c==='newGame'&&!confirm('Start a brand-new game? Scores go back to 0.'))return;
    if(c==='finish'&&S.phase!=='fm'&&!confirm('Skip Fast Money and show the winner?'))return;
    send(c);
  };
}

route();
