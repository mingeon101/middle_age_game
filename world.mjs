import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { castles } from './realm.mjs';

const limit = 92;
const points = castles.map(([, , x,z]) => [(x-50)*2,(z-50)*2]);
const river = z => 15+12*Math.sin(z/26);
function height(x,z) {
  const mountains = 17*Math.exp(-((x+27)**2/2700+(z+77)**2/360));
  const ground = 2.5*Math.sin(x/19)*Math.cos(z/28)+mountains;
  const channel = 4.8*Math.exp(-((x-river(z))**2)/43);
  return ground-channel;
}
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

export function createWorld(host, select, publish) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a8b9b3');
  scene.fog = new THREE.FogExp2('#a8b9b3',.006);
  scene.add(new THREE.HemisphereLight('#fff4d7','#484738',2.4));
  const sun = new THREE.DirectionalLight('#ffe7b0',2.1);
  sun.position.set(-70,90,25);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(52,1,.2,400);
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(1.7,window.devicePixelRatio||1));
  renderer.domElement.setAttribute('aria-label','3D 왕국. WASD 또는 방향키로 왕을 움직입니다.');
  renderer.domElement.tabIndex = 0;
  host.prepend(renderer.domElement);
  const geometry = new THREE.PlaneGeometry(220,220,104,104);
  geometry.rotateX(-Math.PI/2);
  const verts = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let i=0;i<verts.count;i++) {
    const x=verts.getX(i), z=verts.getZ(i), y=height(x,z);
    verts.setY(i,y);
    color.set(y>10?'#8a8877':Math.abs(x-river(z))<9?'#999575':'#6b804b');
    color.multiplyScalar(.87+.12*(1+Math.sin(x*.49+z*.7))/2+.05*Math.sin(z*.2));
    colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true})));

  const mats = new Map(), boxes = new Map();
  function material(hex) {
    if (!mats.has(hex)) mats.set(hex,new THREE.MeshStandardMaterial({color:hex,flatShading:true}));
    return mats.get(hex);
  }
  function mesh(parent,geo,hex,x,y,z) {
    const object = new THREE.Mesh(geo, material(hex));
    object.position.set(x,y,z);
    parent.add(object);
    return object;
  }
  function box(parent,w,h,d,hex,x,y,z) {
    const key = [w,h,d].join(',');
    if (!boxes.has(key)) boxes.set(key,new THREE.BoxGeometry(w,h,d));
    return mesh(parent,boxes.get(key),hex,x,y,z);
  }
  const shadowGeo = new THREE.CircleGeometry(1,14);
  const shadowMat = new THREE.MeshBasicMaterial({color:'#27331d',transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  function shadow(parent,x,y,z,sx,sz) {
    const shape = new THREE.Mesh(shadowGeo,shadowMat);
    shape.rotation.x = -Math.PI/2;
    shape.position.set(x,y+.06,z);
    shape.scale.set(sx,sz,1);
    parent.add(shape);
    return shape;
  }

  const riverVerts=[];
  for (let z=-108;z<108;z+=2) {
    const x=river(z), next=river(z+2);
    const y=height(x,z)+2.1, nextY=height(next,z+2)+2.1;
    riverVerts.push(x-4,y,z,next-4,nextY,z+2,x+4,y,z,
      x+4,y,z,next-4,nextY,z+2,next+4,nextY,z+2);
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position',new THREE.Float32BufferAttribute(riverVerts,3));
  water.computeVertexNormals();
  const waterMat = new THREE.MeshStandardMaterial({color:'#487e86',side:THREE.DoubleSide,roughness:.37});
  scene.add(new THREE.Mesh(water,waterMat));

  const routeMat = new THREE.MeshStandardMaterial({color:'#ae9b73',side:THREE.DoubleSide});
  function route(a,b) {
    const vertices=[];
    for (let i=0;i<32;i++) {
      const point = t => [THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t)];
      const [x,z]=point(i/32), [u,v]=point((i+1)/32);
      const length = Math.hypot(u-x,v-z);
      const dx=(v-z)/length*1.25,dz=(x-u)/length*1.25;
      function corner(x,z){ return [x,height(x,z)+.12,z]; }
      const p=corner(x+dx,z+dz),q=corner(x-dx,z-dz),r=corner(u+dx,v+dz),s=corner(u-dx,v-dz);
      vertices.push(...p,...r,...q,...q,...r,...s);
    }
    const trail = new THREE.BufferGeometry();
    trail.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    trail.computeVertexNormals();
    scene.add(new THREE.Mesh(trail,routeMat));
  }
  const paths = [[0,1],[1,2],[2,3],[3,0],[1,3]];
  for (const [a,b] of paths) route(points[a],points[b]);
  for (const z of [-28,17,52]) {
    const x=river(z), y=height(x,z)+3.3;
    box(scene,10,.65,3,'#926e4c',x,y,z);
    for (const dz of [-1.45,1.45]) box(scene,10,.3,.24,'#624f39',x,y+.7,z+dz);
  }

  let randomState=92471;
  function random() {
    randomState=(1664525*randomState+1013904223)>>>0;
    return randomState/4294967296;
  }
  const cone=new THREE.ConeGeometry(1,1,6), rock=new THREE.DodecahedronGeometry(1,0);
  for (let i=0;i<210;i++) {
    const x=random()*188-94,z=random()*184-92,y=height(x,z);
    if (Math.abs(river(z)-x)<8||points.some(([a,b])=>Math.hypot(a-x,b-z)<13)) continue;
    if (z>0&&x>-32&&x<24&&random()<.8) continue;
    if (y>9) {
      const stone=mesh(scene,rock,'#838475',x,y+.7,z);
      stone.scale.set(1+random()*2,1+random()*2,1+random()*2);
    } else {
      const size=2+random()*3;
      box(scene,.46,size*.6,.46,'#634e34',x,y+size*.25,z);
      const tree=mesh(scene,cone,i%2?'#485f3d':'#3b5540',x,y+size*.76,z);
      tree.scale.set(size*.39,size,size*.39);
      shadow(scene,x+.5,y,z+.5,size*.45,size*.32);
    }
  }

  const castleGroups = points.map(([x,z],id) => {
    const g = new THREE.Group();
    const flag=castles[id][4];
    g.position.set(x,height(x,z)-.15,z);
    g.userData.castle=id;
    shadow(g,1,0,1,8,7);
    box(g,12,1,12,'#66675c',0,.15,0);
    const stone = id%2?'#909188':'#b4ad93';
    const roof = '#533d38';
    box(g,11,3.8,.65,stone,0,1.8,-5);
    for (const dx of [-5,5]) box(g,.65,3.8,10,stone,dx,1.8,0);
    for (const dx of [-3.65,3.65]) box(g,2.7,3.8,.65,stone,dx,1.8,5);
    box(g,4.7,8,4.3,stone,0,3.9,-1.6);
    const cap = mesh(g,new THREE.ConeGeometry(3.65,2.7,4),roof,0,9.2,-1.6);
    cap.rotation.y=Math.PI/4;
    box(g,.1,2,.1,'#47382a',0,11,-1.6);
    box(g,1.7,.8,.09,flag,.85,11.5,-1.6);
    box(g,2.45,3.3,.28,'#443c30',0,1.65,4.94);
    for (const dx of [-5,5]) for (const dz of [-5,5]) {
      box(g,2.35,5.8,2.35,stone,dx,2.8,dz);
      box(g,2.65,.45,2.65,'#797669',dx,5.8,dz);
      for (const cx of [-.93,.93]) for (const cz of [-.93,.93]) {
        box(g,.55,.65,.55,stone,dx+cx,6.26,dz+cz);
      }
      box(g,.27,.77,.11,'#47433a',dx,4.15,dz+1.18);
    }
    for (const dx of [-1.4,1.4]) box(g,.33,1,.11,'#514d42',dx,5.9,.59);
    scene.add(g);
    for (const dx of [-7.5,7.5]) {
      const sx=x+dx, sz=z+7, base=height(sx,sz);
      box(scene,2.65,.18,1.55,'#906d48',sx,base+1,sz);
      box(scene,3.1,.22,1.95,dx<0?flag:'#d8c19b',sx,base+2.45,sz);
      for (const leg of [-1.2,1.2]) box(scene,.13,2.4,.14,'#695238',sx+leg,base+1.2,sz);
    }
    return g;
  });
  const labels = castleGroups.map((group,id) => {
    const label = document.createElement('button');
    label.className = 'world-label';
    label.textContent = castles[id][0];
    label.style.setProperty('--flag',castles[id][4]);
    label.onclick = () => select(id);
    host.append(label);
    return label;
  });

  function monarch(flag) {
    const root = new THREE.Group(), figure = new THREE.Group();
    root.add(figure);
    const cloth=flag, skin='#c99166', metal='#d7b15f', dark='#4b4037';
    shadow(root,0,0,0,.8,.65);
    box(figure,1.05,1.16,.62,cloth,0,1.58,0);
    box(figure,.78,1.32,.12,'#713832',0,1.59,-.36);
    box(figure,1.12,.19,.68,dark,0,1.28,.03);
    box(figure,.23,.17,.13,metal,0,1.28,.44);
    box(figure,.56,.59,.54,skin,0,2.46,0);
    box(figure,.58,.18,.57,metal,0,2.82,0);
    for (const x of [-.23,0,.23]) for (const z of [-.22,.22]) box(figure,.12,.16,.11,metal,x,2.97,z);
    box(figure,.075,.09,.025,'#32291e',-.125,2.48,.278);
    box(figure,.075,.09,.025,'#32291e',.125,2.48,.278);
    for (const x of [-.65,.65]) {
      box(figure,.26,.82,.29,cloth,x,1.72,0);
      box(figure,.21,.29,.24,skin,x,1.22,0);
    }
    const feet = [-.26,.26].map(x => {
      const limb = new THREE.Group();
      limb.position.set(x,1.07,0);
      box(limb,.32,.72,.33,'#5a5f68',0,-.34,0);
      box(limb,.35,.26,.48,dark,0,-.91,.06);
      figure.add(limb);
      return limb;
    });
    root.userData.figure=figure;
    root.userData.feet=feet;
    scene.add(root);
    return root;
  }

  let actor, seat=null, yaw=0, lastSent=0, dirty=false, nearest=null, active=false;
  let destination=null, lastX=0,lastZ=0, lift=0, velocity=0;
  const others = new Map();
  const towns = points.map(()=>[]);
  const aiKings = new Map();
  const pressed = new Set();
  const movementKeys = new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const marker = new THREE.Vector3(), look = new THREE.Vector3();
  let drag;
  const keys = e => e.key.toLowerCase();
  function keydown(event) {
    if (!active || !actor || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const k=keys(event);
    if (movementKeys.has(k)) {
      event.preventDefault();
      pressed.add(k);
      destination=null;
    }
    if (k==='shift') {pressed.add(k);dirty=true;}
    if (event.code==='Space' && event.target.tagName!=='BUTTON') {
      event.preventDefault();
      if (!event.repeat && lift===0 && !pressed.has('shift')) velocity=10;
    }
    if (k==='e' && nearest!==null && !event.repeat) select(nearest);
  }
  function keyup(event) {
    const k=keys(event);
    if (pressed.delete(k)&&k==='shift')dirty=true;
  }
  window.addEventListener('keydown',keydown);
  window.addEventListener('keyup',keyup);
  window.addEventListener('blur',()=>{pressed.clear();dirty=true;});
  const view=renderer.domElement;
  view.addEventListener('pointerdown',event=>{
    drag={x:event.clientX,y:event.clientY,yaw};
    view.setPointerCapture(event.pointerId);
    view.focus({preventScroll:true});
  });
  view.addEventListener('pointermove',event=>{
    if (drag && Math.abs(event.clientX-drag.x)>3) yaw=drag.yaw-(event.clientX-drag.x)*.007;
  });
  view.addEventListener('pointercancel',()=>{drag=null;});
  view.addEventListener('pointerup',event=>{
    if (!drag) return;
    const moved=Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6;
    drag=null;
    if (moved) return;
    const bounds=view.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
    ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects(castleGroups,true)[0];
    if (hit) {
      let node=hit.object;
      while (node.userData.castle===undefined) node=node.parent;
      select(node.userData.castle);
    } else if (actor) {
      const floor=ray.intersectObject(ground)[0];
      if (floor) destination=floor.point;
    }
  });
  const ground=scene.children.find(node=>node.geometry===geometry);
  const size = new ResizeObserver(()=>{
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth,host.clientHeight,false);
    camera.aspect=host.clientWidth/host.clientHeight;
    camera.updateProjectionMatrix();
  });
  size.observe(host);

  function state(position,walking,now) {
    const {figure,feet}=position.userData;
    figure.position.y=walking ? .08*Math.abs(Math.sin(now*.012)) : 0;
    feet[0].rotation.x=walking ? .55*Math.sin(now*.012) : 0;
    feet[1].rotation.x=-feet[0].rotation.x;
  }
  function frame(now,dt) {
    if (!active) return;
    if (actor) {
      const forward=Number(pressed.has('w')||pressed.has('arrowup'))-Number(pressed.has('s')||pressed.has('arrowdown'));
      const side=Number(pressed.has('d')||pressed.has('arrowright'))-Number(pressed.has('a')||pressed.has('arrowleft'));
      let dx=side*Math.cos(yaw)-forward*Math.sin(yaw), dz=-side*Math.sin(yaw)-forward*Math.cos(yaw);
      if (destination) {
        dx=destination.x-actor.position.x; dz=destination.z-actor.position.z;
        if (Math.hypot(dx,dz)<.8) {destination=null;dx=0;dz=0;}
      }
      const moving=Math.hypot(dx,dz);
      if (moving) {
        const speed=pressed.has('shift')?6:17;
        const x=clamp(actor.position.x+dx/moving*speed*dt,-limit,limit);
        const z=clamp(actor.position.z+dz/moving*speed*dt,-limit,limit);
        if (!points.some(([a,b])=>Math.abs(a-x)<5.8&&Math.abs(b-z)<5.8)) {
          actor.position.set(x,height(x,z)+.03,z);
        }
        actor.rotation.y=Math.atan2(dx,dz);
        dirty=true;
      }
      if (lift>0||velocity>0) {
        lift=Math.max(0,lift+velocity*dt);
        velocity=lift>0?velocity-24*dt:0;
        dirty=true;
      }
      state(actor,!!moving,now);
      actor.userData.figure.position.y+=lift;
      actor.userData.figure.scale.y=pressed.has('shift')?.62:1;
      let distance=14;
      nearest=null;
      points.forEach(([x,z],id)=>{
        const d=Math.hypot(x-actor.position.x,z-actor.position.z);
        if (d<distance) {nearest=id;distance=d;}
      });
      if (dirty&&now-lastSent>150) {
        publish(actor.position.x,actor.position.z,actor.rotation.y,lift,pressed.has('shift'));
        lastSent=now;
        dirty=false;
      }
    }
    const focus=actor?.position ?? castleGroups[0].position;
    const distance=actor?14:69;
    lastX=focus.x;lastZ=focus.z;
    const x=lastX+Math.sin(yaw)*distance,z=lastZ+Math.cos(yaw)*distance;
    camera.position.set(x,Math.max(focus.y+(actor?8.3:53),height(x,z)+3),z);
    look.set(lastX,focus.y+(actor?1.55:1),lastZ);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    labels.forEach((label,id)=>{
      const p=castleGroups[id].position;
      marker.set(p.x,p.y+13,p.z).project(camera);
      const visible=marker.z>0&&marker.z<1&&Math.abs(marker.x)<.92&&Math.abs(marker.y)<.88;
      label.hidden=!visible;
      label.classList.toggle('near',nearest===id);
      label.style.left=(marker.x*.5+.5)*100+'%';
      label.style.top=(-marker.y*.5+.5)*100+'%';
    });
    for (let i=0;i<towns.length;i++) {
      const [x,z]=points[i];
      towns[i].forEach((villager,j)=>{
        const t=now*.00018+j*2.4+i;
        const px=x+Math.sin(t)*11,pz=z+9+Math.sin(t*1.4)*2.5;
        villager.position.set(px,height(px,pz),pz);
        villager.rotation.y=Math.cos(t)>0?Math.PI/2:-Math.PI/2;
      });
    }
    for (const {model,target,heading,lift,crouch} of others.values()) {
      const walking=model.position.distanceToSquared(target)>.04;
      model.position.lerp(target,1-Math.exp(-dt*13));
      model.rotation.y=heading;
      state(model,walking,now);
      model.userData.figure.position.y+=lift;
      model.userData.figure.scale.y=crouch?.62:1;
    }
    renderer.render(scene,camera);
  }
  let previous=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min(.045,(now-previous)/1000);
    previous=now;
    frame(now,dt);
  });

  return {
    activate(value) {active=value;pressed.clear();destination=null;},
    atHome() {return seat!==null && nearest===seat;},
    settlements(players) {
      for (const p of players) {
        const list=towns[p.id], count=Math.min(8,p.citizens);
        while (list.length>count) scene.remove(list.pop());
        while (list.length<count) {
          const body=new THREE.Group();
          box(body,.65,.85,.42,list.length%2?'#ac8462':'#8e9b7b',0,.79,0);
          box(body,.36,.4,.34,'#c89269',0,1.42,0);
          box(body,.49,.12,.43,'#bfa571',0,1.65,0);
          for (const x of [-.17,.17]) box(body,.21,.39,.25,'#51483a',x,.18,0);
          scene.add(body);
          list.push(body);
        }
        if (p.ai&&!aiKings.has(p.id)) {
          const king=monarch(castles[p.id][4]);
          const [x,z]=points[p.id];
          king.position.set(x+3,height(x+3,z+8),z+8);
          aiKings.set(p.id,king);
        } else if (!p.ai&&aiKings.has(p.id)) {
          scene.remove(aiKings.get(p.id));
          aiKings.delete(p.id);
        }
      }
    },
    player(id,position) {
      if (seat===id) return;
      if (actor) scene.remove(actor);
      seat=id;
      actor=null;
      if (id===null) return;
      actor=monarch(castles[id][4]);
      const [a,b]=points[id];
      const x=position?.x??a,z=position?.z??b+9;
      actor.position.set(x,height(x,z)+.04,z);
      actor.rotation.y=position?.yaw??0;
      yaw=0;lift=0;velocity=0;dirty=true;
    },
    population(positions,players,self) {
      const seen=new Set();
      for (const [uid,p] of Object.entries(positions)) {
        if (uid===self) continue;
        const id=players[uid];
        if (!castles[id]) continue;
        seen.add(uid);
        if (!others.has(uid)) {
          const model=monarch(castles[id][4]);
          model.position.set(p.x,height(p.x,p.z),p.z);
          others.set(uid,{model,target:new THREE.Vector3(),heading:0});
        }
        const other=others.get(uid);
        other.target.set(p.x,height(p.x,p.z),p.z);
        other.heading=p.yaw;
        other.lift=p.lift??0;
        other.crouch=p.crouch===true;
      }
      for (const [uid,other] of others) {
        if (!seen.has(uid)) {
          scene.remove(other.model);
          others.delete(uid);
        }
      }
    }
  };
}
