const ink='#f2d6a2';
const muted='#b3ad97';

export function createChart({limit,points,castles,height,river,roads}) {
  const size=560, padding=34, span=size-padding*2;
  const pixel=n=>padding+(n/limit+1)*span/2;
  const world=n=>n/span*limit*2-limit;
  const background=document.createElement('canvas');
  background.width=background.height=size;
  const layer=background.getContext('2d');
  layer.fillStyle='#222b25';
  layer.fillRect(0,0,size,size);
  const tile=6;
  for(let x=0;x<span;x+=tile)for(let z=0;z<span;z+=tile){
    const wx=world(x),wz=world(z);
    const altitude=height(wx,wz),shade=height(wx+7,wz+7)-height(wx-7,wz-7);
    const l=Math.min(53,Math.max(19,32+altitude*.44+shade*.36));
    layer.fillStyle='hsl('+Math.max(40,80-altitude*.48)+' 23% '+l+'%)';
    layer.fillRect(padding+x,padding+z,Math.min(tile,span-x),Math.min(tile,span-z));
  }
  layer.strokeStyle='#d6c59524';layer.lineWidth=1;
  for(let i=1;i<8;i++){
    const p=padding+span*i/8;
    layer.beginPath();layer.moveTo(p,padding);layer.lineTo(p,size-padding);
    layer.moveTo(padding,p);layer.lineTo(size-padding,p);layer.stroke();
  }
  layer.strokeStyle='#334845';layer.lineWidth=9;
  for(const paint of ['#344b4c','#77a1a8']){
    layer.strokeStyle=paint;
    layer.beginPath();
    for(let z=-limit;z<=limit;z+=3){
      if(z===-limit)layer.moveTo(pixel(river(z)),pixel(z));
      else layer.lineTo(pixel(river(z)),pixel(z));
    }
    layer.stroke();layer.lineWidth=5;
  }
  layer.setLineDash([4,5]);layer.strokeStyle='#f1c681a0';layer.lineWidth=2;
  for(const [[ax,az],[bx,bz]] of roads){
    layer.beginPath();layer.moveTo(pixel(ax),pixel(az));layer.lineTo(pixel(bx),pixel(bz));layer.stroke();
  }
  layer.setLineDash([]);
  layer.strokeStyle='#977e57';layer.lineWidth=1;
  layer.strokeRect(padding-.5,padding-.5,span+1,span+1);
  layer.font='600 14px system-ui';layer.fillStyle=ink;layer.textAlign='center';
  [['N',size/2,23],['S',size/2,size-11],['W',17,size/2+5],['E',size-17,size/2+5]].forEach(([name,x,z])=>layer.fillText(name,x,z));

  return function draw(canvas,actor,others) {
    if (canvas.width!==size||canvas.height!==size) canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(background,0,0);
    ctx.textAlign='center';ctx.textBaseline='top';ctx.font='600 15px system-ui';
    for(let i=0;i<points.length;i++){
      const [x,z]=points[i],px=pixel(x),pz=pixel(z),flag=castles[i][4];
      ctx.fillStyle='#1e251e';
      ctx.strokeStyle=flag;ctx.lineWidth=1.6;
      ctx.fillRect(px-7,pz-7,14,14);ctx.strokeRect(px-7,pz-7,14,14);
      const label=castles[i][0];
      const width=ctx.measureText(label).width+11;
      ctx.fillRect(px-width/2,pz+11,width,23);
      ctx.fillStyle=flag;
      ctx.fillText(label,px,pz+14);
    }
    for(const other of others){
      ctx.fillStyle=muted;ctx.beginPath();ctx.arc(pixel(other.x),pixel(other.z),3.8,0,Math.PI*2);ctx.fill();
    }
    if(!actor)return;
    ctx.save();ctx.translate(pixel(actor.position.x),pixel(actor.position.z));
    ctx.rotate(-actor.rotation.y+Math.PI);
    ctx.strokeStyle='#2c261c';ctx.lineWidth=3;
    ctx.fillStyle='#fff1ca';ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(8,8);
    ctx.lineTo(0,4);ctx.lineTo(-8,8);ctx.closePath();ctx.stroke();ctx.fill();
    ctx.restore();
  };
}
