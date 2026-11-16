import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
  getDatabase, ref, get, set, remove, onValue, runTransaction, onDisconnect
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js';
import { castles, room, normalize, join, due, advance, command } from './realm.mjs';
import { createWorld } from './world.mjs';

const app = initializeApp({
  apiKey: 'AIzaSyDqc1vQ_nLlsWZJoh6KUB8fgMBbHqZqJz4',
  authDomain: 'test-649b1.firebaseapp.com',
  databaseURL: 'https://test-649b1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'test-649b1',
  storageBucket: 'test-649b1.firebasestorage.app',
  messagingSenderId: '1092673194560',
  appId: '1:1092673194560:web:4b3d3884d0004d3f4f6da5'
});
const auth = getAuth(app), db = getDatabase(app);
const $ = id => document.getElementById(id);
const text = (id,value) => { $(id).textContent=value; };
const feedback = message => text('feedback',message);
const number = new Intl.NumberFormat('ko-KR');
const castle = id => castles[id]?.[0] ?? '왕국';
const kind = {alliance:'수교',truce:'휴전',trade:'교역'};
const invited = new URL(location.href).searchParams.get('room')?.toUpperCase();
const validCode = code => /^[0-9A-F]{12}$/.test(code);
if (validCode(invited)) $('roomCode').value=invited;

let selected=0, offset=0, connected=false, connectionReady=false, current, opening=false, authBusy=false;
let world, worldFailed=false, game, positions={}, me, busy=false;
const serverNow = () => Date.now()+offset;
const sec = end => Math.max(0,Math.ceil((end-serverNow())/1000));
const gameRef = code => ref(db,'ironCrownV1/rooms/'+code);
const positionRoom = code => ref(db,'ironCrownV1/presence/'+code);
const listState = new Map();
function list(id,key,render) {
  const value=JSON.stringify(key);
  if (value===listState.get(id)) return;
  listState.set(id,value);
  $(id).replaceChildren(...render());
}

onValue(ref(db,'.info/serverTimeOffset'),snapshot=>{offset=snapshot.val()??0;});
onValue(ref(db,'.info/connected'),snapshot=>{
  connectionReady=true;
  connected=snapshot.val()===true;
  if (current) {
    current.present=false;
    if (connected && me) registerPosition(current);
  }
  showConnection();
});

function showConnection() {
  text('connection',!auth.currentUser?'로그인 대기':connected?'● 온라인':connectionReady?'재연결 중':'연결 중');
}
function explain(error) {
  const messages={
    'auth/operation-not-allowed':'Firebase에서 이 로그인 방식이 아직 활성화되지 않았습니다.',
    'auth/unauthorized-domain':'Firebase 승인 도메인에 현재 사이트를 추가해야 합니다.',
    'auth/invalid-credential':'이메일 또는 비밀번호를 확인하세요.',
    'auth/email-already-in-use':'이미 가입된 이메일입니다.',
    'auth/popup-closed-by-user':'Google 로그인 창을 닫았습니다.',
    'auth/popup-blocked':'브라우저에서 Google 로그인 팝업을 허용하세요.',
    'auth/weak-password':'비밀번호는 6자 이상으로 입력하세요.',
    'auth/network-request-failed':'로그인 서버에 연결하지 못했습니다.',
    'PERMISSION_DENIED':'데이터베이스 접근 권한이 없습니다. Firebase 규칙을 확인하세요.',
    'permission-denied':'데이터베이스 접근 권한이 없습니다. Firebase 규칙을 확인하세요.'
  };
  return messages[error.code]??error.message??'요청을 처리하지 못했습니다.';
}
async function authenticate(task) {
  if (authBusy) return;
  authBusy=true;
  feedback('');
  try { await task(); }
  catch (error) { feedback(explain(error)); }
  finally { authBusy=false; }
}
$('guest').onclick=()=>authenticate(()=>signInAnonymously(auth));
$('google').onclick=()=>authenticate(()=>signInWithPopup(auth,new GoogleAuthProvider()));
$('emailForm').onsubmit=event=>{
  event.preventDefault();
  const email=$('email').value.trim(), pw=$('password').value;
  const method=event.submitter?.value==='signup'?createUserWithEmailAndPassword:signInWithEmailAndPassword;
  authenticate(async()=>{await method(auth,email,pw);$('password').value='';});
};
document.querySelectorAll('[data-signout]').forEach(button=>button.onclick=()=>authenticate(async()=>{
  await closeRoom();
  await signOut(auth);
}));

function closeRoom() {
  const ctx=current;
  current=null;
  ctx?.stopGame?.();
  ctx?.stopPositions?.();
  const cleanup=ctx?.ownPosition && connected ? remove(ctx.ownPosition).catch(()=>{}) : undefined;
  positions={};game=null;me=null;busy=false;
  world?.player(null);
  world?.population({}, {}, null);
  world?.activate(false);
  $('statsDialog').close();
  $('play').hidden=true;
  $('roomGate').hidden=!auth.currentUser;
  return cleanup;
}
onAuthStateChanged(auth,user=>{
  $('signin').hidden=!!user;
  $('roomGate').hidden=!user||!!current;
  if (!user) closeRoom();
  showConnection();
});

function worldSnapshot() {
  if (!world||!current||!game) return;
  const avatars={};
  for (const [uid,sessions] of Object.entries(positions)) {
    const sessionsByTime = Object.values(sessions).sort((a,b)=>b.at-a.at);
    if (sessionsByTime.length) avatars[uid]=sessionsByTime[0];
  }
  world.player(me?.id??null,avatars[current.uid]);
  world.population(avatars,game.members,current.uid);
  world.settlements(game.players);
}
function startWorld() {
  if (!world&&!worldFailed) {
    try {
      world=createWorld($('map'),select,sendPosition);
    } catch (error) {
      worldFailed=true;
      const box=document.createElement('p');
      box.className='world-error';
      box.textContent='3D 화면을 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 시도하세요.';
      $('map').append(box);
      console.error(error);
    }
  }
  world?.activate(true);
}
async function registerPosition(ctx) {
  if (ctx!==current||!me||!connected||ctx.present||ctx.registering) return;
  ctx.registering=true;
  try {
    await onDisconnect(ctx.ownPosition).remove();
    if(ctx===current && connected){
      ctx.present=true;
      if(ctx.coords) await set(ctx.ownPosition,ctx.coords);
    }
  } catch(error) {
    if(ctx===current) feedback(explain(error));
  } finally { ctx.registering=false; }
}
function sendPosition(x,z,yaw,lift,crouch) {
  const ctx=current;
  if (!ctx||!me) return;
  ctx.coords={x,z,yaw,lift,crouch,at:serverNow()};
  if (ctx.present&&connected) set(ctx.ownPosition,ctx.coords).catch(()=>{});
}

async function enter(code, create) {
  if (opening||!auth.currentUser) return;
  if (!connected) {
    feedback('데이터베이스에 연결된 뒤 다시 시도하세요.');
    return;
  }
  opening=true;
  feedback('');
  const uid=auth.currentUser.uid;
  try {
    const target=gameRef(code);
    if (create) await set(target,room(serverNow(),uid));
    const initial=await get(target);
    if (!initial.exists()) throw Error('방을 찾을 수 없습니다. 초대 코드를 확인하세요.');
    if(auth.currentUser?.uid!==uid)return;
    closeRoom();
    const ctx={code,uid,target,ownPosition:ref(db,'ironCrownV1/presence/'+code+'/'+uid+'/'+crypto.randomUUID())};
    current=ctx;
    $('play').hidden=false;
    $('roomGate').hidden=true;
    text('activeRoom','초대 코드 '+code);
    selected=0;
    startWorld();
    readGame(initial,ctx);
    ctx.stopGame=onValue(target,snapshot=>readGame(snapshot,ctx),error=>feedback(explain(error)));
    ctx.stopPositions=onValue(positionRoom(code),snapshot=>{
      if(ctx===current){positions=snapshot.val()??{};worldSnapshot();}
    },error=>feedback(explain(error)));
    const url=new URL(location.href);
    url.searchParams.set('room',code);
    history.replaceState({},'',url);
  } catch (error) { feedback(explain(error)); }
  finally { opening=false; }
}
$('createRoom').onclick=()=>enter(crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),true);
$('roomForm').onsubmit=event=>{
  event.preventDefault();
  const code=$('roomCode').value.trim().toUpperCase();
  if(validCode(code))enter(code,false);
};
$('leaveRoom').onclick=()=>{
  closeRoom();
  const url=new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState({},'',url);
  feedback('방에서 나왔습니다. 같은 계정과 초대 코드로 다시 돌아올 수 있습니다.');
};
$('copyInvite').onclick=async()=>{
  try{await navigator.clipboard.writeText(location.href);feedback('초대 링크를 복사했습니다.');}
  catch{feedback('주소 표시줄의 초대 링크를 복사하세요.');}
};

function readGame(snapshot,ctx) {
  if(ctx!==current||!snapshot.exists())return;
  game=normalize(snapshot.val());
  const prior=me?.id;
  me=game.players.find(p=>p.id===game.members[ctx.uid]);
  if(me&&me.id!==prior){selected=me.id;registerPosition(ctx);}
  worldSnapshot();
  render();
}
async function transaction(operation,silent=false) {
  const ctx=current;
  if (!ctx) return;
  if (busy) {
    if(!silent) (ctx.pending??=[]).push(operation);
    return;
  }
  if (!connected) {
    if (!silent) feedback('서버에 다시 연결된 뒤 시도하세요.');
    return;
  }
  busy=true;
  const now=serverNow();
  let reason;
  try {
    const result=await runTransaction(ctx.target,data=>{
      if (!data) return;
      const next=normalize(data);
      try {
        reason=null;
        return operation(next,ctx.uid,now)?next:undefined;
      } catch(error) {
        reason=error;
        return;
      }
    },{applyLocally:false});
    if (ctx!==current) return;
    if (reason) throw reason;
    if (result.committed) {
      readGame(result.snapshot,ctx);
      if(!silent)feedback('명령을 처리했습니다.');
    }
  } catch(error) {
    if(ctx===current)feedback(explain(error));
  } finally {
    if(ctx===current){
      busy=false;
      const next=ctx.pending?.shift();
      if(next)transaction(next);
    }
  }
}

$('join').onsubmit=event=>{
  event.preventDefault();
  if(!$('seat').value)return;
  const id=Number($('seat').value), lord=$('lord').value;
  transaction((data,uid,now)=>{
    advance(data,now);
    join(data,uid,id,lord);
    return true;
  });
};
function act(payload) {
  if(payload.type==='train'&&!world?.atHome()){
    feedback('내 성 가까이에서 군사 훈련을 명령할 수 있습니다.');
    return;
  }
  const offerId=crypto.randomUUID();
  transaction((data,uid,now)=>{
    advance(data,now);
    const player=data.players.find(p=>p.id===data.members[uid]);
    if (!player) throw Error('먼저 왕국을 선택하세요.');
    command(data,player,payload,now,offerId);
    return true;
  });
}
function select(id) {
  selected=id;
  if (!me&&game?.players.find(p=>p.id===id)?.ai) $('seat').value=String(id);
  render();
}
$('seat').onchange=()=>select(Number($('seat').value));
$('targetSelect').replaceChildren(...castles.map((c,id)=>new Option(c[0],String(id))));
$('targetSelect').onchange=()=>select(Number($('targetSelect').value));
$('attack').onsubmit=event=>{event.preventDefault();act({type:'attack',to:selected,units:Number($('units').value)});};
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>act({type:button.dataset.action,to:selected}));
$('statsButton').onclick=toggleStats;
function toggleStats() {
  if(!game)return;
  if($('statsDialog').open){$('statsDialog').close();return;}
  updateStats();
  world?.activate(false);
  $('statsDialog').showModal();
}
window.addEventListener('keydown',event=>{
  if(event.code==='KeyP'&&!event.repeat&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){
    event.preventDefault();
    toggleStats();
  }
});
$('statsDialog').addEventListener('close',()=>world?.activate(!!current));
$('statsDialog').addEventListener('cancel',()=>world?.activate(!!current));
function updateStats() {
  if(!game)return;
  text('economicClock',game.winner===null?'다음 인구 증가 및 판매 · '+sec(game.citizensAt)+'초':'경기가 종료되었습니다.');
  const rows=[
    ['왕국',castle(me?.id)],
    ['백성',me?.citizens],
    ['국민소득 (세후 누계)',me?.nationalIncome],
    ['상품 매출 (세전 누계)',me?.grossIncome],
    ['세금소득 (누계)',me?.taxIncome],
    ['판매한 상품',me?.goodsSold],
    ['수교국',me?game.allies.filter(a=>a.a===me.id||a.b===me.id).map(a=>castle(a.a===me.id?a.b:a.a)).join(', ')||'없음':undefined],
    ['금화',me?.gold], ['식량',me?.food], ['주둔 병력',me?.army],
    ['훈련 완료 인원',me?.trained], ['훈련 남은 시간',me?.trainingAt?sec(me.trainingAt)+'초':'—']
  ];
  if(!me)rows[0][1]='선택 대기';
  list('statRows',rows,()=>rows.map(([label,value])=>{
    const row=document.createElement('tr'), header=document.createElement('th'), data=document.createElement('td');
    header.scope='row'; header.textContent=label;
    data.textContent=typeof value==='number'?number.format(value):value??'—';
    row.append(header,data);return row;
  }));
}

function render() {
  if(!game)return;
  const p=game.players.find(p=>p.id===selected);
  const finished=game.winner!==null;
  text('occupancy',game.players.filter(p=>!p.ai).length+' / 4 플레이어');
  $('winner').hidden=!finished;
  if (finished) text('winner',castle(game.winner)+'이 철의 왕관을 차지했습니다!');
  $('lobby').hidden=!!me;
  $('estate').hidden=!me;
  const available=game.players.filter(p=>p.ai);
  const choice=$('seat').value;
  list('seat',available.map(p=>p.id),()=>available.map(p=>new Option(castle(p.id),String(p.id))));
  if(available.some(p=>String(p.id)===choice))$('seat').value=choice;
  $('joinButton').disabled=finished||!available.length;
  for(const key of ['gold','food','army','fame','citizens']){
    text(key,me?(key==='fame'?me.fame+' / 3':number.format(me[key])):'—');
  }
  if(me) {
    text('home',castle(me.id));
    text('levels','농지 '+me.farm+'단계 · 성벽 '+me.wall+'단계');
    text('farmCost',me.farm===5?'최고 단계':'금화 '+me.farm*55);
    text('wallCost',me.wall===5?'최고 단계':'금화 '+me.wall*45);
    text('trainCost',me.trainingAt?'훈련 중 · '+sec(me.trainingAt)+'초':'백성 3 · 금화 15 · 식량 12');
    for(const button of $('estate').querySelectorAll('[data-action]')){
      const type=button.dataset.action;
      button.disabled=finished||(type==='train'?!!me.trainingAt||me.citizens<3||me.gold<15||me.food<12:me[type]===5||me.gold<me[type]*(type==='farm'?55:45));
    }
  }
  $('targetSelect').value=String(selected);
  text('target',castle(selected));
  text('region',castles[selected][1]);
  text('owner',p.ai?'AI 왕':p.lord+' 왕');
  text('defense','주둔 병력 '+p.army+' · 성벽 '+p.wall+'단계');
  const alliance=me&&game.allies.some(a=>a.a===me.id&&a.b===selected||a.b===me.id&&a.a===selected);
  const pact=me&&game.truces.find(t=>t.key===[me.id,p.id].sort().join(':'));
  text('relation',alliance?'수교 중 · 백성 간 교역 활성화':pact?'휴전 중 · '+sec(pact.end)+'초':'');
  $('diplomacy').hidden=!me||me.id===p.id||finished;
  $('diplomacy').querySelector('[data-action="alliance"]').hidden=!!alliance;
  $('diplomacy').querySelector('[data-action="break"]').hidden=!alliance;
  $('units').max=me?.army??0;
  const marching=me&&game.marches.find(m=>m.from===me.id);
  const incoming=me&&game.marches.find(m=>m.to===me.id);
  $('attack').querySelector('button').disabled=!!(alliance||pact||marching||!me||me.army<10||me.food<25);
  text('marchHint',incoming?'적군 접근 중 · '+sec(incoming.end)+'초':marching?'출정 중 · '+sec(marching.end)+'초':'식량 25 · 12초 뒤 도착');
  const offers=me?game.offers.filter(o=>o.to===me.id||o.from===me.id):[];
  $('mail').hidden=!offers.length||finished;
  list('offers',offers,()=>offers.map(offer=>{
    const box=document.createElement('div'), label=document.createElement('p');
    const received=offer.to===me.id;
    box.className='offer';
    label.textContent=castle(received?offer.from:offer.to)+' · '+kind[offer.type]+(received?' 제안':' 응답 대기 중');
    box.append(label);
    if(received){
      const bar=document.createElement('div');bar.className='row';
      for(const [type,label] of [['accept','수락'],['decline','거절']]){
        const btn=document.createElement('button');btn.textContent=label;btn.onclick=()=>act({type,offer:offer.id});bar.append(btn);
      }
      box.append(bar);
    }
    return box;
  }));
  list('logs',game.logs,()=>(game.logs.length?game.logs:['아직 기록이 없습니다.']).map(log=>{
    const li=document.createElement('li');li.textContent=log;return li;
  }));
  if($('statsDialog').open)updateStats();
}
setInterval(()=>{
  if(!game)return;
  render();
  if(me&&due(game,serverNow())) transaction((data,uid,now)=>{
    if(!Object.hasOwn(data.members,uid)||!due(data,now))return false;
    advance(data,now);
    return true;
  },true);
},900);
