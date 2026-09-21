const {createClient}=window.supabase;
const db=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
const $=id=>document.getElementById(id);
let current=new Date(); current.setHours(0,0,0,0);
let view='month', events=[];

const typeClass=e=>e.event_type==='garden'?'garden':e.event_type==='vehicle'?'vehicle':e.event_type==='shift'?'shift':'neutral';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const isoLocal=d=>new Date(d).toISOString();
const fmtTime=d=>new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date(d));
const fmtDate=d=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(d));
function localDateInput(d){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(d)}
function labelDate(d){return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(d)}

async function session(){
  const {data}=await db.auth.getSession();
  if(data.session){$('loginPanel').classList.add('hidden');$('appPanel').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');await load();}
  else{$('loginPanel').classList.remove('hidden');$('appPanel').classList.add('hidden');$('logoutBtn').classList.add('hidden')}
}

async function load(){
  const from=new Date(current); from.setDate(1); from.setDate(from.getDate()-7);
  const to=new Date(current); to.setMonth(to.getMonth()+1,7);
  const [reqRes,manRes]=await Promise.all([
    db.from('request_booking_blocks').select('request_id,booking_start,booking_end,requests!inner(service_type,status)').gte('booking_end',from.toISOString()).lte('booking_start',to.toISOString()),
    db.from('calendar_manual_events').select('*').gte('end_at',from.toISOString()).lte('start_at',to.toISOString())
  ]);
  const reqs=(reqRes.data||[]).map(x=>({id:'r-'+x.request_id+'-'+x.booking_start,start:x.booking_start,end:x.booking_end,title:x.requests?.service_type||'Kundentermin',event_type:x.requests?.service_type==='Gartenarbeiten'?'garden':x.requests?.service_type==='Fahrzeugpflege'?'vehicle':'other',source:'request'}));
  const mans=(manRes.data||[]).map(x=>({...x,start:x.start_at,end:x.end_at,source:'manual'}));
  events=[...reqs,...mans]; render();
}

function monthCells(){
  const first=new Date(current.getFullYear(),current.getMonth(),1);
  const start=new Date(first); start.setDate(first.getDate()-((first.getDay()+6)%7));
  return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
}
function eventsOn(d){
  const a=new Date(d);a.setHours(0,0,0,0);const b=new Date(a);b.setDate(b.getDate()+1);
  return events.filter(e=>new Date(e.start)<b&&new Date(e.end)>a).sort((x,y)=>new Date(x.start)-new Date(y.start));
}
function render(){
  $('monthTitle').textContent=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(current);
  if(view==='month')renderMonth(); else if(view==='week')renderWeek(); else renderDay();
}
function eventHtml(e){
  const s=fmtTime(e.start),en=fmtTime(e.end);
  return `<div class="event ${typeClass(e)}"><b>${esc(e.title)}</b><br>${s}–${en}</div>`;
}
function renderMonth(){
  const names=['Mo','Di','Mi','Do','Fr','Sa','So'];
  let h='<div class="month-grid">'+names.map(n=>`<div class="dow">${n}</div>`).join('');
  monthCells().forEach(d=>{const muted=d.getMonth()!==current.getMonth();h+=`<div class="day ${muted?'muted':''}"><div class="day-num">${d.getDate()}</div>${eventsOn(d).map(eventHtml).join('')}</div>`});
  h+='</div>';$('calendar').innerHTML=h;
}
function weekStart(d){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function renderWeek(){
  const ws=weekStart(current),names=['Mo','Di','Mi','Do','Fr','Sa','So'];
  let h='<div class="week-grid"><div></div>'+names.map((n,i)=>{let d=new Date(ws);d.setDate(ws.getDate()+i);return `<div class="time-cell"><b>${n}</b><br>${labelDate(d)}</div>`}).join('');
  for(let hour=6;hour<22;hour++){h+=`<div class="time-cell">${String(hour).padStart(2,'0')}:00</div>`;for(let i=0;i<7;i++){let d=new Date(ws);d.setDate(ws.getDate()+i);h+=`<div class="week-day">${eventsOn(d).filter(e=>new Date(e.start).getHours()===hour).map(eventHtml).join('')}</div>`}}
  $('calendar').innerHTML=h+'</div>';
}
function renderDay(){
  const d=current;let h='<div class="day-view">';
  for(let hour=0;hour<24;hour++){h+=`<div class="slot slot-label">${String(hour).padStart(2,'0')}:00</div><div class="slot">${eventsOn(d).filter(e=>new Date(e.start).getHours()===hour).map(eventHtml).join('')}</div>`}
  $('calendar').innerHTML=h+'</div>';
}

$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();$('loginMsg').classList.add('hidden');
 const {error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});
 if(error){$('loginMsg').textContent=error.message;$('loginMsg').classList.remove('hidden');return} await session();
});
$('logoutBtn').onclick=async()=>{await db.auth.signOut();await session()};
$('prevBtn').onclick=()=>{if(view==='month')current.setMonth(current.getMonth()-1);else current.setDate(current.getDate()-(view==='week'?7:1));render()};
$('nextBtn').onclick=()=>{if(view==='month')current.setMonth(current.getMonth()+1);else current.setDate(current.getDate()+(view==='week'?7:1));render()};
$('todayBtn').onclick=()=>{current=new Date();current.setHours(0,0,0,0);render()};
document.querySelectorAll('.view-tabs button').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('.view-tabs button').forEach(x=>x.classList.toggle('active',x===b));render()});

function openModal(){
 const now=new Date(),end=new Date(now.getTime()+3600000);
 $('startDate').value=localDateInput(now);$('endDate').value=localDateInput(end);
 $('startTime').value=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
 $('endTime').value=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',hour12:false}).format(end);
 $('eventType').value='private';$('eventTitle').value='';$('eventNotes').value='';$('formMsg').classList.add('hidden');$('modal').classList.remove('hidden');
}
$('addBtn').onclick=openModal;$('closeBtn').onclick=$('cancelBtn').onclick=()=>$('modal').classList.add('hidden');
$('eventType').onchange=()=>{if($('eventType').value==='shift'){$('eventTitle').value='24h-Schicht';const d=new Date(`${$('startDate').value}T${$('startTime').value}`);d.setHours(d.getHours()+24);$('endDate').value=localDateInput(d);$('endTime').value=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}};

$('eventForm').addEventListener('submit',async e=>{
 e.preventDefault();$('formMsg').classList.add('hidden');
 const start=new Date(`${$('startDate').value}T${$('startTime').value}:00+02:00`);
 const end=new Date(`${$('endDate').value}T${$('endTime').value}:00+02:00`);
 if(!(end>start)){ $('formMsg').textContent='Das Ende muss nach dem Start liegen.';$('formMsg').classList.remove('hidden');return}
 const {data:{user}}=await db.auth.getUser();
 const {error}=await db.from('calendar_manual_events').insert({title:$('eventTitle').value,event_type:$('eventType').value,start_at:start.toISOString(),end_at:end.toISOString(),notes:$('eventNotes').value||null,created_by:user.id});
 if(error){$('formMsg').textContent=error.message;$('formMsg').classList.remove('hidden');return}
 $('modal').classList.add('hidden');await load();
});

if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
db.auth.onAuthStateChange(()=>session());session();
