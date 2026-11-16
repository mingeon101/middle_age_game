const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const port = Number(process.env.PORT || 8080);
const save = path.join(__dirname, 'realm-save.json');
const page = fs.readFileSync(path.join(__dirname, 'lan-index.html'));
const castles = [
  ['백사자성', '서부 평원', 25, 45, '#f5cd81'],
  ['흑철성', '북부 산맥', 49, 24, '#cab5f9'],
  ['녹림성', '동부 삼림', 73, 43, '#9cdb9d'],
  ['은물결성', '남부 호수', 60, 76, '#9fdaf5'],
  ['붉은매성', '서남 고원', 28, 76, '#f7a58a'],
  ['새벽탑성', '북동 언덕', 79, 19, '#f5b1d3'],
];
const game = fs.existsSync(save) ? JSON.parse(fs.readFileSync(save, 'utf8')) :
  { players:[], logs:[], offers:[], marches:[], truces:[], winner:null };
let harvest = Date.now()+20000;
const get = id => game.players.find(p => p.id === id);
const name = id => castles[id][0];
const pair = (a,b) => [a,b].sort().join(':');

function check(ok, message) {
  if (!ok) throw new Error(message);
}
function log(message) {
  game.logs.unshift(message);
  game.logs.splice(24);
}
function persist() {
  fs.writeFileSync(save+'.tmp', JSON.stringify(game));
  fs.renameSync(save+'.tmp',save);
}
function advance(now) {
  if (game.winner !== null) return;
  let changed = false;
  if (now >= harvest) {
    harvest = now+20000;
    for (const p of game.players) {
      p.gold += 12+6*(p.farm-1);
      p.food += 14+8*(p.farm-1);
    }
    changed = true;
  }
  game.offers = game.offers.filter(o => o.end > now);
  game.truces = game.truces.filter(t => t.end > now);
  for (const m of [...game.marches]) {
    if (m.end > now) continue;
    game.marches = game.marches.filter(item => item !== m);
    const from = get(m.from), to = get(m.to);
    const defense = to.army + to.wall*6;
    to.army = Math.max(0,to.army-Math.ceil(m.units*0.32));
    if (m.units > defense) {
      const spoils = Math.min(30,to.gold);
      to.gold -= spoils;
      from.gold += spoils;
      from.army += m.units-Math.ceil(defense*0.55);
      from.fame++;
      log(name(from.id)+'이 '+name(to.id)+'에서 승리했습니다. 명성 +1, 금화 +'+spoils);
    } else {
      from.army += Math.floor(m.units*0.35);
      log(name(to.id)+'이 '+name(from.id)+'의 공격을 막았습니다.');
    }
    changed = true;
    if (from.fame === 3) {
      game.winner = from.id;
      for (const ongoing of game.marches) get(ongoing.from).army += ongoing.units;
      game.marches = [];
      log(name(from.id)+'이 철의 왕관을 차지했습니다!');
      break;
    }
  }
  if (changed) persist();
}

function command(p, data, now) {
  const { type } = data;
  check(game.winner === null,'승자가 결정되었습니다.');
  if (type === 'train') {
    check(p.gold >= 35 && p.food >= 20,'금화 35와 식량 20이 필요합니다.');
    p.gold -= 35;
    p.food -= 20;
    p.army += 12;
  } else if (type === 'farm' || type === 'wall') {
    const cost = p[type]*(type === 'farm' ? 55 : 45);
    check(p[type] < 5,'최고 단계에 도달했습니다.');
    check(p.gold >= cost,'금화가 부족합니다.');
    p.gold -= cost;
    p[type]++;
  } else if (type === 'accept' || type === 'decline') {
    const o = game.offers.find(item => item.id === data.offer && item.to === p.id);
    check(o,'이미 처리되었거나 만료된 제안입니다.');
    const q = get(o.from);
    if (type === 'accept' && o.type === 'trade') {
      check(q.food >= 30 && p.gold >= 24,'교역할 식량 또는 금화가 부족합니다.');
      q.food -= 30;
      p.food += 30;
      p.gold -= 24;
      q.gold += 24;
      log(name(q.id)+'과 '+name(p.id)+'이 교역했습니다.');
    } else if (type === 'accept') {
      const key = pair(q.id,p.id);
      check(!game.marches.some(m => pair(m.from,m.to) === key),'교전 중에는 휴전할 수 없습니다.');
      game.truces = game.truces.filter(t => t.key !== key);
      game.truces.push({key,end:now+120000});
      log(name(q.id)+'과 '+name(p.id)+'이 2분간 휴전합니다.');
    }
    game.offers = game.offers.filter(item => item !== o);
  } else {
    const q = get(data.to);
    check(q && q !== p,'다른 영주가 다스리는 성을 선택하세요.');
    const key = pair(p.id,q.id);
    const truce = game.truces.some(t => t.key === key);
    if (type === 'attack') {
      check(!truce,'휴전 기간에는 출정할 수 없습니다.');
      check(!game.marches.some(m => m.from === p.id),'이미 출정한 병력이 있습니다.');
      check(Number.isInteger(data.units) && data.units >= 10 && data.units <= p.army,'10명 이상, 보유 병력 이하로 입력하세요.');
      check(p.food >= 25,'식량 25가 필요합니다.');
      p.army -= data.units;
      p.food -= 25;
      game.marches.push({from:p.id,to:q.id,units:data.units,start:now,end:now+12000});
      log(name(p.id)+'이 '+name(q.id)+'을 향해 출정했습니다.');
    } else {
      check(type === 'trade' || type === 'truce','알 수 없는 명령입니다.');
      check(!game.offers.some(o => o.type === type && o.from === p.id && o.to === q.id),'이미 보낸 제안이 있습니다.');
      if (type === 'trade') {
        check(p.food >= 30,'교역할 식량 30이 필요합니다.');
      } else {
        check(!truce && !game.marches.some(m => pair(m.from,m.to) === key),'이미 휴전 중이거나 교전 중입니다.');
      }
      game.offers.push({id:randomUUID(),type,from:p.id,to:q.id,end:now+60000});
    }
  }
  persist();
}

function state(p) {
  return {
    castles, me:p?.id ?? null,
    players:game.players.map(({token,gold,food,farm,...publicData}) =>
      publicData.id === p?.id ? {...publicData,gold,food,farm} : publicData),
    offers:game.offers.filter(o => o.from === p?.id || o.to === p?.id),
    logs:game.logs, truces:game.truces, marches:game.marches, winner:game.winner,
    harvest, now:Date.now()
  };
}
function json(res,status,result) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(result));
}
async function body(req) {
  let input = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 4096) throw new Error('요청이 너무 큽니다.');
  }
  return JSON.parse(input);
}
const server = http.createServer(async (req,res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(page);
    }
    if (req.method === 'GET' && req.url === '/state') {
      advance(Date.now());
      return json(res,200,state(game.players.find(p => 'Bearer '+p.token === req.headers.authorization)));
    }
    if (req.method !== 'POST' || !['/join','/action'].includes(req.url)) return json(res,404,{error:'페이지를 찾을 수 없습니다.'});
    const data = await body(req);
    const now = Date.now();
    advance(now);
    const p = game.players.find(player => 'Bearer '+player.token === req.headers.authorization);
    if (req.url === '/action') {
      check(p,'먼저 입장하세요.');
      command(p,data,now);
      return json(res,200,state(p));
    }
    if (p) return json(res,200,{token:p.token,state:state(p)});
    check(game.winner === null,'승자가 결정되었습니다.');
    const lord = typeof data.lord === 'string' ? data.lord.trim() : '';
    check(lord.length >= 1 && lord.length <= 16,'영주 이름을 1~16자로 입력하세요.');
    check(Number.isInteger(data.id) && castles[data.id] && !get(data.id),'이미 점유된 성입니다. 다른 성을 골라 주세요.');
    const player = {id:data.id,lord,token:randomUUID(),gold:120,food:90,army:30,farm:1,wall:1,fame:0};
    game.players.push(player);
    log(lord+' 영주가 '+name(player.id)+'에 부임했습니다.');
    persist();
    return json(res,200,{token:player.token,state:state(player)});
  } catch (error) {
    if (error.code) {
      console.error(error);
      return json(res,500,{error:'서버 오류가 발생했습니다.'});
    }
    return json(res,400,{error:error.message});
  }
});
setInterval(() => {
  try { advance(Date.now()); } catch (error) { console.error(error); }
},1000).unref();
server.listen(port,'0.0.0.0',() => {
  console.log('IRON CROWN\nHost PC: http://localhost:'+port);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const addr of interfaces ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) console.log('Other PCs: http://'+addr.address+':'+port);
    }
  }
  console.log('Keep this window open while playing.');
});
