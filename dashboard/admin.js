(function(){
  "use strict";
  const SBCFG = window.SUPABASE_CONFIG;
  const SB = (SBCFG && window.supabase) ? window.supabase.createClient(SBCFG.url, SBCFG.anonKey, { auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true} }) : null;
  const $ = (s,r=document)=>r.querySelector(s);
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const num = v => { const n=Number(v); return Number.isFinite(n)?n:0; };

  let session=null, profile=null, isSuper=false;
  let locations=[], currentLocId=null, view='location', tab='goals';

  // ------------------------------------------------------ auth / login
  let loginTab='password';
  function showLogin(v){ $("#loginOverlay").hidden=!v; $("#wrap").hidden=v; }
  function loginMsg(t,bad){ const el=$("#loginMsg"); el.textContent=t||''; el.style.color=bad?'var(--bad)':'var(--good)'; }
  function wireLogin(){
    $("#loginTabs").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return; loginTab=b.dataset.tab;
      [...$("#loginTabs").children].forEach(x=>x.classList.toggle("on",x===b));
      $("#loginPassword").style.display=loginTab==='password'?'':'none';
      $("#loginSubmit").textContent=loginTab==='password'?'Sign in':'Send magic link'; loginMsg(''); });
    $("#loginForm").addEventListener("submit",async e=>{ e.preventDefault();
      const email=$("#loginEmail").value.trim(), pw=$("#loginPassword").value;
      if(!email){ loginMsg('Enter your email',true); return; }
      $("#loginSubmit").disabled=true;
      try{ if(loginTab==='password'){ const {error}=await SB.auth.signInWithPassword({email,password:pw}); if(error) throw error; }
           else { const {error}=await SB.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href}}); if(error) throw error; loginMsg('Check your email for the sign-in link.'); } }
      catch(err){ loginMsg(err.message||'Sign-in failed',true); } finally{ $("#loginSubmit").disabled=false; }
    });
    $("#signout").addEventListener("click",async()=>{ await SB.auth.signOut(); });
    $("#theme").addEventListener("click",()=>{ const c=document.documentElement.getAttribute("data-theme"); const d=window.matchMedia("(prefers-color-scheme: dark)").matches; document.documentElement.setAttribute("data-theme", c?(c==="dark"?"light":"dark"):(d?"light":"dark")); });
  }

  async function afterLogin(){
    try{ const {data}=await SB.from('profiles').select('role,full_name,email').eq('id',session.user.id).single(); profile=data; }catch(_){ profile=null; }
    isSuper = profile && profile.role==='super_admin';
    $("#roleBadge").style.display=''; $("#roleBadge").textContent = isSuper?'Super Admin':'Franchisee';
    $("#whoami").textContent = (profile&&(profile.full_name||profile.email))||session.user.email;
    $("#signout").style.display='';
    await loadLocations();
    if(!currentLocId && locations.length) currentLocId=locations[0].id;
    view='location'; render();
  }
  async function loadLocations(){
    try{ const {data}=await SB.from('locations').select('*').order('name'); locations=data||[]; }catch(_){ locations=[]; }
  }

  // ------------------------------------------------------ sidebar
  function renderSide(){
    const side=$("#side"); let h='';
    if(isSuper) h+=`<button class="addbtn" data-action="addLocation">+ Add location</button>`;
    h+=`<h3>Locations</h3>`;
    h+= locations.length ? locations.map(l=>`<button class="locbtn ${view==='location'&&l.id===currentLocId?'on':''}" data-action="pickLoc" data-id="${l.id}">
        <span>${esc(l.name)}</span><span class="tag">${l.is_active?'':'inactive'}</span></button>`).join('')
      : `<div class="empty">No locations yet.</div>`;
    if(isSuper) h+=`<h3>Administration</h3><button class="locbtn ${view==='users'?'on':''}" data-action="usersView">Users &amp; access</button>`;
    side.innerHTML=h;
  }

  // ------------------------------------------------------ content router
  function render(){ renderSide(); if(view==='users') renderUsers(); else renderLocation(); }

  async function renderLocation(){
    const c=$("#content");
    if(!currentLocId){ c.innerHTML=`<div class="panel"><div class="empty">Select or add a location to begin.</div></div>`; return; }
    const loc=locations.find(l=>l.id===currentLocId)||{};
    const tabs=`<div class="tabs" id="locTabs">
      ${isSuper?`<button data-tab="conn" class="${tab==='conn'?'on':''}">1 · Connect</button>`:''}
      <button data-tab="goals" class="${tab==='goals'?'on':''}">${isSuper?'2 · ':''}Goals</button>
      <button data-tab="techs" class="${tab==='techs'?'on':''}">${isSuper?'3 · ':''}Technicians</button></div>`;
    const connected = !!loc.st_tenant_id;
    c.innerHTML=`<div class="panel"><h2>${esc(loc.name||'Location')}</h2>
      <div class="desc">${esc(loc.region||'')}${connected?` · ServiceTitan tenant ${esc(loc.st_tenant_id)}`:' · ServiceTitan not connected'}${isSuper?' &nbsp;·&nbsp; Set it up in three steps: <b>1</b> connect, <b>2</b> goals, <b>3</b> technicians.':''}</div>
      ${tabs}<div id="tabBody"></div></div>`;
    $("#locTabs").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return; tab=b.dataset.tab; renderLocation(); });
    if(tab==='goals') renderGoals(loc); else if(tab==='techs') renderTechs(loc); else if(isSuper) renderConn(loc); else { tab='goals'; renderGoals(loc); }
  }

  // ------------------------------------------------------ Goals tab
  async function renderGoals(loc){
    const body=$("#tabBody"); body.innerHTML=`<div class="empty">Loading…</div>`;
    let g={}; try{ const {data}=await SB.from('location_goals').select('*').eq('location_id',loc.id).maybeSingle(); g=data||{}; }catch(_){}
    const per=(id,v)=>`<select id="${id}"><option value="monthly" ${v!=='annual'?'selected':''}>Monthly</option><option value="annual" ${v==='annual'?'selected':''}>Annual</option></select>`;
    body.innerHTML=`
      <p class="hint" style="margin:0 0 16px">Step 2 — set the <b>targets</b> below. The matching <b>actuals</b> (revenue, close rate, memberships sold, review counts) are pulled automatically from ServiceTitan and GoHighLevel — you don't type them here.</p>
      <div class="grid2">
        <div class="field"><label>Revenue target ($)</label><input id="g_rev" type="number" value="${g.revenue_target??0}"><span class="hint">Actual revenue is pulled from ServiceTitan.</span></div>
        <div class="field"><label>Revenue goal period</label>${per('g_revper',g.revenue_period)}<span class="hint">Is this a monthly or annual target?</span></div>
        <div class="field"><label>Close-rate target (%)</label><input id="g_close" type="number" step="1" value="${g.close_rate_target!=null?Math.round(g.close_rate_target*100):65}"><span class="hint">Actual close rate is computed from ServiceTitan opportunities.</span></div>
        <div class="field"><label>Google reviews target</label><input id="g_revwt" type="number" value="${g.reviews_target??0}"><span class="hint">Rating &amp; review counts pull from GoHighLevel (Google).</span></div>
        <div class="field"><label>Reviews goal period</label>${per('g_revwper',g.reviews_period)}<span class="hint">e.g. new reviews per month.</span></div>
        <div class="field"></div>
        <div class="field"><label>HomeGuard memberships target</label><input id="g_hg" type="number" value="${g.homeguard_target??0}"><span class="hint">Sold count pulls from ServiceTitan.</span></div>
        <div class="field"><label>Power Partner memberships target</label><input id="g_pp" type="number" value="${g.power_partner_target??0}"><span class="hint">Sold count pulls from ServiceTitan.</span></div>
        <div class="field"><label>Memberships goal period</label>${per('g_memper',g.memberships_period)}<span class="hint">Membership targets are usually annual.</span></div>
      </div>
      <div class="row-actions"><button class="btn" data-action="saveGoals">Save goals</button><span class="savemsg" id="goalsMsg"></span></div>`;
  }
  async function saveGoals(){
    const rec={ location_id:currentLocId,
      revenue_target:num($("#g_rev").value), revenue_period:$("#g_revper").value,
      close_rate_target:num($("#g_close").value)/100,
      reviews_target:num($("#g_revwt").value), reviews_period:$("#g_revwper").value,
      homeguard_target:num($("#g_hg").value), power_partner_target:num($("#g_pp").value),
      memberships_period:$("#g_memper").value, updated_at:new Date().toISOString() };
    const msg=$("#goalsMsg"); msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    const {error}=await SB.from('location_goals').upsert(rec,{onConflict:'location_id'});
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; } else { msg.textContent='Saved ✓'; msg.style.color='var(--good)'; }
  }

  // ------------------------------------------------------ Technicians tab
  async function renderTechs(loc){
    const body=$("#tabBody"); body.innerHTML=`<div class="empty">Loading…</div>`;
    let rows=[]; try{ const {data}=await SB.from('technician_meta').select('*').eq('location_id',loc.id).order('name'); rows=data||[]; }catch(_){}
    const discOpts=v=>['','D','I','S','C'].map(o=>`<option value="${o}" ${o===(v||'')?'selected':''}>${o||'—'}</option>`).join('');
    const tr=r=>`<tr data-id="${r.id||''}">
      <td><input data-f="name" value="${esc(r.name||'')}" placeholder="Full name"></td>
      <td><input data-f="st_tech_id" value="${esc(r.st_tech_id||'')}" placeholder="ST id (optional)"></td>
      <td><input data-f="title" value="${esc(r.title||'')}" placeholder="Title"></td>
      <td><select data-f="disc">${discOpts(r.disc)}</select></td>
      <td><input data-f="photo_url" value="${esc(r.photo_url||'')}" placeholder="Photo URL (optional)"></td>
      <td style="white-space:nowrap"><button class="btn" data-action="saveTech">Save</button>${r.id?` <button class="btn danger" data-action="delTech">✕</button>`:''}</td></tr>`;
    body.innerHTML=`<p class="hint" style="margin:0 0 14px">Step 3 — once ServiceTitan is connected, your technicians are pulled in automatically with their photos and metrics. Here you add only what ServiceTitan doesn't store: <b>Title</b>, <b>DISC letter</b>, and a photo <i>only if</i> ServiceTitan has none. Match to ServiceTitan by ST id when set, otherwise by exact name.</p>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Name</th><th>ST id</th><th>Title</th><th>DISC</th><th>Photo URL</th><th></th></tr></thead>
      <tbody id="techBody">${rows.map(tr).join('')}${tr({})}</tbody></table></div>
      <div class="savemsg" id="techMsg" style="margin-top:10px"></div>`;
  }
  function techRowData(trEl){
    const g=f=>{ const el=trEl.querySelector(`[data-f="${f}"]`); return el?el.value.trim():''; };
    return { id:trEl.dataset.id||null, location_id:currentLocId, name:g('name')||null, st_tech_id:g('st_tech_id')||null,
             title:g('title')||null, disc:g('disc')||null, photo_url:g('photo_url')||null, updated_at:new Date().toISOString() };
  }
  async function saveTech(trEl){
    const rec=techRowData(trEl); const msg=$("#techMsg"); msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    if(!rec.name && !rec.st_tech_id){ msg.textContent='Enter a name or ST id'; msg.style.color='var(--bad)'; return; }
    let error;
    if(rec.id){ ({error}=await SB.from('technician_meta').update(rec).eq('id',rec.id)); }
    else { const {id,...ins}=rec; ({error}=await SB.from('technician_meta').insert(ins)); }
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; } else { msg.textContent='Saved ✓'; msg.style.color='var(--good)'; renderTechs(locations.find(l=>l.id===currentLocId)); }
  }
  async function delTech(trEl){
    if(!trEl.dataset.id) return; const msg=$("#techMsg");
    const {error}=await SB.from('technician_meta').delete().eq('id',trEl.dataset.id);
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; } else renderTechs(locations.find(l=>l.id===currentLocId));
  }

  // ------------------------------------------------------ Connection tab (super)
  function renderConn(loc){
    const body=$("#tabBody");
    body.innerHTML=`
      <p class="hint" style="margin:0 0 16px">Step 1 — set up the location, then connect <b>ServiceTitan</b> (revenue, sales, technicians &amp; memberships) and <b>GoHighLevel</b> (Google reviews). After ServiceTitan is connected, the technicians show up in step 3.</p>
      <div class="grid2">
        <div class="field"><label>Location name</label><input id="c_name" value="${esc(loc.name||'')}"><span class="hint">The franchise location, e.g. "Nassau County".</span></div>
        <div class="field"><label>Code</label><input id="c_code" value="${esc(loc.code||'')}"><span class="hint">Short tag, e.g. "NC". Optional.</span></div>
        <div class="field"><label>Region</label><input id="c_region" value="${esc(loc.region||'')}"><span class="hint">e.g. "Long Island, NY". Optional.</span></div>
        <div class="field"><label>State</label><input id="c_state" value="${esc(loc.state||'')}"><span class="hint">Two-letter state. Optional.</span></div>
        <div class="field"><label>ServiceTitan tenant id</label><input id="c_tenant" value="${esc(loc.st_tenant_id||'')}"><span class="hint">The numeric Tenant ID from ServiceTitan.</span></div>
        <div class="field"><label>ServiceTitan environment</label><select id="c_env"><option value="production" ${loc.st_env!=='integration'?'selected':''}>production</option><option value="integration" ${loc.st_env==='integration'?'selected':''}>integration</option></select><span class="hint">Use "production" for live data; "integration" is ServiceTitan's test sandbox.</span></div>
        <div class="field"><label>GoHighLevel location id</label><input id="c_ghl" value="${esc(loc.ghl_location_id||'')}"><span class="hint">The location's GoHighLevel sub-account id — used to pull its Google review rating &amp; count. (A Google Analytics property ID can't provide reviews.)</span></div>
        <div class="field"><label>Active</label><select id="c_active"><option value="true" ${loc.is_active?'selected':''}>Yes</option><option value="false" ${!loc.is_active?'selected':''}>No</option></select><span class="hint">"No" hides the location without deleting it.</span></div>
      </div>
      <div class="row-actions"><button class="btn" data-action="saveLoc">Save location</button><span class="savemsg" id="locMsg"></span></div>
      <hr style="border:0;border-top:1px solid var(--border);margin:22px 0">
      <h2 style="font-size:16px;margin:0 0 4px">ServiceTitan credentials</h2>
      <p class="hint">Client id + secret are stored write-only — they're never shown in the browser again. Leave blank to keep the current secret.</p>
      <div class="grid2" style="margin-top:12px">
        <div class="field"><label>Client id</label><input id="c_cid" placeholder="cid.xxxxx"></div>
        <div class="field"><label>Client secret</label><input id="c_secret" type="password" placeholder="cs1.xxxxx"></div>
      </div>
      <div class="row-actions"><button class="btn" data-action="saveCreds">Save credentials</button><span class="savemsg" id="credMsg"></span></div>`;
  }
  async function saveLoc(){
    const rec={ name:$("#c_name").value.trim(), code:$("#c_code").value.trim()||null, region:$("#c_region").value.trim()||null,
      state:$("#c_state").value.trim()||null, st_tenant_id:$("#c_tenant").value.trim()||null, st_env:$("#c_env").value,
      ghl_location_id:$("#c_ghl").value.trim()||null, is_active:$("#c_active").value==='true' };
    const msg=$("#locMsg"); msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    const {error}=await SB.from('locations').update(rec).eq('id',currentLocId);
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; return; }
    msg.textContent='Saved ✓'; msg.style.color='var(--good)'; await loadLocations(); renderSide();
    const loc=locations.find(l=>l.id===currentLocId); $("#content").querySelector('h2').textContent=loc.name;
  }
  async function saveCreds(){
    const cid=$("#c_cid").value.trim(), secret=$("#c_secret").value.trim();
    const msg=$("#credMsg"); if(!cid && !secret){ msg.textContent='Enter a client id and secret'; msg.style.color='var(--bad)'; return; }
    msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    const {error}=await SB.rpc('save_location_credentials',{p_location_id:currentLocId,p_client_id:cid,p_client_secret:secret});
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; } else { msg.textContent='Saved ✓'; msg.style.color='var(--good)'; $("#c_cid").value=''; $("#c_secret").value=''; }
  }
  async function addLocation(){
    const name=prompt('New location name (e.g. Suffolk County):'); if(!name) return;
    const {data,error}=await SB.from('locations').insert({name:name.trim()}).select('id').single();
    if(error){ alert(error.message); return; }
    await loadLocations(); currentLocId=data.id; view='location'; tab='conn'; render();
  }

  // ------------------------------------------------------ Users & access (super)
  async function renderUsers(){
    const c=$("#content"); c.innerHTML=`<div class="panel"><h2>Users &amp; access</h2>
      <div class="desc">Create a login for a franchise owner, then set their role and the locations they can see. Super-admins see every location automatically.</div>
      <div class="grid2" style="max-width:760px">
        <div class="field"><label>New user email</label><input id="u_email" type="email" placeholder="owner@company.com"></div>
        <div class="field"><label>Temporary password</label><input id="u_pw" placeholder="at least 8 characters"><span class="hint">Share it with them; they can change it later.</span></div>
        <div class="field"><label>Role</label><select id="u_role"><option value="franchisee">Franchisee</option><option value="super_admin">Super Admin</option></select></div>
        <div class="field"><label>Give access to location</label><select id="u_loc"><option value="">— choose a location —</option>${locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select><span class="hint">Franchisees need at least one location. Super-admins get all.</span></div>
      </div>
      <div class="row-actions"><button class="btn" data-action="createUser">Create user</button><span class="savemsg" id="uNewMsg"></span></div>
      <hr style="border:0;border-top:1px solid var(--border);margin:22px 0">
      <div id="usersBody"><div class="empty">Loading…</div></div></div>`;
    let profs=[],access=[]; try{ ({data:profs}=await SB.from('profiles').select('*').order('email')); }catch(_){}
    try{ ({data:access}=await SB.from('location_access').select('*')); }catch(_){}
    profs=profs||[]; access=access||[];
    const accByUser={}; access.forEach(a=>{ (accByUser[a.user_id]=accByUser[a.user_id]||new Set()).add(a.location_id); });
    const locOpts = locations.map(l=>l);
    const row=p=>{
      const set=accByUser[p.id]||new Set();
      const chips = locOpts.map(l=>`<label class="pill" style="cursor:pointer"><input class="chk" type="checkbox" data-action="toggleAccess" data-user="${p.id}" data-loc="${l.id}" ${set.has(l.id)?'checked':''}> ${esc(l.name)}</label>`).join(' ');
      return `<tr>
        <td><b>${esc(p.email||'')}</b><div class="hint">${esc(p.full_name||'')}</div></td>
        <td><select data-action="setRole" data-user="${p.id}"><option value="franchisee" ${p.role==='franchisee'?'selected':''}>Franchisee</option><option value="super_admin" ${p.role==='super_admin'?'selected':''}>Super Admin</option></select></td>
        <td>${p.role==='super_admin'?'<span class="hint">all locations</span>':(chips||'<span class="hint">no locations yet</span>')}</td></tr>`;
    };
    $("#usersBody").innerHTML=`<div class="tbl-scroll"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Location access</th></tr></thead><tbody>${profs.map(row).join('')}</tbody></table></div><div class="savemsg" id="usersMsg" style="margin-top:10px"></div>`;
  }
  async function setRole(sel){ const msg=$("#usersMsg"); msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    const {error}=await SB.from('profiles').update({role:sel.value}).eq('id',sel.dataset.user);
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; } else { msg.textContent='Saved ✓'; msg.style.color='var(--good)'; renderUsers(); } }
  async function toggleAccess(chk){ const msg=$("#usersMsg"); msg.textContent='Saving…'; msg.style.color='var(--ink-3)';
    const user=chk.dataset.user, loc=chk.dataset.loc; let error;
    if(chk.checked){ ({error}=await SB.from('location_access').insert({user_id:user,location_id:loc})); }
    else { ({error}=await SB.from('location_access').delete().eq('user_id',user).eq('location_id',loc)); }
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; chk.checked=!chk.checked; } else { msg.textContent='Saved ✓'; msg.style.color='var(--good)'; } }
  async function createUser(){
    const email=($("#u_email").value||'').trim(), pw=$("#u_pw").value||'', role=$("#u_role").value, loc=$("#u_loc").value||null;
    const msg=$("#uNewMsg");
    if(!email || pw.length<8){ msg.textContent='Enter an email and a password of at least 8 characters'; msg.style.color='var(--bad)'; return; }
    if(role==='franchisee' && !loc){ msg.textContent='Pick a location for this franchisee'; msg.style.color='var(--bad)'; return; }
    msg.textContent='Creating…'; msg.style.color='var(--ink-3)';
    const {error}=await SB.rpc('admin_create_user',{p_email:email,p_password:pw,p_role:role,p_location_id:loc});
    if(error){ msg.textContent=error.message; msg.style.color='var(--bad)'; }
    else { msg.textContent='User created ✓'; msg.style.color='var(--good)'; $("#u_email").value=''; $("#u_pw").value=''; renderUsers(); }
  }

  // ------------------------------------------------------ event delegation
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-action]'); if(!b) return;
    const a=b.dataset.action;
    if(a==='pickLoc'){ currentLocId=b.dataset.id; view='location'; render(); }
    else if(a==='usersView'){ view='users'; render(); }
    else if(a==='addLocation') addLocation();
    else if(a==='saveGoals') saveGoals();
    else if(a==='saveTech') saveTech(b.closest('tr'));
    else if(a==='delTech') delTech(b.closest('tr'));
    else if(a==='saveLoc') saveLoc();
    else if(a==='saveCreds') saveCreds();
    else if(a==='createUser') createUser();
  });
  document.addEventListener('change', e=>{
    const b=e.target.closest('[data-action]'); if(!b) return;
    if(b.dataset.action==='setRole') setRole(b);
    else if(b.dataset.action==='toggleAccess') toggleAccess(b);
  });

  // ------------------------------------------------------ boot
  async function boot(){
    if(!SB){ document.body.innerHTML='<p style="padding:40px;font-family:sans-serif">Supabase is not configured (dashboard/supabase-config.js).</p>'; return; }
    wireLogin();
    SB.auth.onAuthStateChange(async (_e,s)=>{ session=s; if(s){ showLogin(false); await afterLogin(); } else { showLogin(true); } });
    const {data}=await SB.auth.getSession(); session=data.session;
    if(session){ showLogin(false); await afterLogin(); } else showLogin(true);
  }
  boot();
})();
