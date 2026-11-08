(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['speed','speedBar','distance','timer','position','lapLabel','nitroBar','nitroReady','nitroHint','raceOrder','startPanel','startButton','finishPanel','finishTitle','finishCopy','finishTime','finishPosition','restartButton','soundButton','toast'].map(id => [id, document.getElementById(id)]));
  const TAU = Math.PI * 2;
  const names = ['YOU','NOVA','ACE','MILA','KAI','ROOK'];
  const paints = ['#52d9d4','#ff624e','#f2ca63','#916cff','#f2f0e9','#ff8a45'];
  const keys = {left:false,right:false,accelerate:false,brake:false,boost:false};
  let W=0,H=0,dpr=1,last=0,active=false,finished=false,muted=true,audio=null;
  let speed=0,nitro=100,playerX=0,total=0,raceTime=0,toastTimer=0,flash=0,shake=0;
  let racers=[], scenery=[], clouds=[], particles=[];
  const LAP_LENGTH=2150,LAPS=3,RACE_LENGTH=LAP_LENGTH*LAPS;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const mod=(a,b)=>((a%b)+b)%b;

  function resize(){
    const rect=canvas.getBoundingClientRect(); W=rect.width; H=rect.height; dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize',resize,{passive:true}); resize();
  function seedWorld(){
    clouds=Array.from({length:9},(_,i)=>({x:(i*173+31)%1000/1000,y:.12+((i*71)%17)/100,w:.07+((i*23)%11)/100}));
    scenery=[];
    for(let i=0;i<42;i++){scenery.push({z:80+i*31,side:i%2?1:-1,type:i%5===0?'palm':i%4===0?'sign':'pine',scale:.7+((i*37)%50)/100});}
    racers=names.slice(1).map((name,i)=>({name,color:paints[i+1],x:([-5.25,-1.75,1.75,5.25][i%4])+(i>3?0:0),progress:70+i*145,speed:91+i*3,phase:i*1.7,hit:0}));
  }
  seedWorld();
  const curveAt=(d)=>Math.sin(d*.00052)*2.5+Math.sin(d*.00113+1.3)*.95+Math.sin(d*.00021)*2.1;
  function project(x,y,z){
    const depth=Math.max(2,z),f=H*1.2/depth;
    const center=curveAt(total+z)-curveAt(total);
    return {x:W*.5+(x+center-playerX)*f,y:H*.335+(4.8-y)*f,s:f};
  }
  function roundRect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill();}
  function drawBackground(t){
    const sky=ctx.createLinearGradient(0,0,0,H*.65);sky.addColorStop(0,'#527e8b');sky.addColorStop(.52,'#d58d70');sky.addColorStop(1,'#edb084');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // soft late-day light and ocean haze
    const sunX=W*.73,sunY=H*.255,sunR=Math.min(W,H)*.073;
    const glow=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,sunR*2.7);glow.addColorStop(0,'rgba(255,221,167,.52)');glow.addColorStop(1,'rgba(255,190,144,0)');ctx.fillStyle=glow;ctx.fillRect(sunX-sunR*3,sunY-sunR*3,sunR*6,sunR*6);
    ctx.fillStyle='#ffe0af';ctx.beginPath();ctx.arc(sunX,sunY,sunR,0,TAU);ctx.fill();
    // distant coastal headlands
    polygon([[0,H*.36],[W*.11,H*.295],[W*.19,H*.33],[W*.3,H*.275],[W*.41,H*.35],[W*.53,H*.3],[W*.62,H*.35],[W*.73,H*.28],[W*.86,H*.33],[W,H*.29],[W,H*.56],[0,H*.56]],'#667d7c');
    polygon([[0,H*.395],[W*.17,H*.33],[W*.29,H*.39],[W*.43,H*.335],[W*.58,H*.39],[W*.75,H*.32],[W*.91,H*.4],[W,H*.35],[W,H*.59],[0,H*.59]],'#76847c');
    const sea=ctx.createLinearGradient(0,H*.36,0,H*.72);sea.addColorStop(0,'#65858a');sea.addColorStop(.65,'#48717b');sea.addColorStop(1,'#325966');ctx.fillStyle=sea;ctx.fillRect(0,H*.37,W,H*.32);
    ctx.globalAlpha=.22;ctx.strokeStyle='#f9d1a5';ctx.lineWidth=1;
    for(let i=0;i<9;i++){let y=H*(.4+i*.025);ctx.beginPath();ctx.moveTo(W*.57+i*9,y);ctx.lineTo(W*.93-i*8,y);ctx.stroke();}ctx.globalAlpha=1;
    // low coastal scrub
    ctx.fillStyle='#36544b';ctx.fillRect(0,H*.56,W,H*.13);
    for(let i=0;i<27;i++){const x=((i*97+21)%1000)/1000*W;const y=H*.54+((i*29)%40)/1000*H;ctx.fillStyle=i%2?'#385d51':'#456454';ctx.beginPath();ctx.ellipse(x,y,7+(i%6)*3,3+(i%3)*2,0,0,TAU);ctx.fill();}
  }
  function roadEdge(z,side){return project(side*8.15,0,z);}
  function drawRoad(){
    const horizon=H*.335; const segments=68; const near=5,far=1250;
    const depths=Array.from({length:segments+1},(_,i)=>near+(far-near)*Math.pow(i/segments,1.68));
    // shoulders and striped curbs
    for(let i=segments-1;i>=0;i--){
      const a=depths[i],b=depths[i+1],al=roadEdge(a,-1),ar=roadEdge(a,1),bl=roadEdge(b,-1),br=roadEdge(b,1);
      const stripe=(Math.floor((total+a)/37)%2)===0;
      polygon([[al.x-8*al.s,al.y],[ar.x+8*ar.s,ar.y],[br.x+8*br.s,br.y],[bl.x-8*bl.s,bl.y]],stripe?'#d8d0b8':'#657a72');
      polygon([[al.x,al.y],[ar.x,ar.y],[br.x,br.y],[bl.x,bl.y]],(Math.floor((total+a)/105)%2===0)?'#343b3c':'#303738');
      // road edge lines
      const inset=project(7.25,0,a),insetB=project(7.25,0,b),insetL=project(-7.25,0,a),insetLB=project(-7.25,0,b);
      polygon([[inset.x,inset.y],[insetL.x,insetL.y],[insetLB.x,insetLB.y],[insetB.x,insetB.y]],'#e4dfc9');
      // dashed lane lines in three equal lanes
      const dashOn=Math.floor((total+a)/64)%2===0;
      if(dashOn)for(const lane of [-3.5,0,3.5]){
        const x1=project(lane-.055,0,a),x2=project(lane+.055,0,a),x3=project(lane+.055,0,b),x4=project(lane-.055,0,b);
        polygon([[x1.x,x1.y],[x2.x,x2.y],[x3.x,x3.y],[x4.x,x4.y]],'rgba(237,235,213,.83)');
      }
    }
    // roadside reflectors and markers
    for(let z=40;z<900;z+=48){
      if(Math.floor((total+z)/48)%2)continue;
      for(const side of [-1,1]){
        const p=project(side*8.5,0,z),sc=p.s;
        ctx.fillStyle='#e7d8b8';ctx.fillRect(p.x-sc*.06,p.y-sc*.55,Math.max(1,sc*.12),sc*.55);
        ctx.fillStyle='#f4a278';ctx.beginPath();ctx.arc(p.x,p.y-sc*.48,Math.max(1,sc*.12),0,TAU);ctx.fill();
      }
    }
    // road gloss / sunset reflection
    const c1=project(-.48,0,105),c2=project(.48,0,105),c3=project(.15,0,750),c4=project(-.15,0,750);
    const sheen=ctx.createLinearGradient(0,H*.45,0,H);sheen.addColorStop(0,'rgba(244,181,137,.02)');sheen.addColorStop(1,'rgba(249,194,152,.12)');polygon([[c1.x,c1.y],[c2.x,c2.y],[c3.x,c3.y],[c4.x,c4.y]],sheen);
  }
  function drawPine(x,y,s,color='#29463f'){
    ctx.fillStyle='#263a34';ctx.fillRect(x-s*.06,y-s*.48,s*.12,s*.48);
    polygon([[x,y-s*1.4],[x-s*.42,y-s*.66],[x-s*.2,y-s*.72],[x-s*.53,y-s*.28],[x+s*.53,y-s*.28],[x+s*.2,y-s*.72],[x+s*.42,y-s*.66]],color);
  }
  function drawPalm(x,y,s){
    ctx.strokeStyle='#4b4d3e';ctx.lineWidth=Math.max(1,s*.075);ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-s*.08,y-s*.65,x+s*.06,y-s*1.2);ctx.stroke();
    ctx.strokeStyle='#344a3c';ctx.lineWidth=Math.max(1,s*.11);for(let i=0;i<6;i++){const a=i/6*TAU;ctx.beginPath();ctx.moveTo(x+s*.06,y-s*1.2);ctx.quadraticCurveTo(x+Math.cos(a)*s*.36,y-s*1.45+Math.sin(a)*s*.15,x+Math.cos(a)*s*.66,y-s*1.31+Math.sin(a)*s*.27);ctx.stroke();}
  }
  function drawSign(x,y,s,label){
    ctx.fillStyle='#d2c19e';ctx.fillRect(x-s*.035,y-s*.8,s*.07,s*.8);roundRect(x-s*.43,y-s*1.36,s*.86,s*.55,s*.07,'#e6ddc8');ctx.fillStyle='#426765';ctx.font=`700 ${Math.max(3,s*.2)}px sans-serif`;ctx.textAlign='center';ctx.fillText(label,x,y-s*1.03);
  }
  function drawScenery(){
    for(const obj of scenery){let z=mod(obj.z-total,1300);if(z<24||z>850)continue;const p=project(obj.side*(10.2+obj.scale),0,z),s=p.s*obj.scale*4.2;
      if(s<.7)continue;
      if(obj.type==='palm')drawPalm(p.x,p.y,s*1.5);else if(obj.type==='sign')drawSign(p.x,p.y,s*1.3,'COAST');else drawPine(p.x,p.y,s*1.35,obj.side===1?'#29433c':'#304c42');
    }
  }
  function drawCar(x,z,color,player=false){
    const p=project(x,0,z),s=p.s*(player?1:1);const width=s*(player?1.52:1.55),height=s*(player?.7:.72);if(width<2||p.y>H+height||p.y<-height)return;
    const cx=p.x,base=p.y;
    // shadow
    ctx.fillStyle='rgba(4,10,12,.45)';ctx.beginPath();ctx.ellipse(cx,base+height*.04,width*.72,height*.12,0,0,TAU);ctx.fill();
    // wheels / tires
    roundRect(cx-width*.53,base-height*.49,width*.19,height*.39,height*.07,'#11191a');roundRect(cx+width*.34,base-height*.49,width*.19,height*.39,height*.07,'#11191a');
    // rear body silhouette
    polygon([[cx-width*.5,base-height*.22],[cx-width*.42,base-height*.68],[cx-width*.23,base-height*.79],[cx+width*.23,base-height*.79],[cx+width*.44,base-height*.63],[cx+width*.51,base-height*.21],[cx+width*.37,base],[cx-width*.36,base]],color);
    // top / back window
    polygon([[cx-width*.36,base-height*.57],[cx-width*.23,base-height*.76],[cx+width*.2,base-height*.76],[cx+width*.36,base-height*.58],[cx+width*.31,base-height*.43],[cx-width*.3,base-height*.43]],player?'#142b32':'#1c3038');
    // body highlights and bumper
    polygon([[cx-width*.44,base-height*.39],[cx-width*.35,base-height*.2],[cx-width*.35,base-height*.08],[cx-width*.42,base-height*.11]],'rgba(255,255,255,.2)');
    polygon([[cx-width*.38,base-height*.11],[cx+width*.38,base-height*.11],[cx+width*.33,base-height*.03],[cx-width*.33,base-height*.03]],'#252b2a');
    // tail lamps
    roundRect(cx-width*.43,base-height*.35,width*.17,height*.115,height*.035,player?'#ff433e':'#ff5949');roundRect(cx+width*.26,base-height*.35,width*.17,height*.115,height*.035,player?'#ff433e':'#ff5949');
    ctx.fillStyle='rgba(255,105,73,.45)';ctx.fillRect(cx-width*.44,base-height*.34,width*.88,height*.04);
    if(player){
      // racing stripe and nitro flames
      if(keys.boost&&nitro>0&&active){ctx.globalAlpha=.8;ctx.fillStyle='#55e8ff';polygon([[cx-width*.25,base],[cx-width*.1,base+height*.12],[cx-width*.05,base],[cx-width*.1,base+height*.25]],'#47d8ff');polygon([[cx+width*.25,base],[cx+width*.1,base+height*.1],[cx+width*.07,base],[cx+width*.12,base+height*.24]],'#ffe0a2');ctx.globalAlpha=1;}
      polygon([[cx-width*.08,base-height*.76],[cx+width*.08,base-height*.76],[cx+width*.12,base-height*.07],[cx-width*.11,base-height*.07]],'#baf8ed');
    }
    if(!player){ctx.fillStyle='rgba(255,255,255,.88)';ctx.font=`700 ${Math.max(5,s*.16)}px sans-serif`;ctx.textAlign='center';ctx.fillText('GT',cx,base-height*.53);}
  }
  function drawWorldCars(){
    const visible=[];
    racers.forEach(r=>{let gap=r.progress-total;if(gap>25&&gap<1100)visible.push({x:r.x,gap,r});});
    // farther cars first
    visible.sort((a,b)=>b.gap-a.gap).forEach(({x,gap,r})=>drawCar(x,gap,r.color,false));
    drawCar(playerX,15,paints[0],true);
  }
  function paint(){
    ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
    drawBackground(performance.now());drawRoad();drawScenery();drawWorldCars();
    if(flash>0){ctx.fillStyle=`rgba(255,91,62,${flash*.23})`;ctx.fillRect(0,0,W,H);}
    // subtle speed streaks when nitro is on
    if(active&&keys.boost&&nitro>0&&speed>65){ctx.strokeStyle='rgba(114,241,231,.38)';ctx.lineWidth=1;for(let i=0;i<10;i++){let x=(i*127+total*3)%W,y=H*(.52+((i*37)%45)/100);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(x<W/2?-1:1)*12,y+30);ctx.stroke();}}
    ctx.restore();
  }
  function ordinal(n){return n===1?'1ST':n===2?'2ND':n===3?'3RD':`${n}TH`;}
  function timeText(sec){const m=Math.floor(sec/60),s=Math.floor(sec%60);return`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
  function updateHUD(){
    const kmh=Math.round(speed*2.35);ui.speed.textContent=String(kmh).padStart(3,'0');ui.speedBar.style.width=`${clamp(speed/142*100,0,100)}%`;
    ui.distance.innerHTML=`${(total/1000).toFixed(1)}<small> KM</small>`;ui.timer.textContent=timeText(raceTime);
    const order=[{name:'YOU',progress:total,player:true},...racers].sort((a,b)=>b.progress-a.progress);const pos=order.findIndex(r=>r.player)+1;
    ui.position.innerHTML=`${pos}<span>${pos===1?'ST':pos===2?'ND':pos===3?'RD':'TH'}</span>`;
    ui.lapLabel.textContent=`LAP ${Math.min(LAPS,Math.floor(total/LAP_LENGTH)+1)} / ${LAPS}`;
    ui.nitroBar.style.width=`${nitro}%`;ui.nitroReady.style.opacity=nitro>=99?'1':'.35';ui.nitroHint.textContent=nitro>=99?'HOLD SPACE':'RECHARGING';
    ui.raceOrder.innerHTML=order.map((r,i)=>`<li class="${r.player?'player':''}"><b>${String(i+1).padStart(2,'0')}</b><span>${r.name}</span><em>${r.player?'YOU':`+${Math.max(0,Math.floor((total-r.progress)/20))}m`}</em></li>`).join('');
  }
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTimer=1.2;}
  function reset(){
    speed=0;nitro=100;playerX=0;total=0;raceTime=0;flash=0;shake=0;finished=false;active=true;seedWorld();
    ui.startPanel.classList.add('hidden');ui.finishPanel.classList.add('hidden');ui.lapLabel.textContent='LAP 1 / 3';updateHUD();
  }
  function startAudio(){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch(e){}}
  function finish(){active=false;finished=true;speed=0;const pos=[{progress:total},...racers].sort((a,b)=>b.progress-a.progress).findIndex(r=>r.progress===total)+1;ui.finishTitle.innerHTML=pos===1?'RACE<br><em>WINNER.</em>':'RACE<br><em>COMPLETE.</em>';ui.finishCopy.textContent=pos===1?'You owned the coast. What a drive.':'The coast will remember that one.';ui.finishTime.textContent=timeText(raceTime);ui.finishPosition.textContent=ordinal(pos);ui.finishPanel.classList.remove('hidden');}
  function tick(dt){
    if(active){
      raceTime+=dt;
      const accelerating=keys.accelerate;
      if(accelerating)speed=Math.min(142,speed+52*dt);else speed=Math.max(0,speed-(keys.brake?102:24)*dt);
      let boosting=keys.boost&&nitro>0&&speed>22;
      if(boosting){speed=Math.min(174,speed+75*dt);nitro=Math.max(0,nitro-34*dt);}else nitro=Math.min(100,nitro+11*dt);
      const steer=(keys.right?1:0)-(keys.left?1:0);
      playerX+=steer*(5.2+speed*.04)*dt;
      playerX=clamp(playerX,-9.6,9.6);
      const curve=curveAt(total);
      let offRoad=Math.abs(playerX)>6.3;
      if(offRoad){speed=Math.max(28,speed-40*dt);if(Math.random()<dt*2)showToast('OFF THE RACING LINE');}
      const move=speed*dt*(offRoad?.65:1);total+=move;
      racers.forEach(r=>{
        r.phase+=dt;
        const packWave=Math.sin(r.phase*.24)*3.2;
        const target=([ -5.25,-1.75,1.75,5.25][Math.floor((r.phase*.16+names.indexOf(r.name))%4)])+packWave*.28;
        r.x=lerp(r.x,target,dt*.24);
        const catchup=total-r.progress;
        const pace=r.speed+(catchup>170?8:catchup< -180?-8:0)+Math.sin(r.phase*.9)*3;
        r.progress+=pace*dt;
        if(r.hit>0)r.hit-=dt;
        const gap=r.progress-total;
        if(gap>0&&gap<17&&Math.abs(r.x-playerX)<2.05&&r.hit<=0){
          speed=Math.max(22,speed*.48);r.progress-=20;r.hit=1.2;flash=.8;shake=8;showToast('CONTACT!');
        }
      });
      if(shake>0)shake=Math.max(0,shake-dt*20);if(flash>0)flash=Math.max(0,flash-dt*1.4);
      const lap=Math.floor(total/LAP_LENGTH);
      if(total>=RACE_LENGTH){total=RACE_LENGTH;finish();}
      else if(total>0&&Math.floor((total-move)/LAP_LENGTH)<lap)showToast(lap===1?'LAP 2 — KEEP PUSHING':'FINAL LAP — GO!');
      updateHUD();
    }
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
  }
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;tick(dt);paint();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  function setKey(key,down){
    const k=key.toLowerCase();if(['arrowleft','a'].includes(k))keys.left=down;else if(['arrowright','d'].includes(k))keys.right=down;else if(['arrowup','w'].includes(k))keys.accelerate=down;else if(['arrowdown','s'].includes(k))keys.brake=down;else if(k===' ')keys.boost=down;
  }
  window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();setKey(e.key,true);if(e.key==='Enter'&&!active)reset();},{passive:false});
  window.addEventListener('keyup',e=>setKey(e.key,false));window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
  document.querySelectorAll('[data-control]').forEach(button=>{
    const control=button.dataset.control;
    const down=e=>{e.preventDefault();keys[control]=true;button.classList.add('pressed');if(control==='boost')ui.nitroHint.textContent='BOOSTING';};
    const up=e=>{e.preventDefault();keys[control]=false;button.classList.remove('pressed');};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('pointerleave',up);
  });
  ui.startButton.addEventListener('click',()=>{reset();startAudio();});ui.restartButton.addEventListener('click',()=>{reset();startAudio();});
  ui.soundButton.addEventListener('click',()=>{muted=!muted;ui.soundButton.textContent=muted?'♫':'♪';ui.soundButton.title=muted?'Sound off':'Sound on';startAudio();});
  // Drag steering is a convenient alternative on touch screens and trackpads.
  let dragX=null;canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.pointerType==='pen'){dragX=e.clientX;canvas.setPointerCapture(e.pointerId);}});
  canvas.addEventListener('pointermove',e=>{if(dragX!==null&&active){const dx=e.clientX-dragX;playerX=clamp(playerX+dx/W*12,-9,9);dragX=e.clientX;}});canvas.addEventListener('pointerup',()=>dragX=null);canvas.addEventListener('pointercancel',()=>dragX=null);
  updateHUD();
})();
