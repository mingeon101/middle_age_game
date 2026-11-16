import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { castles } from './realm.mjs?v=frontiers';
import { buildTown, townEdge } from './town.mjs?v=frontiers';
import { climateAt, createClimate } from './climate.mjs?v=frontiers';
import { createChart } from './chart.mjs?v=frontiers';

export const worldScale=3.6;
const limit = 92*worldScale;
const points = castles.map(([, , x,z]) => [(x-50)*2*worldScale,(z-50)*2*worldScale]);
const river = z => -66+23*Math.sin(z/94)+5*Math.sin(z/31);
const crossings=[-218,-47,165,244];
function terrain(x,z) {
  const undulations=7.5*Math.sin(x/78)*Math.cos(z/92)+
    3.4*Math.sin((x-z)/51)+1.2*Math.cos(x/27+z/39);
  const mountains=40*Math.exp(-((x+109)**2/22500+(z+265)**2/5200))+
    34*Math.exp(-((x-202)**2/18500+(z-258)**2/6200));
  return undulations+mountains;
}
function height(x,z) {
  let y=terrain(x,z)-5.3*Math.exp(-((x-river(z))**2)/68);
  for(const [cx,cz] of points){
    const distance=Math.max(Math.abs(x-cx),Math.abs(z-cz));
    if(distance>=53)continue;
    const t=clamp((distance-37)/16,0,1);
    y=THREE.MathUtils.lerp(terrain(cx,cz),y,t*t*(3-2*t));
  }
  return y;
}
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

export function createWorld(host, select, publish, openOffice, elapsed) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#a4b7bb',.0032);
  const ambient=new THREE.HemisphereLight('#d8ebff','#524c3b',1.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#ffe0a7',2.75);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-39,right:39,top:39,bottom:-39,near:1,far:147});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias=.055;
  sun.shadow.bias=-.0002;
  scene.add(sun,sun.target);
  const camera = new THREE.PerspectiveCamera(57,1,.12,900);
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.13;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
  renderer.domElement.setAttribute('aria-label','3D 왕국. WASD 또는 방향키로 왕을 움직입니다.');
  renderer.domElement.tabIndex = 0;
  host.prepend(renderer.domElement);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800,28,18),new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      horizon:{value:new THREE.Color('#baccd0')},
      zenith:{value:new THREE.Color('#52779f')},
      light:{value:new THREE.Vector3(-.73,.55,.28).normalize()},
      time:{value:0},clouds:{value:0},lightStrength:{value:1}
    },
    vertexShader:`varying vec3 direction;
      void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 direction;
      uniform vec3 horizon;uniform vec3 zenith;uniform vec3 light;
      uniform float time;uniform float clouds;uniform float lightStrength;
      float random(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(random(i),random(i+vec2(1,0)),f.x),mix(random(i+vec2(0,1)),random(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float h=max(d.y,0.0);
        vec3 col=mix(horizon,zenith,pow(h,.53));
        vec2 q=d.xz/(.22+h)*3.8+vec2(time*.011,time*.008);
        float n=.55*noise(q)+.27*noise(q*2.06)+.12*noise(q*4.18)+.06*noise(q*8.);
        float layer=smoothstep(.50-clouds*.22,.68-clouds*.12,n)*smoothstep(.02,.20,h)*(1.-smoothstep(.74,1.,h));
        col=mix(col,mix(vec3(.19,.25,.36),vec3(.84,.87,.87),lightStrength),layer*(.76+clouds*.2));
        float glow=max(dot(d,light),0.);
        col+=(vec3(.34,.19,.075)*pow(glow,12.)+vec3(.65,.49,.27)*pow(glow,190.))*lightStrength;
        vec2 starGrid=vec2(atan(d.z,d.x),asin(d.y))*165.;
        float spark=1.-smoothstep(0.,.2,length(fract(starGrid)-.5));
        float stars=step(.992,random(floor(starGrid)))*spark*smoothstep(.10,.4,h);
        col+=vec3(.36,.46,.60)*stars*(1.-lightStrength)*(1.-layer)*(1.-clouds);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-100;
  sky.frustumCulled=false;
  scene.add(sky);
  const climate=createClimate(scene,sky.material,sun,ambient);
  const geometry = new THREE.PlaneGeometry(740,740,214,214);
  geometry.rotateX(-Math.PI/2);
  const verts = geometry.attributes.position;
  const colors = [], fieldUV = geometry.attributes.uv;
  const color = new THREE.Color();
  const grassTint = new THREE.Color('#89905c');
  for (let i=0;i<verts.count;i++) {
    const x=verts.getX(i), z=verts.getZ(i), y=height(x,z);
    verts.setY(i,y);
    color.set(y>10?'#8a8a79':Math.abs(x-river(z))<8?'#908975':'#657949');
    color.lerp(grassTint,.12*(2+Math.sin(x*.085)+Math.cos(z*.11)));
    color.multiplyScalar(.92+.07*Math.sin(x*.49+z*.7)+.08*Math.sin(z*.2));
    colors.push(color.r,color.g,color.b);
    fieldUV.setXY(i,x/14,z/14);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,flatShading:true}));
  ground.receiveShadow=true;
  scene.add(ground);

  const mats = new Map(), boxes = new Map();
  function surface(paint,repeat=false) {
    const canvas=document.createElement('canvas');
    canvas.width=128;
    canvas.height=128;
    paint(canvas.getContext('2d'));
    const result=new THREE.CanvasTexture(canvas);
    result.colorSpace=THREE.SRGBColorSpace;
    if(repeat)result.wrapS=result.wrapT=THREE.RepeatWrapping;
    result.anisotropy=Math.min(6,renderer.capabilities.getMaxAnisotropy());
    return result;
  }
  const fieldTexture=surface(ctx=>{
    ctx.fillStyle='#eeeeea';ctx.fillRect(0,0,128,128);
    let grain=12931;
    for(let i=0;i<3200;i++){
      grain=(Math.imul(grain,1664525)+1013904223)>>>0;
      const x=grain>>>25,z=(grain>>>14)&127;
      ctx.fillStyle=i%2?'#fff6':'#61584828';
      ctx.fillRect(x,z,1+i%3,1);
    }
  },true);
  ground.material.map=fieldTexture;
  const stoneTexture=surface(ctx=>{
    ctx.fillStyle='#a5a095';ctx.fillRect(0,0,128,128);
    for(let y=0;y<8;y++)for(let x=-1;x<5;x++){
      const tint=214+(x*47+y*37+224)%30;
      const px=x*32+(y%2)*16,py=y*16;
      ctx.fillStyle='rgb('+tint+','+tint+','+(tint-5)+')';
      ctx.fillRect(px+1,py+1,30,14);
      ctx.fillStyle='#fff5';ctx.fillRect(px+2,py+2,27,1);
    }
  },true);
  const stoneColors=new Set(['#909188','#b4ad93','#787b74','#9b988f']);
  function material(hex) {
    if (!mats.has(hex)) mats.set(hex,new THREE.MeshStandardMaterial({
      color:hex,flatShading:true,map:stoneColors.has(hex)?stoneTexture:hex==='#b6aa88'?fieldTexture:null
    }));
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
    if (!boxes.has(key)) {
      const geo=new THREE.BoxGeometry(w,h,d),uv=geo.attributes.uv;
      const size=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
      size.forEach(([width,height],face)=>{
        for(let i=face*4;i<face*4+4;i++)uv.setXY(i,uv.getX(i)*width/3.4,uv.getY(i)*height/3.5);
      });
      boxes.set(key,geo);
    }
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
  for (let z=-364;z<364;z+=2) {
    const x=river(z), next=river(z+2);
    const y=height(x,z)+2.1, nextY=height(next,z+2)+2.1;
    riverVerts.push(x-4,y,z,next-4,nextY,z+2,x+4,y,z,
      x+4,y,z,next-4,nextY,z+2,next+4,nextY,z+2);
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position',new THREE.Float32BufferAttribute(riverVerts,3));
  const waterUV=[];
  for(let i=0;i<riverVerts.length;i+=3)waterUV.push(riverVerts[i]/11,riverVerts[i+2]/14);
  water.setAttribute('uv',new THREE.Float32BufferAttribute(waterUV,2));
  water.computeVertexNormals();
  const ripples=surface(ctx=>{
    ctx.fillStyle='#aebdcc';ctx.fillRect(0,0,128,128);
    for(let y=4;y<=128;y+=8){
      ctx.strokeStyle=y%5?'#e8f8f3a0':'#447b9b88';
      ctx.beginPath();
      for(let x=0;x<=128;x+=4){
        const py=y+2*Math.sin(x/128*Math.PI*4+y*.28);
        if(x===0)ctx.moveTo(x,py);else ctx.lineTo(x,py);
      }
      ctx.stroke();
    }
  },true);
  const waterMat = new THREE.MeshStandardMaterial({color:'#568d9c',map:ripples,side:THREE.DoubleSide,roughness:.33});
  scene.add(new THREE.Mesh(water,waterMat));

  const routeMat = new THREE.MeshStandardMaterial({color:'#ae9b73',map:fieldTexture,side:THREE.DoubleSide});
  const roads=[];
  function route(a,b) {
    roads.push([a,b]);
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
    const uv=[];
    for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/12,vertices[i+2]/12);
    trail.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    trail.computeVertexNormals();
    const road=new THREE.Mesh(trail,routeMat);
    road.receiveShadow=true;
    scene.add(road);
  }
  function gate(i){return [points[i][0],points[i][1]+townEdge+3];}
  const paths=[[0,1,crossings[0]],[1,2,crossings[1]],[2,3,crossings[3]],[3,0,crossings[2]]];
  for (const [a,b,z] of paths){
    const x=river(z), start=gate(a),end=gate(b);
    const startSide=Math.sign(start[0]-river(start[1])),endSide=Math.sign(end[0]-river(end[1]));
    const aRoad=[start[0],start[1]+10],bRoad=[end[0],end[1]+10];
    route(start,aRoad);route(bRoad,end);
    if(startSide===endSide){
      const bendX=Math.max(start[0],end[0])+townEdge+10;
      route(aRoad,[bendX,aRoad[1]]);
      route([bendX,aRoad[1]],[bendX,bRoad[1]]);
      route([bendX,bRoad[1]],bRoad);
    }else{
      route(aRoad,[x+startSide*11,z]);route([x+endSide*11,z],bRoad);
    }
  }
  for (const z of crossings) {
    const x=river(z), y=height(x,z)+4.4;
    box(scene,22,.65,4,'#926e4c',x,y,z);
    for (const dz of [-1.91,1.91]) box(scene,22,.27,.23,'#624f39',x,y+.7,z+dz);
    for(const dx of [-9,-6,-3,0,3,6,9]) for(const side of [-1,1]){
      box(scene,.23,1.1,.25,'#6d5237',x+dx,y+.5,z+side*1.89);
    }
  }
  let drawChart;

  let randomState=92471;
  function random() {
    randomState=(1664525*randomState+1013904223)>>>0;
    return randomState/4294967296;
  }
  for (let ridge=0;ridge<3;ridge++) {
    const radius=400+ridge*75;
    const vertices=[];
    let previous;
    for(let i=0;i<=56;i++){
      const angle=i/56*Math.PI*2;
      const peak=[Math.cos(angle)*radius,35+ridge*13+random()*(48+ridge*18),Math.sin(angle)*radius];
      if(previous){
        const c=[previous[0]*.91,-13,previous[2]*.91], d=[peak[0]*.91,-13,peak[2]*.91];
        vertices.push(...previous,...c,...peak,...peak,...c,...d);
      }
      previous=peak;
    }
    const silhouette=new THREE.BufferGeometry();
    silhouette.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    silhouette.computeVertexNormals();
    scene.add(new THREE.Mesh(silhouette,new THREE.MeshStandardMaterial({
      color:['#657474','#7c919c','#90a5b4'][ridge],side:THREE.DoubleSide,flatShading:true
    })));
  }
  const cone=new THREE.ConeGeometry(1,1,6), rock=new THREE.DodecahedronGeometry(1,0);
  const trees=[];
  const fields=points.flatMap(([x,z],id)=>[-1,1].map(side=>({
    x:x+side*20,z:z+townEdge+20+id*2, w:18,d:18,id
  })));
  const onField=(x,z)=>fields.some(f=>Math.abs(x-f.x)<f.w/2+2&&Math.abs(z-f.z)<f.d/2+2);
  for (let i=0;i<1350;i++) {
    const x=random()*700-350,z=random()*700-350,y=height(x,z);
    if (Math.abs(river(z)-x)<10||onField(x,z)||points.some(([a,b])=>Math.max(Math.abs(a-x),Math.abs(b-z))<townEdge+6)) continue;
    if (z>0&&x>-73&&x<48&&random()<.7) continue;
    if (y>18) {
      const stone=mesh(scene,rock,'#838475',x,y+.7,z);
      stone.scale.set(1+random()*2,1+random()*2,1+random()*2);
    } else {
      const size=2+random()*3;
      trees.push({x,y,z,size});
    }
  }
  const canopy=new THREE.InstancedMesh(cone,material('#5b7449'),trees.length*2);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.29,1,6),material('#665039'),trees.length);
  const tufts=new THREE.InstancedMesh(cone,material('#929654'),1780);
  const dummy=new THREE.Object3D();
  function instance(batch,index,x,y,z,sx,sy,sz,spin) {
    dummy.position.set(x,y,z);
    dummy.scale.set(sx,sy,sz);
    dummy.rotation.y=spin;
    dummy.updateMatrix();
    batch.setMatrixAt(index,dummy.matrix);
  }
  trees.forEach(({x,y,z,size},i)=>{
    instance(trunks,i,x,y+size*.29,z,1,size*.62,1,0);
    for(let j=0;j<2;j++){
      instance(canopy,i*2+j,x,y+size*(.73+j*.31),z,size*(.40-j*.09),size*.86,size*(.4-j*.09),i*.71);
      canopy.setColorAt(i*2+j,color.setHSL(.19+random()*.07,.19+random()*.17,.66+random()*.28));
    }
  });
  for(let i=0;i<tufts.count;i++){
    let x,z;
    do{x=random()*674-337;z=random()*674-337;}
    while(Math.abs(x-river(z))<8||onField(x,z)||points.some(([a,b])=>Math.max(Math.abs(a-x),Math.abs(b-z))<townEdge+2));
    const scale=.35+random()*.77;
    instance(tufts,i,x,height(x,z)+scale*.21,z,scale*.25,scale,scale*.3,i);
  }
  canopy.castShadow=true;trunks.castShadow=true;canopy.receiveShadow=true;tufts.receiveShadow=true;
  scene.add(canopy,trunks,tufts);
  for(const field of fields){
    const land=new THREE.PlaneGeometry(field.w,field.d,9,9);
    land.rotateX(-Math.PI/2);
    const v=land.attributes.position;
    for(let i=0;i<v.count;i++){
      const x=v.getX(i)+field.x,z=v.getZ(i)+field.z;
      v.setXYZ(i,x,height(x,z)+.16,z);
    }
    land.computeVertexNormals();
    const plot=new THREE.Mesh(land,material('#74604a'));
    plot.receiveShadow=true;
    scene.add(plot);
    const crops=new THREE.InstancedMesh(cone,material(field.id%2?'#a8a45f':'#87934f'),180);
    for(let i=0;i<crops.count;i++){
      const x=field.x+(i%10-4.5)*1.59+(random()-.5)*.26,z=field.z+(Math.floor(i/10)-8.5)*.92;
      instance(crops,i,x,height(x,z)+.37,z,.21,.55+random()*.3,.22,i*.34);
    }
    crops.receiveShadow=true;
    scene.add(crops);
    for(const side of [-1,1]){
      const z=field.z+side*(field.d/2+.25);
      for(let i=0;i<=6;i++){
        const x=field.x+(i-3)*field.w/6;
        box(scene,.15,1.14,.15,'#75614a',x,height(x,z)+.5,z);
        if(i<6){
          const cx=x+field.w/12;
          box(scene,field.w/6,.13,.12,'#957852',cx,height(cx,z)+.72,z);
        }
      }
    }
  }

  const banners=[];
  const townsBySeat = points.map(([x,z],id)=>buildTown({
    x,z,id,flag:castles[id][4],height,box,mesh,banners,scene
  }));
  const castleGroups = townsBySeat.map(town=>town.group);
  const obstacles = townsBySeat.flatMap(town=>town.obstacles);
  const interiors = townsBySeat.flatMap(town=>town.interiors);
  const placeHint=document.createElement('p');
  placeHint.className='place-hint';
  placeHint.hidden=true;
  host.append(placeHint);
  const reticle=document.createElement('span');
  reticle.className='reticle';
  reticle.setAttribute('aria-hidden','true');
  reticle.hidden=true;
  host.append(reticle);
  const lantern=new THREE.PointLight('#ffd196',17,10,2);
  lantern.visible=false;
  scene.add(lantern);
  const fireTexture=surface(ctx=>{
    const glow=ctx.createRadialGradient(64,64,1,64,64,62);
    glow.addColorStop(0,'#fff6c3');
    glow.addColorStop(.13,'#ffd56add');
    glow.addColorStop(.44,'#ff9b4048');
    glow.addColorStop(1,'#ff721300');
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,128,128);
  });
  const fireMat=new THREE.SpriteMaterial({map:fireTexture,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,opacity:.7});
  const fires=townsBySeat.flatMap(town=>town.lamps.map(lamp=>{
    const fire=new THREE.Sprite(fireMat);
    fire.position.set(lamp.x,lamp.y,lamp.z);
    scene.add(fire);
    return fire;
  }));
  const torchLight=new THREE.PointLight('#ff9d49',0,15,2);
  scene.add(torchLight);
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
    figure.traverse(node=>{if(node.isMesh)node.castShadow=true;});
    scene.add(root);
    return root;
  }

  let actor, seat=null, yaw=0, lastSent=0, dirty=false, nearest=null, active=false;
  let destination=null, lastX=0,lastZ=0, lift=0, velocity=0;
  let zoom=1,currentZoom=1,lastShadow=-Infinity,pitch=0,firstPerson=false;
  const walkVelocity=new THREE.Vector2();
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
    if (k==='e'&&!event.repeat) {
      if(atOffice())openOffice();
      else if(nearest!==null)select(nearest);
    }
  }
  function keyup(event) {
    const k=keys(event);
    if (pressed.delete(k)&&k==='shift')dirty=true;
  }
  window.addEventListener('keydown',keydown);
  window.addEventListener('keyup',keyup);
  window.addEventListener('blur',()=>{pressed.clear();dirty=true;});
  const view=renderer.domElement;
  function mouseLook(dx,dy) {
    if(!active||!actor)return;
    yaw-=dx*.0033;
    pitch=clamp(pitch-dy*.0028,-1.06,1.06);
    dirty=true;
  }
  document.addEventListener('mousemove',event=>{
    if(document.pointerLockElement===view)mouseLook(event.movementX,event.movementY);
  });
  view.addEventListener('mousemove',event=>{
    if(!document.pointerLockElement&&!drag)mouseLook(event.movementX,event.movementY);
  });
  function lockPointer() {
    if(!actor||document.pointerLockElement===view||!view.requestPointerLock)return;
    try { view.requestPointerLock()?.catch(()=>{}); } catch {}
  }
  view.addEventListener('wheel',event=>{
    event.preventDefault();
    zoom=clamp(zoom*Math.exp(event.deltaY*.001),.66,1.75);
  },{passive:false});
  view.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&actor){
      view.focus({preventScroll:true});
      lockPointer();
      return;
    }
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
  function atOffice(){
    if(!actor||seat===null)return false;
    const desk=townsBySeat[seat].office;
    return Math.hypot(actor.position.x-desk.x,actor.position.z-desk.z)<=desk.radius;
  }
  function blocked(x,z,headroom){
    return obstacles.some(o=>headroom<o.h&&Math.abs(x-o.x)<o.w/2+.33&&Math.abs(z-o.z)<o.d/2+.33);
  }
  function floorAt(x,z){
    const dz=crossings.find(value=>Math.abs(z-value)<1.86);
    if(dz!==undefined&&Math.abs(x-river(dz))<11)return Math.max(height(x,z),height(river(dz),dz)+4.72);
    return height(x,z);
  }
  function interiorAt(x,z){
    return interiors.find(room=>Math.abs(x-room.x)<room.w/2&&Math.abs(z-room.z)<room.d/2);
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
      const enclosed=!!interiorAt(actor.position.x,actor.position.z);
      const city=points.some(([x,z])=>Math.max(Math.abs(x-actor.position.x),Math.abs(z-actor.position.z))<townEdge);
      const gait=pressed.has('shift')?(enclosed?1.55:2.3):enclosed?3.35:city?4.9:6.7;
      const blend=1-Math.exp(-dt*(moving?10:18));
      walkVelocity.x+=((moving?dx/moving*gait:0)-walkVelocity.x)*blend;
      walkVelocity.y+=((moving?dz/moving*gait:0)-walkVelocity.y)*blend;
      const speed=walkVelocity.length();
      if (speed>.035) {
        const steps=Math.max(1,Math.ceil(speed*dt/.34));
        for(let step=0;step<steps;step++){
          const x=clamp(actor.position.x+walkVelocity.x*dt/steps,-limit,limit);
          const z=clamp(actor.position.z+walkVelocity.y*dt/steps,-limit,limit);
          if(!blocked(x,actor.position.z,lift))actor.position.x=x;
          if(!blocked(actor.position.x,z,lift))actor.position.z=z;
        }
        actor.position.y=floorAt(actor.position.x,actor.position.z)+.05;
        dirty=true;
      }
      actor.rotation.y=Math.atan2(-Math.sin(yaw),-Math.cos(yaw));
      if (lift>0||velocity>0) {
        lift=Math.max(0,lift+velocity*dt);
        velocity=lift>0?velocity-24*dt:0;
        dirty=true;
      }
      state(actor,speed>.14,now);
      actor.userData.figure.position.y+=lift;
      actor.userData.figure.scale.y=pressed.has('shift')?.62:1;
      let distance=townEdge+6;
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
    const inside=actor&&interiorAt(focus.x,focus.z);
    const seconds=Math.max(0,elapsed());
    const weather=climateAt(seconds);
    const label=climate.update({...weather,seconds},dt,focus,inside);
    if(label)host.dispatchEvent(new CustomEvent('kingdom-weather',{detail:label}));
    const eye=actor&&(firstPerson||inside);
    const office=atOffice();
    if(actor) actor.userData.figure.visible=!eye;
    reticle.hidden=!eye;
    placeHint.hidden=!office&&!inside;
    placeHint.textContent=office?'왕의 집무실 · E로 집무 시작':inside?.kind==='office'?'왕궁 · 책상 앞으로 이동하세요':inside?.kind==='shop'?'상점':'주택';
    lantern.visible=!!inside;
    if(inside)lantern.position.set(inside.x-.72,inside.level+(inside.kind==='office'?3.4:2.9),inside.z-.8);
    const firelight=1-weather.day;
    let nearestFire=null, fireDistance=15;
    for(let i=0;i<fires.length;i++){
      const fire=fires[i];
      const distance=fire.position.distanceTo(focus),flicker=1.25+.16*Math.sin(now*.012+i*4);
      fire.visible=firelight>.16&&distance<72;
      if(fire.visible)fire.scale.set(flicker,1.32*flicker,1);
      if(fire.visible&&distance<fireDistance){nearestFire=fire;fireDistance=distance;}
    }
    torchLight.intensity=nearestFire&&!inside?firelight*(35+Math.sin(now*.013)*5):0;
    if(nearestFire)torchLight.position.copy(nearestFire.position);
    currentZoom+=(zoom-currentZoom)*(1-Math.exp(-dt*9));
    const distance=(actor?15:81)*currentZoom;
    lastX=focus.x;lastZ=focus.z;
    if(eye){
      const sway=.035*Math.sin(now*.011)*Math.min(1,walkVelocity.length()/4.9);
      const y=focus.y+(pressed.has('shift')?1.52:2.6)+lift+sway;
      camera.position.set(lastX,y,lastZ);
      look.set(lastX-Math.sin(yaw)*Math.cos(pitch),y+Math.sin(pitch),lastZ-Math.cos(yaw)*Math.cos(pitch));
    }else{
      const angle=actor?clamp(.31+pitch*.52,-.04,.93):.55;
      const cx=lastX+Math.sin(yaw)*distance*Math.cos(angle),cz=lastZ+Math.cos(yaw)*distance*Math.cos(angle);
      const cy=Math.max(focus.y+distance*Math.sin(angle)+2,height(cx,cz)+2.45);
      const aim=focus.y+(actor?1.8+lift:3);
      let t=1;
      if(actor&&nearest!==null){
        for(let i=2;i<=38;i++){
          const sample=i/38;
          const sx=THREE.MathUtils.lerp(lastX,cx,sample),sz=THREE.MathUtils.lerp(lastZ,cz,sample);
          const sy=THREE.MathUtils.lerp(aim,cy,sample)-floorAt(sx,sz);
          if(blocked(sx,sz,sy)){t=Math.max(.08,sample-.05);break;}
        }
      }
      camera.position.set(THREE.MathUtils.lerp(lastX,cx,t),THREE.MathUtils.lerp(aim,cy,t),THREE.MathUtils.lerp(lastZ,cz,t));
      look.set(lastX,aim,lastZ);
    }
    camera.lookAt(look);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    ripples.offset.set(Math.sin(now*.00042)*.045,-now*.00005%1);
    for(const cloth of banners){
      const positions=cloth.attributes.position;
      for(let i=0;i<positions.count;i++){
        const u=(positions.getX(i)+1.175)/2.35;
        positions.setZ(i,u*.34*Math.sin(u*6-now*.005));
      }
      positions.needsUpdate=true;
    }
    for(const town of townsBySeat){
      const near=Math.hypot(focus.x-town.center.x,focus.z-town.center.z)<100;
      for(let i=0;i<town.guards.length;i++){
        const guard=town.guards[i];
        guard.model.visible=near;
        if(!near)continue;
        const phase=now*.00082+i*1.81;
        if(guard.patrolAxis){
          const path=Math.sin(phase)*3.2;
          guard.model.position.x=guard.x+(guard.patrolAxis==='x'?path:0);
          guard.model.position.z=guard.z+(guard.patrolAxis==='z'?path:0);
          const pace=Math.cos(phase),turn=Math.min(1,Math.abs(pace)*1.6);
          const dx=Math.sin(guard.heading)*(1-turn)+(guard.patrolAxis==='x'?Math.sign(pace)*turn:0);
          const dz=Math.cos(guard.heading)*(1-turn)+(guard.patrolAxis==='z'?Math.sign(pace)*turn:0);
          guard.model.rotation.y=Math.atan2(dx,dz);
          const step=Math.sin(now*.009+i*1.4)*.38*turn;
          guard.legs[0].rotation.x=step;
          guard.legs[1].rotation.x=-step;
          guard.model.position.y=6.05+.05*Math.abs(step);
        }else{
          guard.model.rotation.y=guard.heading+.21*Math.sin(phase);
        }
      }
    }
    if(now-lastShadow>135){
      renderer.shadowMap.needsUpdate=true;
      lastShadow=now;
    }
    labels.forEach((label,id)=>{
      const p=castleGroups[id].position;
      marker.set(p.x,p.y+13,p.z).project(camera);
      const visible=!inside&&marker.z>0&&marker.z<1&&Math.abs(marker.x)<.92&&Math.abs(marker.y)<.88;
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
    const dt=Math.min(.12,(now-previous)/1000);
    previous=now;
    frame(now,dt);
  });

  return {
    activate(value) {
      active=value;pressed.clear();destination=null;drag=null;
      walkVelocity.set(0,0);
      if(!value&&document.pointerLockElement===view)document.exitPointerLock();
    },
    atHome() {return seat!==null && nearest===seat;},
    atOffice,
    lockPointer,
    toggleView(){firstPerson=!firstPerson;return firstPerson;},
    showChart(canvas) {
      drawChart??=createChart({limit,points,castles,height,river,roads});
      drawChart(canvas,actor,Array.from(others.values(),entry=>entry.target));
    },
    settlements(players) {
      for (const p of players) {
        const list=towns[p.id], count=clamp(p.citizens,0,8);
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
      const spawn=townsBySeat[id].spawn;
      const saved=position&&Math.abs(position.x)<=limit&&Math.abs(position.z)<=limit&&!blocked(position.x,position.z,0)?position:null;
      const x=saved?.x??spawn.x,z=saved?.z??spawn.z;
      actor.position.set(x,floorAt(x,z)+.05,z);
      actor.rotation.y=saved?.yaw??Math.PI;
      yaw=saved?.yaw===undefined?0:saved.yaw-Math.PI;
      pitch=0;lift=0;velocity=0;dirty=true;
      walkVelocity.set(0,0);
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
          model.position.set(p.x,floorAt(p.x,p.z),p.z);
          others.set(uid,{model,target:new THREE.Vector3(),heading:0});
        }
        const other=others.get(uid);
        other.target.set(p.x,floorAt(p.x,p.z),p.z);
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
