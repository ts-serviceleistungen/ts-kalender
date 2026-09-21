const {createClient}=window.supabase;
const db=createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);

let current=new Date();
current.setHours(0,0,0,0);
let view='month';
let events=[];

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const typeClass=e=>{
  if(e.event_type==='garden') return 'garden';
  if(e.event_type==='vehicle') return 'vehicle';
  if(e.event_type==='shift') return 'shift';
  return 'neutral';
};

const fmtTime=d=>new Intl.DateTimeFormat('de-DE',{
  hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'
}).format(new Date(d));

const fmtDate=d=>new Intl.DateTimeFormat('de-DE',{
  day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'
}).format(new Date(d));

function berlinDateInput(d){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'Europe/Berlin',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date(d));
}

function labelDate(d){
  return new Intl.DateTimeFormat('de-DE',{
    day:'2-digit',month:'2-digit',timeZone:'Europe/Berlin'
  }).format(d);
}

function serviceEventType(serviceType){
  const s=String(serviceType||'').toLowerCase();
  if(s.includes('garten')) return 'garden';
  if(s.includes('fahrzeug')) return 'vehicle';
  return 'other';
}

function serviceTitle(serviceType){
  if(serviceType==='Gartenarbeiten') return 'Gartenarbeiten';
  if(serviceType==='Fahrzeugpflege') return 'Fahrzeugpflege';
  return serviceType || 'Kundentermin';
}

async function session(){
  const {data}=await db.auth.getSession();
  if(data.session){
    $('loginPanel').classList.add('hidden');
    $('appPanel').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    await load();
  }else{
    $('loginPanel').classList.remove('hidden');
    $('appPanel').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }
}

async function load(){
  const from=new Date(current.getFullYear(),current.getMonth()-1,1);
  const to=new Date(current.getFullYear(),current.getMonth()+2,0);
  from.setHours(0,0,0,0);
  to.setHours(23,59,59,999);

  const fromIso=from.toISOString();
  const toIso=to.toISOString();

  // Der gemeinsame Kalender kommt direkt aus den bestehenden
  // request_booking_blocks. Dadurch werden exakt dieselben Zeitblöcke
  // verwendet wie im bestehenden Kunden-/Admin-Kalender.
  const reqRes=await db
    .from('request_booking_blocks')
    .select('request_id,booking_start,booking_end')
    .lt('booking_start',toIso)
    .gt('booking_end',fromIso);

  if(reqRes.error){
    console.error('request_booking_blocks:',reqRes.error);
    events=[];
    render();
    showLoadMessage('Die bestehenden Kundentermine konnten noch nicht geladen werden. Bitte die Zugriffsregel für request_booking_blocks setzen.');
    return;
  }

  const blocks=reqRes.data||[];
  const ids=[...new Set(blocks.map(x=>x.request_id).filter(Boolean))];

  let requestMap=new Map();

  if(ids.length){
    const requestRes=await db
      .from('requests')
      .select('id,service_type,status')
      .in('id',ids);

    if(requestRes.error){
      console.error('requests:',requestRes.error);
    }else{
      requestMap=new Map((requestRes.data||[]).map(x=>[x.id,x]));
    }
  }

  const reqs=blocks.map(x=>{
    const r=requestMap.get(x.request_id);
    return {
      id:'r-'+x.request_id+'-'+x.booking_start,
      start:x.booking_start,
      end:x.booking_end,
      title:serviceTitle(r?.service_type),
      event_type:serviceEventType(r?.service_type),
      source:'request',
      status:r?.status||'Bestätigt'
    };
  });

  const manRes=await db
    .from('calendar_manual_events')
    .select('*')
    .lt('start_at',toIso)
    .gt('end_at',fromIso);

  if(manRes.error){
    console.error('calendar_manual_events:',manRes.error);
  }

  const mans=(manRes.data||[]).map(x=>({
    ...x,
    start:x.start_at,
    end:x.end_at,
    source:'manual'
  }));

  events=[...reqs,...mans];
  hideLoadMessage();
  render();
}

function showLoadMessage(msg){
  let el=$('calendarLoadMsg');
  if(!el){
    el=document.createElement('p');
    el.id='calendarLoadMsg';
    el.className='notice';
    $('calendar').before(el);
  }
  el.textContent=msg;
  el.classList.remove('hidden');
}

function hideLoadMessage(){
  const el=$('calendarLoadMsg');
  if(el) el.classList.add('hidden');
}

function monthCells(){
  const first=new Date(current.getFullYear(),current.getMonth(),1);
  const start=new Date(first);
  start.setDate(first.getDate()-((first.getDay()+6)%7));
  return Array.from({length:42},(_,i)=>{
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    return d;
  });
}

function eventsOn(d){
  const a=new Date(d);
  a.setHours(0,0,0,0);
  const b=new Date(a);
  b.setDate(b.getDate()+1);
  return events
    .filter(e=>new Date(e.start)<b&&new Date(e.end)>a)
    .sort((x,y)=>new Date(x.start)-new Date(y.start));
}

function render(){
  $('monthTitle').textContent=new Intl.DateTimeFormat('de-DE',{
    month:'long',year:'numeric'
  }).format(current);

  if(view==='month') renderMonth();
  else if(view==='week') renderWeek();
  else renderDay();
}

function eventHtml(e){
  const s=fmtTime(e.start);
  const en=fmtTime(e.end);
  return `<div class="event ${typeClass(e)}"><b>${esc(e.title)}</b><br>${s}–${en}</div>`;
}

function renderMonth(){
  const names=['Mo','Di','Mi','Do','Fr','Sa','So'];
  let h='<div class="month-grid">'+names.map(n=>`<div class="dow">${n}</div>`).join('');

  monthCells().forEach(d=>{
    const muted=d.getMonth()!==current.getMonth();
    h+=`<div class="day ${muted?'muted':''}">
      <div class="day-num">${d.getDate()}</div>
      ${eventsOn(d).map(eventHtml).join('')}
    </div>`;
  });

  h+='</div>';
  $('calendar').innerHTML=h;
}

function weekStart(d){
  const x=new Date(d);
  x.setDate(x.getDate()-((x.getDay()+6)%7));
  return x;
}

function renderWeek(){
  const ws=weekStart(current);
  const names=['Mo','Di','Mi','Do','Fr','Sa','So'];

  let h='<div class="week-grid"><div></div>'+names.map((n,i)=>{
    const d=new Date(ws);
    d.setDate(ws.getDate()+i);
    return `<div class="time-cell"><b>${n}</b><br>${labelDate(d)}</div>`;
  }).join('');

  for(let hour=6;hour<22;hour++){
    h+=`<div class="time-cell">${String(hour).padStart(2,'0')}:00</div>`;
    for(let i=0;i<7;i++){
      const d=new Date(ws);
      d.setDate(ws.getDate()+i);
      h+=`<div class="week-day">
        ${eventsOn(d).filter(e=>new Date(e.start).getHours()===hour).map(eventHtml).join('')}
      </div>`;
    }
  }

  $('calendar').innerHTML=h+'</div>';
}

function renderDay(){
  const d=current;
  let h='<div class="day-view">';

  for(let hour=0;hour<24;hour++){
    h+=`<div class="slot slot-label">${String(hour).padStart(2,'0')}:00</div>
      <div class="slot">
        ${eventsOn(d).filter(e=>new Date(e.start).getHours()===hour).map(eventHtml).join('')}
      </div>`;
  }

  $('calendar').innerHTML=h+'</div>';
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('loginMsg').classList.add('hidden');

  const {error}=await db.auth.signInWithPassword({
    email:$('email').value,
    password:$('password').value
  });

  if(error){
    $('loginMsg').textContent=error.message;
    $('loginMsg').classList.remove('hidden');
    return;
  }

  await session();
});

$('logoutBtn').onclick=async()=>{
  await db.auth.signOut();
  await session();
};

$('prevBtn').onclick=()=>{
  if(view==='month') current.setMonth(current.getMonth()-1);
  else current.setDate(current.getDate()-(view==='week'?7:1));
  load();
};

$('nextBtn').onclick=()=>{
  if(view==='month') current.setMonth(current.getMonth()+1);
  else current.setDate(current.getDate()+(view==='week'?7:1));
  load();
};

$('todayBtn').onclick=()=>{
  current=new Date();
  current.setHours(0,0,0,0);
  load();
};

document.querySelectorAll('.view-tabs button').forEach(b=>{
  b.onclick=()=>{
    view=b.dataset.view;
    document.querySelectorAll('.view-tabs button')
      .forEach(x=>x.classList.toggle('active',x===b));
    render();
  };
});

function openModal(){
  const now=new Date();
  const end=new Date(now.getTime()+3600000);

  $('startDate').value=berlinDateInput(now);
  $('endDate').value=berlinDateInput(end);

  $('startTime').value=new Intl.DateTimeFormat('de-DE',{
    hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Berlin'
  }).format(now);

  $('endTime').value=new Intl.DateTimeFormat('de-DE',{
    hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Berlin'
  }).format(end);

  $('eventType').value='private';
  $('eventTitle').value='';
  $('eventNotes').value='';
  $('formMsg').classList.add('hidden');
  $('modal').classList.remove('hidden');
}

$('addBtn').onclick=openModal;
$('closeBtn').onclick=$('cancelBtn').onclick=()=>$('modal').classList.add('hidden');

$('eventType').onchange=()=>{
  if($('eventType').value==='shift'){
    $('eventTitle').value='24h-Schicht';

    const d=new Date(
      `${$('startDate').value}T${$('startTime').value}:00`
    );

    d.setHours(d.getHours()+24);

    $('endDate').value=berlinDateInput(d);
    $('endTime').value=new Intl.DateTimeFormat('de-DE',{
      hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Berlin'
    }).format(d);
  }
};

$('eventForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('formMsg').classList.add('hidden');

  // Browser interprets these as local time. Supabase stores them as UTC.
  // This keeps Europe/Berlin DST handling correct in summer and winter.
  const start=new Date(`${$('startDate').value}T${$('startTime').value}:00`);
  const end=new Date(`${$('endDate').value}T${$('endTime').value}:00`);

  if(!(end>start)){
    $('formMsg').textContent='Das Ende muss nach dem Start liegen.';
    $('formMsg').classList.remove('hidden');
    return;
  }

  const {data:{user}}=await db.auth.getUser();

  const {error}=await db.from('calendar_manual_events').insert({
    title:$('eventTitle').value,
    event_type:$('eventType').value,
    start_at:start.toISOString(),
    end_at:end.toISOString(),
    notes:$('eventNotes').value||null,
    created_by:user.id
  });

  if(error){
    $('formMsg').textContent=error.message;
    $('formMsg').classList.remove('hidden');
    return;
  }

  $('modal').classList.add('hidden');
  await load();
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}

db.auth.onAuthStateChange(()=>session());
session();
