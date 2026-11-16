import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const cycle=['맑음','흐림','안개','비','흐림','맑음'];
const modes={'맑음':[0,.0025,0],'흐림':[.48,.0035,0],'안개':[.56,.009,0],'비':[.89,.0058,1]};
export function climateAt(seconds) {
  const elapsed=Math.max(0,Number.isFinite(seconds)?seconds:0);
  const minute=(16*60+20+elapsed*1.45)%1440;
  const hour=minute/60;
  const angle=(hour-6)/24*Math.PI*2;
  const altitude=Math.sin(angle);
  const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
  const day=smooth(-.19,.26,altitude);
  const dusk=(1-smooth(0,.37,Math.abs(altitude)))*smooth(-.25,-.06,altitude);
  const weatherIndex=Math.floor(elapsed/145);
  const weather=cycle[weatherIndex%cycle.length];
  const blend=smooth(0,16,elapsed%145);
  const before=modes[cycle[(weatherIndex+cycle.length-1)%cycle.length]];
  const [cloud,fog,rain]=modes[weather].map((n,i)=>THREE.MathUtils.lerp(before[i],n,blend));
  const clock=String(Math.floor(hour)).padStart(2,'0')+':'+String(Math.floor(minute%60)).padStart(2,'0');
  return {clock,weather,day,dusk,cloud,fog,rain,altitude,angle};
}

export function createClimate(scene, sky, sun, ambient) {
  const origin=new THREE.Vector3(), skyColor=new THREE.Color(), low=new THREE.Color(), high=new THREE.Color();
  const blue=new THREE.Color('#628fc4'), night=new THREE.Color('#0a1736');
  const daylight=new THREE.Color('#c5cfcb'), nightHorizon=new THREE.Color('#26394f');
  const sunset=new THREE.Color('#f8a96c'), cloudTint=new THREE.Color('#7d8c91');
  const amber=new THREE.Color('#ffac67'), pale=new THREE.Color('#ffead2');
  const dayAmbient=new THREE.Color('#dce9ff'), moonAmbient=new THREE.Color('#8aa6e6');
  const windRain=[];
  const rainCount=215, drops=new Float32Array(rainCount*6);
  for(let i=0;i<rainCount;i++){
    windRain.push({x:(i*7.31)%24-12,y:(i*3.73)%15,z:(i*1.81)%24-12,rate:10+i%7});
  }
  const particles=new THREE.BufferGeometry();
  const coordinates=new THREE.BufferAttribute(drops,3);
  coordinates.setUsage(THREE.DynamicDrawUsage);
  particles.setAttribute('position',coordinates);
  const precipitation=new THREE.LineSegments(particles,new THREE.LineBasicMaterial({
    color:'#c4dded',transparent:true,opacity:.31,depthWrite:false
  }));
  precipitation.frustumCulled=false;
  scene.add(precipitation);
  let lastWeather;
  function update(state,dt,focus,inside) {
    const {day,dusk,cloud,fog,rain,altitude,angle}=state;
    high.copy(night).lerp(blue,day).lerp(cloudTint,cloud*.28);
    low.copy(nightHorizon).lerp(daylight,day).lerp(sunset,dusk*.58).lerp(cloudTint,cloud*.33);
    sky.uniforms.horizon.value.copy(low);
    sky.uniforms.zenith.value.copy(high);
    sky.uniforms.clouds.value=cloud;
    sky.uniforms.lightStrength.value=day*(1-.79*cloud);
    sky.uniforms.time.value=state.seconds;
    origin.set(-Math.cos(angle)*.94,Math.max(.18,altitude),.48).normalize();
    sky.uniforms.light.value.copy(origin);
    sun.color.copy(amber).lerp(pale,THREE.MathUtils.smoothstep(altitude,.02,.73));
    sun.intensity=(.065+2.95*day)*(1-.73*cloud);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(origin,93);
    ambient.color.copy(moonAmbient).lerp(dayAmbient,day);
    ambient.intensity=.7+.89*day+.12*cloud;
    skyColor.copy(low).lerp(high,.16);
    scene.fog.color.copy(skyColor);
    scene.fog.density=fog;
    precipitation.visible=!inside&&rain>.045;
    if(precipitation.visible){
      precipitation.position.set(focus.x,focus.y-2,focus.z);
      precipitation.material.opacity=rain*.44;
      for(let i=0;i<rainCount;i++){
        const drop=windRain[i];
        drop.y-=drop.rate*dt;
        if(drop.y<0)drop.y+=15;
        const j=i*6;
        drops[j]=drop.x;drops[j+1]=drop.y;drops[j+2]=drop.z;
        drops[j+3]=drop.x-.17;drops[j+4]=drop.y+.72;drops[j+5]=drop.z+.09;
      }
      coordinates.needsUpdate=true;
    }
    const label=state.clock+' · '+state.weather;
    if(label===lastWeather)return null;
    lastWeather=label;
    return label;
  }
  return {update};
}
