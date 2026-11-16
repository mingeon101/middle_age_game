export const castles = [
  ['백사자성', '서부 평원', 25, 45, '#f5cd81'],
  ['흑철성', '북부 산맥', 49, 24, '#cab5f9'],
  ['녹림성', '동부 삼림', 73, 43, '#9cdb9d'],
  ['은물결성', '남부 호수', 60, 76, '#9fdaf5'],
];
const name = id => castles[id][0];
const get = (game,id) => game.players.find(player => player.id === id);
const pair = (a,b) => [a,b].sort().join(':');

function check(ok, message) {
  if (!ok) throw new Error(message);
}
function log(game,message) {
  game.logs.unshift(message);
  game.logs.splice(24);
}

export function room(now,owner) {
  return {owner, version:1, createdAt:now, harvest:now+20000, citizensAt:now+30000, aiAt:now+15000, winner:null,
    players:castles.map((_,id)=>({id,lord:'AI 영주',ai:true,gold:120,food:90,army:30,farm:1,wall:1,fame:0,
      citizens:8,grossIncome:0,nationalIncome:0,taxIncome:0,goodsSold:0,trained:0,weapon:1})),
    members:{}, logs:[], offers:[], marches:[], truces:[], allies:[], wars:[]};
}

export function normalize(data) {
  for (const key of ['players','logs','offers','marches','truces','allies','wars']) {
    data[key] = Object.values(data[key] ?? {});
  }
  data.members ??= {};
  data.winner ??= null;
  data.createdAt ??= data.harvest-20000;
  for(const player of data.players)player.weapon??=1;
  return data;
}

export function join(game,uid,id,lord) {
  if (Object.hasOwn(game.members,uid)) return;
  check(game.winner === null,'승자가 결정되었습니다.');
  const p = get(game,id);
  check(Number.isInteger(id) && p?.ai,'이 성은 이미 선택되었습니다.');
  check(typeof lord === 'string' && lord.trim().length >= 1 && lord.trim().length <= 16,'영주 이름을 1~16자로 입력하세요.');
  game.members[uid] = id;
  p.lord = lord.trim();
  p.ai = false;
  log(game,lord.trim()+' 영주가 '+name(id)+'에 부임했습니다.');
}

export function due(game,now) {
  return game.winner === null && (game.harvest <= now || game.citizensAt <= now || game.aiAt <= now ||
    game.players.some(p => p.trainingAt && p.trainingAt <= now) ||
    ['offers','marches','truces'].some(key => game[key].some(entry => entry.end <= now)));
}

export const power = (units,weapon=1) => Math.floor(units*(100+(weapon-1)*15)/100);
export const defenseOf = player => power(player.army,player.weapon)+player.wall*6;
export const weaponCost = level => 60*level;
export const atWar = (game,a,b) => game.wars.includes(pair(a,b));

export function advance(game,now) {
  if (game.winner !== null) return;
  for (const p of game.players) {
    if (p.trainingAt && p.trainingAt <= now) {
      delete p.trainingAt;
      p.army += 3;
      p.trained += 3;
      log(game,name(p.id)+'에서 군사 3명의 훈련을 마쳤습니다.');
    }
  }
  if (now >= game.citizensAt) {
    const cycles = 1+Math.floor((now-game.citizensAt)/30000);
    game.citizensAt += cycles*30000;
    for (const p of game.players) {
      const partners = game.allies.filter(a=>a.a===p.id||a.b===p.id).length;
      if (partners) {
        const capacity = partners*8;
        const growth = Math.min(cycles,Math.max(0,capacity-p.citizens));
        const goods = growth*(2*p.citizens+growth+1)/2+(cycles-growth)*capacity;
        const gross = goods*10;
        const tax = gross/10;
        p.goodsSold += goods;
        p.grossIncome += gross;
        p.nationalIncome += gross-tax;
        p.taxIncome += tax;
        p.gold += tax;
      }
      p.citizens += cycles;
    }
  }
  if (now >= game.harvest) {
    game.harvest = now+20000;
    for (const p of game.players) {
      p.gold += 12+6*(p.farm-1);
      p.food += 14+8*(p.farm-1);
    }
  }
  game.offers = game.offers.filter(o => o.end > now);
  game.truces = game.truces.filter(t => t.end > now);
  for (const m of [...game.marches]) {
    if (m.end > now) continue;
    game.marches = game.marches.filter(item => item !== m);
    const from = get(game,m.from), to = get(game,m.to);
    const defense = defenseOf(to);
    const offense = m.power??m.units;
    to.army = Math.max(0,to.army-Math.ceil(offense*0.32));
    if (offense > defense) {
      const spoils = Math.min(30,to.gold);
      to.gold -= spoils;
      from.gold += spoils;
      from.army += Math.max(0,m.units-Math.ceil(defense*0.55));
      from.fame++;
      log(game,name(from.id)+'이 '+name(to.id)+'에서 승리했습니다. 명성 +1, 금화 +'+spoils);
    } else {
      from.army += Math.floor(m.units*0.35);
      log(game,name(to.id)+'이 '+name(from.id)+'의 공격을 막았습니다.');
    }
    if (from.fame === 3) {
      game.winner = from.id;
      for (const ongoing of game.marches) get(game,ongoing.from).army += ongoing.units;
      game.marches = [];
      log(game,name(from.id)+'이 철의 왕관을 차지했습니다!');
      break;
    }
  }
  if (game.winner === null && now >= game.aiAt) {
    game.aiAt = now+15000;
    for (const ai of game.players.filter(p=>p.ai)) {
      const offer = game.offers.find(o=>o.to===ai.id);
      if (offer) {
        try { command(game,ai,{type:'accept',offer:offer.id},now); }
        catch { command(game,ai,{type:'decline',offer:offer.id},now); }
      }
      const target = game.players.find(p=>p!==ai && !friendly(game,p.id,ai.id) &&
        !game.truces.some(t=>t.key===pair(p.id,ai.id)) && power(ai.army-3,ai.weapon)>=defenseOf(p)+7);
      if (target && ai.food>=25 && !game.marches.some(m=>m.from===ai.id)) {
        if(!atWar(game,ai.id,target.id))command(game,ai,{type:'declare',to:target.id},now);
        command(game,ai,{type:'attack',to:target.id,units:ai.army-3},now);
      } else if (!ai.trainingAt && ai.citizens>=3 && ai.gold>=15 && ai.food>=12) {
        command(game,ai,{type:'train'},now);
      } else if (ai.farm<3 && ai.gold>=ai.farm*55) {
        command(game,ai,{type:'farm'},now);
      }
    }
  }
}

const friendly = (game,a,b) => game.allies.some(alliance=>pair(alliance.a,alliance.b)===pair(a,b));

export function command(game,p,data,now,offerId) {
  const { type } = data;
  check(game.winner === null,'승자가 결정되었습니다.');
  if (type === 'train') {
    check(!p.trainingAt,'이미 훈련 중입니다.');
    check(p.citizens >= 3 && p.gold >= 15 && p.food >= 12,'백성 3명, 금화 15와 식량 12가 필요합니다.');
    p.gold -= 15;
    p.food -= 12;
    p.citizens -= 3;
    p.trainingAt = now+60000;
    log(game,name(p.id)+'의 왕이 군사 3명의 훈련을 시작했습니다.');
  } else if (type === 'farm' || type === 'wall' || type === 'weapon') {
    const cost = type==='weapon'?weaponCost(p.weapon):p[type]*(type === 'farm' ? 55 : 45);
    check(p[type] < 5,'최고 단계에 도달했습니다.');
    check(p.gold >= cost,'금화가 부족합니다.');
    p.gold -= cost;
    p[type]++;
    if(type==='weapon')log(game,name(p.id)+'의 무기가 '+p.weapon+'단계로 강화됐습니다.');
  } else if (type === 'accept' || type === 'decline') {
    const o = game.offers.find(item => item.id === data.offer && item.to === p.id);
    check(o,'이미 처리되었거나 만료된 제안입니다.');
    const q = get(game,o.from);
    if (type === 'accept' && o.type === 'trade') {
      check(q.food >= 30 && p.gold >= 24,'교역할 식량 또는 금화가 부족합니다.');
      q.food -= 30;
      p.food += 30;
      p.gold -= 24;
      q.gold += 24;
      log(game,name(q.id)+'과 '+name(p.id)+'이 교역했습니다.');
    } else if (type === 'accept') {
      const key = pair(q.id,p.id);
      check(!game.marches.some(m => pair(m.from,m.to) === key),'교전 중에는 협정을 맺을 수 없습니다.');
      if (o.type === 'alliance') {
        check(!friendly(game,q.id,p.id),'이미 수교 관계입니다.');
        check(!atWar(game,q.id,p.id),'전쟁 중에는 먼저 휴전해야 합니다.');
        game.allies.push({a:q.id,b:p.id});
        log(game,name(q.id)+'과 '+name(p.id)+'이 수교했습니다. 백성 간 교역이 시작됩니다.');
      } else {
        game.wars=game.wars.filter(war=>war!==key);
        game.truces = game.truces.filter(t => t.key !== key);
        game.truces.push({key,end:now+120000});
        log(game,name(q.id)+'과 '+name(p.id)+'이 2분간 휴전합니다.');
      }
    }
    game.offers = game.offers.filter(item => item !== o);
  } else {
    const q = get(game,data.to);
    check(q && q !== p,'다른 영주가 다스리는 성을 선택하세요.');
    const key = pair(p.id,q.id);
    const truce = game.truces.some(t => t.key === key);
    if (type === 'declare') {
      check(!friendly(game,p.id,q.id),'먼저 수교를 종료해야 합니다.');
      check(!truce,'휴전 중에는 선전포고할 수 없습니다.');
      check(!atWar(game,p.id,q.id),'이미 전쟁 상태입니다.');
      game.wars.push(key);
      log(game,name(p.id)+'이 '+name(q.id)+'에 선전포고했습니다.');
    } else if (type === 'break') {
      check(friendly(game,p.id,q.id),'수교 관계가 없습니다.');
      game.allies = game.allies.filter(a=>pair(a.a,a.b)!==key);
      log(game,name(p.id)+'이 '+name(q.id)+'과 수교를 종료했습니다.');
    } else if (type === 'attack') {
      check(!friendly(game,p.id,q.id),'수교 중인 왕국을 공격할 수 없습니다.');
      check(!truce,'휴전 기간에는 출정할 수 없습니다.');
      check(atWar(game,p.id,q.id),'왕궁 집무실에서 먼저 선전포고하세요.');
      check(!game.marches.some(m => m.from === p.id),'이미 출정한 병력이 있습니다.');
      check(Number.isInteger(data.units) && data.units >= 10 && data.units <= p.army,'10명 이상, 보유 병력 이하로 입력하세요.');
      check(p.food >= 25,'식량 25가 필요합니다.');
      p.army -= data.units;
      p.food -= 25;
      game.marches.push({from:p.id,to:q.id,units:data.units,power:power(data.units,p.weapon),start:now,end:now+12000});
      log(game,name(p.id)+'이 '+name(q.id)+'을 향해 출정했습니다.');
    } else {
      check(type === 'trade' || type === 'truce' || type === 'alliance','알 수 없는 명령입니다.');
      check(!game.offers.some(o => o.type === type && o.from === p.id && o.to === q.id),'이미 보낸 제안이 있습니다.');
      if (type === 'trade') {
        check(p.food >= 30,'교역할 식량 30이 필요합니다.');
      } else if (type === 'truce') {
        check(!truce && !game.marches.some(m => pair(m.from,m.to) === key),'이미 휴전 중이거나 교전 중입니다.');
      } else {
        check(!friendly(game,p.id,q.id) && !atWar(game,p.id,q.id),'이미 수교 중이거나 전쟁 상태입니다.');
      }
      game.offers.push({id:offerId,type,from:p.id,to:q.id,end:now+60000});
    }
  }

}

