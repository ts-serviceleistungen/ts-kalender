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
  // Alle vorhandenen Kundentermine aus demselben System wie im Admin-Kalender.
  const reqRes=await db
    .from('requests')
    .select('id,service_type,status,requested_date,requested_time,care_options,first_name,last_name,make,model,vehicle_type,plate');

  if(reqRes.error) console.error('requests:',reqRes.error);

  const reqs=(reqRes.data||[])
    .filter(r=>r.requested_date && r.requested_time && String(r.status||'Neue Anfrage')!=='Abgelehnt')
    .map(r=>{
      const start=new Date(`${r.requested_date}T${String(r.requested_time).slice(0,8)}`);
      const hours=calculateDurationHours(r.service_type,r.care_options);
      const end=new Date(start.getTime()+hours*60*60*1000);
      const customer=`${r.first_name||''} ${r.last_name||''}`.trim();
      const object=r.service_type==='Gartenarbeiten'
        ? 'Gartenarbeiten'
        : ([r.make,r.model].filter(Boolean).join(' ') || r.vehicle_type || 'Fahrzeug');

      return {
        id:'r-'+r.id,
        source:'request',
        sourceId:r.id,
        start:start.toISOString(),
        end:end.toISOString(),
        title:serviceTitle(r.service_type),
        displayTitle:customer ? `${serviceTitle(r.service_type)} – ${customer}` : serviceTitle(r.service_type),
        subtitle:object,
        event_type:serviceEventType(r.service_type),
        status:r.status
      };
    });

  // Persönliche Termine / Schichten aus dem bestehenden persönlichen Kalender.
  const personalRes=await db
    .from('personal_calendar_events')
    .select('id,title,event_type,start_time,end_time')
    .order('start_time',{ascending:true});

  if(personalRes.error) console.error('personal_calendar_events:',personalRes.error);

  const personal=(personalRes.data||[]).map(x=>{
    const t=String(x.event_type||'').toLowerCase();
    let type='other';

    if(t.includes('24') || t.includes('schicht')) type='shift';
    else if(t.includes('garten')) type='garden';
    else if(t.includes('fahrzeug')) type='vehicle';
    else if(t.includes('privat') || t.includes('sonstig')) type='private';

    return {
      id:'p-'+x.id,
      source:'personal',
      sourceId:x.id,
      start:x.start_time,
      end:x.end_time,
      title:x.title,
      event_type:type
    };
  });

  events=[...reqs,...personal];
  hideLoadMessage();
  render();
}

function calculateDurationHours(serviceType,careOptions){
  const s=String(serviceType||'').toLowerCase();
  const options=Array.isArray(careOptions)
    ? careOptions.map(x=>String(x).toLowerCase())
    : [];

  if(s.includes('garten')){
    // Für die persönliche Kalenderansicht nutzen wir die im bestehenden
    // System hinterlegte Standarddauer. Die Buchung selbst bleibt unverändert.
    return Math.max(4, options.length*4);
  }

  if(s.includes('fahrzeug')){
    let total=0;
    options.forEach(o=>{
      if(o.includes('außenreinigung')) total+=2;
      else if(o.includes('innenraumreinigung')) total+=4;
      else if(o.includes('polsterreinigung')) total+=4;
      else if(o.includes('komplettaufbereitung')) total+=8;
      else if(o.includes('politur')) total+=8;
      else if(o.includes('lackversiegelung')) total+=8;
    });
    return total || 2;
  }

  return 2;
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
  const deleteButton=e.source==='personal'
    ? `<button type="button" class="event-delete" data-delete-personal="${esc(e.sourceId)}" title="Termin löschen" aria-label="Termin löschen">×</button>`
    : '';
  const subtitle=e.subtitle ? `<small>${esc(e.subtitle)}</small>` : '';
  return `<div class="event ${typeClass(e)}" data-open-event="${esc(e.id)}" role="button" tabindex="0">
    <div class="event-content"><b>${esc(e.displayTitle||e.title)}</b>${subtitle}<br>${s}–${en}</div>
    ${deleteButton}
  </div>`;
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

async function deletePersonalEvent(id){
  const event=events.find(e=>e.source==='personal' && e.sourceId===id);
  if(!event) return;

  if(!confirm(`Soll der Termin "${event.title||'Termin'}" wirklich gelöscht werden?`)) return;

  const {error}=await db
    .from('personal_calendar_events')
    .delete()
    .eq('id',id);

  if(error){
    alert('Termin konnte nicht gelöscht werden:\n\n'+error.message);
    return;
  }

  await load();
}

function openEventDetails(eventId){
  const event=events.find(x=>x.id===eventId);
  if(!event) return;

  const isPersonal=event.source==='personal';
  const existing=$('eventDetailModal');
  if(existing) existing.remove();

  const modal=document.createElement('div');
  modal.id='eventDetailModal';
  modal.className='modal';
  modal.innerHTML=`
    <div class="modal-card event-detail-card">
      <div class="modal-head">
        <h2>${esc(event.event_type==='shift'?'24h-Schicht':(event.displayTitle||event.title||'Termin'))}</h2>
        <button type="button" id="detailClose">×</button>
      </div>

      <div class="notice">
        <b>${esc(event.event_type==='shift'?'24h-Schicht':(event.title||'Termin'))}</b><br>
        ${esc(fmtDate(event.start))} · ${esc(fmtTime(event.start))}
        – ${esc(fmtDate(event.end))} · ${esc(fmtTime(event.end))}
      </div>

      ${event.subtitle ? `<p><b>Details:</b><br>${esc(event.subtitle)}</p>` : ''}
      ${event.status ? `<p><b>Status:</b> ${esc(event.status)}</p>` : ''}

      <div class="form-actions">
        ${isPersonal ? `<button type="button" id="detailDelete">Termin löschen</button>` : ''}
        <button type="button" class="primary" id="detailClose2">Schließen</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const close=()=>modal.remove();
  $('detailClose').onclick=close;
  $('detailClose2').onclick=close;

  if(isPersonal){
    $('detailDelete').onclick=async()=>{
      close();
      await deletePersonalEvent(event.sourceId);
    };
  }
}

$('calendar').addEventListener('click',async e=>{
  const button=e.target.closest('[data-delete-personal]');
  if(button){
    e.stopPropagation();
    await deletePersonalEvent(button.dataset.deletePersonal);
    return;
  }

  const card=e.target.closest('[data-open-event]');
  if(card) openEventDetails(card.dataset.openEvent);
});

$('calendar').addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const card=e.target.closest('[data-open-event]');
  if(!card) return;
  e.preventDefault();
  openEventDetails(card.dataset.openEvent);
});

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

  // Persönliche Termine werden in derselben Tabelle gespeichert,
  // aus der der Kalender seine persönlichen Termine lädt.
  const {error}=await db.from('personal_calendar_events').insert({
    title:$('eventTitle').value,
    event_type:$('eventType').value,
    start_time:start.toISOString(),
    end_time:end.toISOString()
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
