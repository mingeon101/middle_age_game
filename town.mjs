import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export function buildTown({x,z,id,flag,height,box,mesh,shadow,banners,scene}) {
  const town=new THREE.Group();
  const level=height(x,z);
  town.position.set(x,level,z);
  town.userData.castle=id;
  scene.add(town);
  const obstacles=[], interiors=[];
  const stone='#b4ad93', cut='#9b988f', dark='#665d50', oak='#6c4930';
  const roofs=['#69463e','#7d5141','#586169','#8d6547'];
  const local=(w,h,d,color,dx,y,dz)=>box(town,w,h,d,color,dx,y,dz);
  function solid(w,h,d,color,dx,y,dz) {
    obstacles.push({x:x+dx,z:z+dz,w,d,h:y+h/2});
    return local(w,h,d,color,dx,y,dz);
  }
  function flagAt(dx,y,dz,color=flag) {
    local(.1,2.4,.1,'#74634b',dx,y-.9,dz);
    const cloth=new THREE.PlaneGeometry(2.35,.92,10,3);
    const panel=mesh(town,cloth,color,dx+1.17,y,dz);
    panel.material=panel.material.clone();
    panel.material.side=THREE.DoubleSide;
    banners.push(cloth);
  }
  function windowAt(dx,y,dz,w=1) {
    local(w+.24,1.42,.15,cut,dx,y,dz);
    local(w,1.2,.18,'#313f41',dx,y,dz+.06);
    local(.06,1.18,.21,'#ae9976',dx,y,dz+.12);
    local(w,.06,.21,'#ae9976',dx,y,dz+.12);
    local(w+.4,.13,.36,cut,dx,y-.59,dz+.09);
  }
  function crenellate(dx,dz,length,alongX,h) {
    const count=Math.floor(length/1.66);
    for(let i=0;i<count;i++){
      const p=(i-(count-1)/2)*1.66;
      local(alongX?.84:.8,.64,alongX?.8:.84,stone,dx+(alongX?p:0),h+.3,dz+(alongX?0:p));
    }
  }
  function wall(dx,dz,w,d) {
    solid(w,5.9,d,stone,dx,2.95,dz);
    local(w+.22,.21,d+.3,cut,dx,5.84,dz);
    const alongX=w>d;
    crenellate(dx,dz,Math.max(w,d),alongX,6);
  }
  const edge=24;
  wall(0,-edge,48,1.5);
  for(const sign of [-1,1]){
    wall(sign*edge,0,1.5,48);
    wall(sign*13.75,edge,20.5,1.65);
    for(const direction of [-1,1]){
      const tx=sign*edge,tz=direction*edge;
      solid(5,9.2,5,stone,tx,4.6,tz);
      local(5.5,.45,5.5,cut,tx,9.05,tz);
      for(const off of [-2.45,2.45]){
        crenellate(tx,tz+off,5,true,9.2);
        crenellate(tx+off,tz,5,false,9.2);
      }
      local(.25,1.3,.13,dark,tx,6.55,tz+2.54);
      flagAt(tx,11.2,tz);
    }
  }
  local(10.8,3.6,2.2,stone,0,7.15,edge);
  local(11,.38,2.4,cut,0,8.9,edge);
  crenellate(0,edge,11,true,9.05);
  for(const sign of [-1,1]){
    solid(2.75,8.9,3,stone,sign*4.85,4.45,edge);
    local(.25,1.2,.18,dark,sign*4.85,6.8,edge+1.54);
    local(.12,3.9,1,oak,sign*2.95,1.93,edge+.22);
    local(.32,1.7,.28,'#3a342c',sign*2.65,3.45,edge+1.2);
  }
  local(2.2,.46,.28,cut,0,5.18,edge+1.17);
  local(.69,.82,.2,flag,0,6.62,edge+1.25);
  flagAt(0,10.6,edge);
  const paving='#a9a18c';
  local(6,.085,54,paving,0,.044,2);
  local(42,.086,4.2,paving,0,.045,5.5);
  local(24,.083,4.8,paving,0,.043,-16);
  local(8,.086,9,'#918b7e',0,.045,24.2);
  for(let i=0;i<24;i++) {
    local(5.54,.026,.05,'#756f61',0,.091,-23+i*2.15);
  }

  function room({dx,dz,w,d,h,roof,kind}) {
    const palace=kind==='office', shop=kind==='shop', door=kind==='hall'?1.4:palace?2.45:1.85;
    const wallColor=palace?stone:'#b6aa88', thick=palace?.45:.27;
    const slab=palace?'#9c9588':'#977959';
    const front=dz+d/2, back=dz-d/2, wallW=(w-door)/2;
    local(w,.12,d,slab,dx,.04,dz);
    solid(w,h,thick,wallColor,dx,h/2,back);
    for(const sign of [-1,1]){
      solid(thick,h,d,wallColor,dx+sign*w/2,h/2,dz);
      solid(wallW,h,thick,wallColor,dx+sign*(w+door)/4,h/2,front);
      local(.21,h+.05,.18,oak,dx+sign*(w/2-.12),h/2,front+.16);
      local(.12,2.77,.32,oak,dx+sign*(door/2+.045),1.36,front+.06);
      windowAt(dx+sign*(w/3),palace?3.66:2.49,front+.16,palace?1.06:.66);
    }
    local(door+.4,h-2.68,thick,wallColor,dx,(h+2.68)/2,front);
    local(door+.46,.19,.36,oak,dx,2.73,front+.13);
    if(!palace){
      local(w+.28,.2,d+.2,oak,dx,h-.04,dz);
      const peak=1.9;
      // A pitched roof has an attic silhouette and an exposed interior ceiling.
      const roofAngle=Math.atan2(peak,w/2);
      const roofWidth=Math.hypot(w/2,peak)+.58;
      for(const sign of [-1,1]){
        const panel=local(roofWidth,.22,d+.79,roof,dx+sign*w/4,h+peak/2,dz);
        panel.rotation.z=-sign*roofAngle;
      }
      const gable=new THREE.BufferGeometry();
      gable.setAttribute('position',new THREE.Float32BufferAttribute([
        -w/2,0,0,w/2,0,0,0,peak,0,-w/2,0,-d,w/2,0,-d,0,peak,-d
      ],3));
      gable.computeVertexNormals();
      const ends=mesh(town,gable,roof,dx,h,front);
      ends.material=ends.material.clone();ends.material.side=THREE.DoubleSide;
      local(w-.17,.15,d-.14,oak,dx,h-.19,dz);
      local(.6,1.31,.62,cut,dx-w*.25,h+1.63,dz-d*.3);
    } else {
      local(w+.68,.38,d+.66,cut,dx,h,dz);
      local(w-.14,.21,d-.1,slab,dx,h-.35,dz);
      crenellate(dx,front,w,true,h+.17);
      crenellate(dx,back,w,true,h+.17);
      crenellate(dx-w/2,dz,d,false,h+.17);
      crenellate(dx+w/2,dz,d,false,h+.17);
      const tower=mesh(town,new THREE.ConeGeometry(2.8,3.3,8),roof,dx,h+4.85,dz-2.8);
      tower.rotation.y=Math.PI/8;
      local(3.65,3.8,3.65,stone,dx,h+1.5,dz-2.8);
      flagAt(dx,h+7.5,dz-2.8);
      local(door+1,.22,1.25,cut,dx,.105,front+.21);
      local(1.3,2.1,.19,flag,dx,4.24,front+.23);
      local(.12,.72,.06,'#ebcf97',dx,4.29,front+.34);
      local(.65,.12,.06,'#ebcf97',dx,4.32,front+.34);
    }
    interiors.push({x:x+dx,z:z+dz,w:w-.2,d:d-.2,kind,level});
    return {front,back};
  }

  function furniture(dx,dz,w,d,top,h=.95) {
    local(w,.15,d,top,dx,h,dz);
    for(const a of [-1,1])for(const b of [-1,1]){
      local(.12,h,.12,oak,dx+a*(w/2-.12),h/2,dz+b*(d/2-.1));
    }
    obstacles.push({x:x+dx,z:z+dz,w,d,h:h+.08});
  }
  const keep=room({dx:0,dz:-14.9,w:12.8,d:12.7,h:7.05,roof:'#473f3a',kind:'office'});
  const deskZ=-16.4;
  local(6,.04,8,'#7e3c3c',0,.115,-13.95);
  local(5.68,.044,.11,'#d8b170',0,.14,-10.1);
  local(5.68,.044,.11,'#d8b170',0,.14,-17.8);
  furniture(0,deskZ,3.8,1.34,'#604132',1.17);
  local(1.18,.07,.73,'#d8c4a0',-.15,1.29,deskZ+.12);
  local(.62,.04,.41,'#513e39',1.11,1.27,deskZ-.11);
  local(.56,.11,.59,'#ad874d',-1.16,1.27,deskZ-.22);
  local(.66,.15,.68,'#70433c',0,.62,deskZ-1.19);
  local(.68,1.23,.18,'#75483d',0,1.11,deskZ-1.49);
  for(const side of [-1,1]){
    const sx=side*4.1;
    local(1.36,3,.52,oak,sx,1.5,keep.back+.58);
    for(let row=0;row<3;row++){
      local(1.45,.13,.57,'#8a6544',sx,.5+row*.75,keep.back+.58);
      for(let j=0;j<5;j++)local(.14,.5,.32,roofs[(j+row)%4],sx-.5+j*.21,.82+row*.75,keep.back+.64);
    }
    local(.69,1.8,.12,flag,side*3.9,3.35,keep.back+.35);
    local(.24,1.14,.23,'#927248',side*5.65,.57,-11);
    local(.29,.19,.28,'#e2b26b',side*5.65,1.23,-11);
  }
  // The other front-facing doors lead to furnished shops and homes.
  for(const side of [-1,1]){
    for(let row=0;row<3;row++){
      const dx=side*(row===2?14.7:10.75), dz=13.9-row*13.2;
      const shop=row===0;
      const {front,back}=room({dx,dz,w:7.9,d:6.6,h:3.85,roof:roofs[(row+id+(side>0?1:0))%4],kind:shop?'shop':'house'});
      if(shop){
        const awning=local(6.9,.13,1.75,'#d8b788',dx,3.1,front+.78);
        awning.rotation.x=.18;
        for(let stripe=0;stripe<5;stripe++){
          const band=local(.64,.15,1.78,stripe%2?'#b16c4d':flag,dx-2.72+stripe*1.36,3.12,front+.78);
          band.rotation.x=.18;
        }
        furniture(dx+1.7,dz-.78,2.2,1.01,'#845939');
        for(let i=0;i<4;i++){
          local(.37,.34,.45,i%2?'#8a554a':'#ac8b4e',dx+1+i*.49,1.2,dz-.78);
        }
        local(.9,.7,.85,'#75593d',dx-2.58,.41,back+1);
        local(.48,.51,.13,flag,dx+2.48,2.9,front+.41);
      }else{
        furniture(dx+2.05,dz-.7,1.65,1.03,'#866749',.8);
        solid(1.38,.27,2.21,'#6f5241',dx-2.22,.3,dz-.62);
        local(1.19,.19,1.86,'#b39b7a',dx-2.22,.56,dz-.62);
        local(.86,.13,.51,'#d2c3a4',dx-2.22,.67,dz-1.23);
        local(.72,1.05,.76,oak,dx+2.57,.57,back+.82);
      }
    }
  }
  for(const [wx,wz] of [[-6,8],[6,8],[-5,-6],[5,-6],[-18,-5],[18,-5]]){
    local(.13,2.4,.14,'#634d38',wx,1.2,wz);
    local(.32,.36,.29,'#d0a35e',wx,2.29,wz);
    local(.45,.13,.43,'#5c5141',wx,2.52,wz);
  }
  const batches=new Map();
  town.traverse(node=>{
    if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}
    if(node.isMesh&&node.geometry.type==='BoxGeometry'){
      const key=node.material.id;
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push(node);
    }
  });
  for(const nodes of batches.values()){
    if(nodes.length<3)continue;
    const positions=[],normals=[],uvs=[],indices=[];
    const vertex=new THREE.Vector3(),normal=new THREE.Vector3(),basis=new THREE.Matrix3();
    for(const node of nodes){
      node.updateMatrix();
      basis.getNormalMatrix(node.matrix);
      const {position,normal:sourceNormal,uv}=node.geometry.attributes;
      const offset=positions.length/3;
      for(let i=0;i<position.count;i++){
        vertex.fromBufferAttribute(position,i).applyMatrix4(node.matrix);
        normal.fromBufferAttribute(sourceNormal,i).applyNormalMatrix(basis);
        positions.push(vertex.x,vertex.y,vertex.z);normals.push(normal.x,normal.y,normal.z);
        uvs.push(uv.getX(i),uv.getY(i));
      }
      for(let i=0;i<node.geometry.index.count;i++)indices.push(offset+node.geometry.index.getX(i));
      town.remove(node);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    const batch=new THREE.Mesh(geometry,nodes[0].material);
    batch.castShadow=true;
    batch.receiveShadow=true;
    town.add(batch);
  }
  return {
    group:town, obstacles, interiors,
    spawn:{x,z:z+9},
    office:{x,z:z+deskZ+2.0,radius:2.6,level},
    center:{x,z,level}
  };
}
