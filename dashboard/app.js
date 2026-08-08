(function(){
  "use strict";
  /* =====================================================================
     PatchitUP — Location Technician Dashboard (front-end app)

     Three data seams:
       1. KPIs  — LIVE ServiceTitan via /api/*  (falls back to in-page SAMPLE)
       2. Admin — Supabase (goals, review counts, tech title/DISC) per location
       3. Auth  — Supabase Auth (magic link or password); "view sample" bypass

     Signed in: locations + admin overlay come from Supabase (RLS-scoped to what
     the user may see); KPI numbers come from ServiceTitan when connected, else
     sample. Signed out: sample-only demo.
     ===================================================================== */
  const CFG = (typeof window!=='undefined' && window.PIU_CONFIG) || {};
  const SBCFG = (typeof window!=='undefined' && window.SUPABASE_CONFIG) || null;
  const SB = (SBCFG && window.supabase)
    ? window.supabase.createClient(SBCFG.url, SBCFG.anonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } })
    : null;

  // ===================== SAMPLE (demo) ==================================
  const SAMPLE_TECHS = [
    {id:'s1', name:"Marcus Reyes",  title:"Lead Technician",   disc:"D", revenue:48200, sales:41500, conv:0.68, oja:642, opps:75, converted:51, hours:168, salesHr:247},
    {id:'s2', name:"Danielle Cho",  title:"Senior Technician", disc:"I", revenue:43900, sales:39800, conv:0.64, oja:585, opps:75, converted:48, hours:171, salesHr:233},
    {id:'s3', name:"Andre Willis",  title:"Lead Technician",   disc:"D", revenue:41250, sales:36400, conv:0.66, oja:604, opps:68, converted:45, hours:160, salesHr:228},
    {id:'s4', name:"Sofia Marino",  title:"Technician",        disc:"C", revenue:37800, sales:34100, conv:0.71, oja:559, opps:68, converted:48, hours:166, salesHr:205},
    {id:'s5', name:"Priya Nair",    title:"Technician",        disc:"I", revenue:34600, sales:31900, conv:0.62, oja:548, opps:63, converted:39, hours:158, salesHr:202},
    {id:'s6', name:"Tyrone Jackson",title:"Technician",        disc:"S", revenue:31200, sales:28400, conv:0.59, oja:520, opps:60, converted:35, hours:162, salesHr:175},
    {id:'s7', name:"Luis Fernández",title:"Technician",        disc:"C", revenue:27950, sales:25100, conv:0.57, oja:498, opps:56, converted:32, hours:150, salesHr:167},
    {id:'s8', name:"Kevin O'Brien", title:"Apprentice",        disc:"S", revenue:19400, sales:17200, conv:0.51, oja:441, opps:44, converted:22, hours:139, salesHr:124},
  ];
  const SAMPLE_GOALS = { revenue:{actual:312400,target:350000}, close:{actual:0.63,target:0.65},
    reviews:{actual:47,target:60,rating:4.8,total:326},
    homeguard:{actual:118,target:150}, powerPartner:{actual:27,target:40},
    cancellations:11, opportunities:509, oppJobAvg:551 };

  // ===================== helpers ========================================
  const $ = (s,r=document)=>r.querySelector(s);
  const usd  = n => "$"+Math.round(n||0).toLocaleString("en-US");
  const usdK = n => n>=1000 ? "$"+(n/1000).toFixed(n>=10000?0:1)+"k" : "$"+Math.round(n||0);
  const pct  = n => Math.round((n||0)*100)+"%";
  const initials = name => (name||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const ordinal = n => n+(["th","st","nd","rd"][(n%100>10&&n%100<14)?0:(n%10<4?n%10:0)]);
  const medals = ["🥇","🥈","🥉"];
  const clampPct = r => Math.max(0, Math.min(100, Math.round((r||0)*100)));
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const DISC = { D:{word:"Dominance",v:"var(--disc-d)"}, I:{word:"Influence",v:"var(--disc-i)"},
                 S:{word:"Steadiness",v:"var(--disc-s)"}, C:{word:"Conscientious",v:"var(--disc-c)"} };
  const LB_METRICS = [ {key:"revenue",label:"Revenue",fmt:usd}, {key:"sales",label:"Sales",fmt:usd},
                       {key:"conv",label:"Conversion",fmt:pct}, {key:"oja",label:"Opp Job Avg",fmt:usd} ];
  const MASCOT = "assets/patchitup-mascot.png";

  const iso = d => d.toISOString().slice(0,10);
  function rangeBounds(key){
    const now=new Date(), y=now.getUTCFullYear(), m=now.getUTCMonth(), d=now.getUTCDate();
    const to=iso(now); let from;
    if(key==='week'){ const dow=(now.getUTCDay()+6)%7; from=iso(new Date(Date.UTC(y,m,d-dow))); }
    else if(key==='quarter'){ from=iso(new Date(Date.UTC(y,Math.floor(m/3)*3,1))); }
    else if(key==='ytd'){ from=iso(new Date(Date.UTC(y,0,1))); }
    else { from=iso(new Date(Date.UTC(y,m,1))); }
    return [from,to];
  }
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function periodLabel(key){ const now=new Date(), y=now.getUTCFullYear();
    if(key==='week') return "This Week"; if(key==='quarter') return "Q"+(Math.floor(now.getUTCMonth()/3)+1)+" "+y;
    if(key==='ytd') return y+" YTD"; return MONTHS[now.getUTCMonth()]+" "+y; }

  // ===================== state ==========================================
  let techs=[], teamAvg={}, location={}, range='month';
  let mode='demo';                 // 'demo' | 'supabase'
  let session=null, profile=null;
  let supaLocations=[], currentLocationId=null;
  const overlays={};               // locationId -> { goals, techMeta[] }

  // ===================== KPI Adapter (ServiceTitan / sample) ============
  const Adapter = {
    live:false, apiBase:'', techDaily:new Map(),
    async init(){
      this.apiBase = String(CFG.apiBase!=null?CFG.apiBase:'').replace(/\/$/,'');
      try{ const h=await fetch(this.apiBase+'/api/health',{cache:'no-store'});
        if(h.ok){ const j=await h.json().catch(()=>null); if(j&&j.ok) this.live=true; } }catch(_){}
      if(this.live) await this.preload();
    },
    async preload(){
      try{ const locs=await (await fetch(this.apiBase+'/api/locations',{cache:'no-store'})).json();
        if(Array.isArray(locs)) await Promise.all(locs.map(async l=>{
          try{ const td=await (await fetch(`${this.apiBase}/api/locations/${l.tenant}/tech-daily`)).json();
            if(td&&td.daily&&Object.keys(td.daily).length) this.techDaily.set(String(l.tenant),td); }catch(_){}
        })); }catch(_){}
    },
  };
  function computeTechsLive(stTenant){
    const td=Adapter.techDaily.get(String(stTenant)); if(!td) return null;
    const [from,to]=rangeBounds(range); const tot={};
    for(const day in td.daily){ if(day<from||day>to) continue; const m=td.daily[day];
      for(const id in m){ const row=m[id]; const s=tot[id]||(tot[id]=[0,0,0,0,0,0,0,0]); for(let i=0;i<8;i++) s[i]+=row[i]||0; } }
    const rows=Object.keys(tot).map(id=>{ const s=tot[id]; const opps=s[0],converted=s[1],sales=s[3],hours=s[5],revenue=s[7];
      const rn=(td.roster[id]&&td.roster[id].name)||('Technician '+id);
      return { id, name:rn, photo:(td.roster[id]&&td.roster[id].photo)||null, title:'Technician', disc:null,
        revenue, sales, conv:opps?converted/opps:0, oja:opps?revenue/opps:0, opps, converted, hours:Math.round(hours), salesHr:hours?sales/hours:0 };
    }).filter(t=>t.id!=='unassigned' && (t.opps>0||t.revenue>0||t.sales>0)).sort((a,b)=>b.revenue-a.revenue);
    return rows.length?rows:null;
  }

  function computeTeamAvg(){ const n=techs.length||1; const sum=k=>techs.reduce((a,t)=>a+(t[k]||0),0);
    teamAvg={ revenue:sum('revenue')/n, sales:sum('sales')/n, conv:sum('conv')/n, oja:sum('oja')/n }; }
  function rankOf(tech,key){ return [...techs].sort((a,b)=>b[key]-a[key]).indexOf(tech)+1; }

  // ===================== data assembly ==================================
  function applyOverlayMeta(base, ov){
    const byId={}, byName={};
    (ov.techMeta||[]).forEach(m=>{ if(m.st_tech_id) byId[m.st_tech_id]=m; if(m.name) byName[m.name.toLowerCase()]=m; });
    return base.map(t=>{ const m=(t.id&&byId[t.id])||byName[(t.name||'').toLowerCase()]||{};
      return {...t, title:m.title||t.title, disc:m.disc||t.disc, photo:m.photo_url||t.photo, _hidden:(m.display===false)}; })
      .filter(t=>!t._hidden);   // technicians unticked in admin are hidden from the board
  }
  function buildLocation(name, ov, live){
    const g = ov && ov.goals;
    const totRev=techs.reduce((a,t)=>a+t.revenue,0), totOpps=techs.reduce((a,t)=>a+t.opps,0), totConv=techs.reduce((a,t)=>a+t.converted,0);
    const closeActual = totOpps?totConv/totOpps:0;
    // In LIVE mode, "sold"/review actuals come from ServiceTitan / GoHighLevel.
    // Until those are wired, show N/A (null) rather than a fabricated number.
    location = { name, period:periodLabel(range),
      goals:{
        revenue:{ actual: live?totRev:SAMPLE_GOALS.revenue.actual, target: g?Number(g.revenue_target):SAMPLE_GOALS.revenue.target, period: g?g.revenue_period:'monthly' },
        close:{ actual: live?closeActual:SAMPLE_GOALS.close.actual, target: g?Number(g.close_rate_target):SAMPLE_GOALS.close.target },
        homeguard:{ actual: live?null:SAMPLE_GOALS.homeguard.actual, target: g?Number(g.homeguard_target):SAMPLE_GOALS.homeguard.target },
        powerPartner:{ actual: live?null:SAMPLE_GOALS.powerPartner.actual, target: g?Number(g.power_partner_target):SAMPLE_GOALS.powerPartner.target },
        membershipsPeriod: g?g.memberships_period:'annual',
        reviews:{ actual: live?null:SAMPLE_GOALS.reviews.actual, target: g?Number(g.reviews_target):SAMPLE_GOALS.reviews.target,
                  rating: live?null:SAMPLE_GOALS.reviews.rating, total: live?null:SAMPLE_GOALS.reviews.total, period: g?g.reviews_period:'monthly' } },
      context:{ opportunities: live?totOpps:SAMPLE_GOALS.opportunities,
                oppJobAvg: (live&&totOpps)?totRev/totOpps:SAMPLE_GOALS.oppJobAvg,
                cancellations: live?null:SAMPLE_GOALS.cancellations } };
  }
  function loadData(){
    if(mode==='supabase' && currentLocationId){
      const loc=supaLocations.find(l=>l.id===currentLocationId)||{name:'Location',stTenant:null};
      const ov=overlays[currentLocationId]||{goals:null,techMeta:[]};
      const liveRows = (Adapter.live && loc.stTenant) ? computeTechsLive(loc.stTenant) : null;
      const base = liveRows || SAMPLE_TECHS.map(t=>({...t}));
      techs = applyOverlayMeta(base, ov);
      computeTeamAvg();
      buildLocation(loc.name, ov, !!liveRows);
    } else {
      techs = SAMPLE_TECHS.map(t=>({...t}));
      computeTeamAvg();
      buildLocation('Nassau County', {goals:null,techMeta:[]}, false);
    }
    buildSlides(); paint(); updateChrome();
  }

  // ===================== render: technician scorecard ===================
  function metricTile(label, valueHtml, techVal, teamVal, fmt){
    const max=Math.max(techVal,teamVal)*1.15||1;
    const fillPct=Math.min(100,techVal/max*100), tickPct=Math.min(100,teamVal/max*100);
    const diff=teamVal?(techVal-teamVal)/teamVal:0;
    const dcls=diff>0.01?"up":diff<-0.01?"down":"flat", arrow=diff>0.01?"▲":diff<-0.01?"▼":"–";
    return `<div class="mtile"><div class="lbl">${label}</div><div class="val">${valueHtml}</div>
      <div class="delta ${dcls}">${arrow} ${(diff>0?"+":"")+Math.round(diff*100)}% vs team avg</div>
      <div class="cmp"><i style="width:${fillPct}%"></i><span style="left:${tickPct}%"></span></div>
      <div class="cmp-note">Team avg ${fmt(teamVal)}</div></div>`;
  }
  const avatarInner = t => t.photo ? `<img class="ava-photo" src="${esc(t.photo)}" alt="${esc(t.name)}"/>` : initials(t.name);
  function renderTech(tech){
    const d=DISC[tech.disc]||{word:"—",v:"var(--brand)"}; const rk=rankOf(tech,"revenue"), podium=rk<=3;
    return `<div class="slide" style="--disc-color:${d.v}">
      <div class="rank-corner ${podium?"podium":""}">${podium?`<div class="medal">${medals[rk-1]}</div>`:""}
        <div class="rc-txt"><span class="rk">${ordinal(rk)}<small>/${techs.length}</small></span><span class="cap">Revenue Rank</span></div></div>
      <div class="slide-head tech-head"><p class="eyebrow">Technician Scorecard · ${esc(location.name)} · ${location.period}</p></div>
      <div class="tech-grid">
        <div class="profile"><div class="avatar">${avatarInner(tech)}</div>
          <div class="p-id"><div class="p-name">${esc(tech.name)}</div><div class="p-title">${esc(tech.title||'Technician')}</div>
            ${tech.disc?`<div class="disc-badge"><span class="letter">${tech.disc}</span> ${d.word}</div>`:``}</div>
          <div class="rank-pill">Revenue rank <b>#${rk}</b> of ${techs.length}</div></div>
        <div><div class="metrics">
          ${metricTile("Revenue", usd(tech.revenue), tech.revenue, teamAvg.revenue, usdK)}
          ${metricTile("Sales", usd(tech.sales), tech.sales, teamAvg.sales, usdK)}
          ${metricTile("Opportunity Conversion", pct(tech.conv), tech.conv, teamAvg.conv, pct)}
          ${metricTile("Opp Job Average", usd(tech.oja), tech.oja, teamAvg.oja, usd)}
        </div>
        <div class="subchips">
          <div class="chip"><span class="k">Opportunities</span><span class="v">${tech.opps}</span></div>
          <div class="chip"><span class="k">Converted</span><span class="v">${tech.converted}</span></div>
          <div class="chip"><span class="k">Labor Hours</span><span class="v">${tech.hours}</span></div>
          <div class="chip"><span class="k">Sales / Hour</span><span class="v">${usd(tech.salesHr)}</span></div>
        </div></div>
      </div></div>`;
  }

  // ===================== render: leaderboard ============================
  function renderLeaderboard(lbMetric){
    const m=LB_METRICS.find(x=>x.key===lbMetric)||LB_METRICS[0];
    const sorted=[...techs].sort((a,b)=>b[m.key]-a[m.key]);
    const header=`<div class="lbcols lb-head"><div class="h">#</div><div class="h">Technician</div>
      ${LB_METRICS.map(x=>`<button class="h num ${x.key===lbMetric?"active":""}" data-k="${x.key}">${x.label}${x.key===lbMetric?' <span class="caret">▼</span>':''}</button>`).join("")}</div>`;
    const rows=sorted.map((t,i)=>{
      const cells=LB_METRICS.map(x=>`<div class="lbcell ${x.key===lbMetric?"active":""}"><span class="num">${x.fmt(t[x.key])}</span></div>`).join("");
      return `<div class="lbcols lb-row2 ${i<3?"top":""}" style="--disc-color:${(DISC[t.disc]||{}).v||'transparent'}">
        <div class="lb-rank">${i<3?`<span class="medal">${medals[i]}</span>`:(i+1)}</div>
        <div class="lb-id"><div class="lb-av">${t.photo?`<img class="ava-photo" src="${esc(t.photo)}" alt=""/>`:initials(t.name)}</div>
          <div style="min-width:0"><div class="lb-name">${esc(t.name)}</div><div class="lb-title">${esc(t.title||'Technician')}${t.disc?` · DISC ${t.disc}`:''}</div></div></div>
        ${cells}</div>`;
    }).join("");
    return `<div class="slide"><div class="slide-head"><div><p class="eyebrow">Team Leaderboard</p><h2>Ranked by ${m.label}</h2>
      <div class="slide-sub">${esc(location.name)} · ${location.period} · ${techs.length} technicians</div></div>
      <div class="lb-hint">Tap a metric to re-rank →</div></div>
      <div class="lb-scroll"><div class="lb-table" id="lbTable">${header}${rows}</div></div></div>`;
  }

  // ===================== render: company goals ==========================
  function statusOf(r){ if(r>=1) return {cls:"good",txt:"Goal met",ic:"✓"}; if(r>=0.85) return {cls:"warn",txt:"On pace",ic:"→"}; return {cls:"bad",txt:"Behind",ic:"!"}; }
  const perLabel = p => p==='annual' ? 'annual' : 'monthly';
  function ringGoal(lbl,valHtml,tgtHtml,ratio,gold){ const s=statusOf(ratio),p=clampPct(ratio);
    return `<div class="goal"><div class="ring ${gold?"gold":""}" style="--p:${p}"><span class="ring-txt">${p}%</span></div>
      <div class="g-body"><div class="g-lbl">${lbl}</div><div class="g-val">${valHtml}</div><div class="g-tgt">Target ${tgtHtml}</div>
      <span class="status ${s.cls}">${s.ic} ${s.txt}</span></div></div>`; }
  // membership card: "sold" (actual) comes from ServiceTitan; null => awaiting sync
  function membershipCard(lbl, actual, target, period){
    if(actual==null){
      return `<div class="goal"><div class="ring" style="--p:0"><span class="ring-txt">—</span></div>
        <div class="g-body"><div class="g-lbl">${lbl}</div><div class="g-val">${target||0}<small> target</small></div>
        <div class="g-tgt">${perLabel(period)} · sold count from ServiceTitan</div>
        <span class="status warn">→ Awaiting ServiceTitan</span></div></div>`;
    }
    const ratio=target?actual/target:0, p=clampPct(ratio), s=statusOf(ratio);
    return `<div class="goal"><div class="ring" style="--p:${p}"><span class="ring-txt">${p}%</span></div>
      <div class="g-body"><div class="g-lbl">${lbl}</div><div class="g-val">${actual}<small> / ${target}</small></div>
      <div class="g-tgt">${perLabel(period)} · sold vs target</div>
      <span class="status ${s.cls}">${s.ic} ${s.txt}</span></div></div>`;
  }
  function reviewsGoal(r){
    if(r.actual==null){
      return `<div class="goal"><div class="ring gold" style="--p:0"><span class="ring-txt">—</span></div>
        <div class="g-body"><div class="g-lbl">Google Reviews</div><div class="g-val">${r.target||0}<small> target</small></div>
        <div class="stars"><span class="cnt">rating &amp; count pull from GoHighLevel</span></div>
        <span class="status warn">→ Awaiting Google</span></div></div>`;
    }
    const ratio=r.target?r.actual/r.target:0,p=clampPct(ratio),s=statusOf(ratio);
    const stars = r.rating!=null ? `<span class="track"><span class="base">★★★★★</span><span class="fill" style="width:${(r.rating/5*100).toFixed(1)}%">★★★★★</span></span><span class="num">${Number(r.rating).toFixed(1)}</span>${r.total!=null?`<span class="cnt">· ${r.total} total</span>`:''}` : `<span class="cnt">rating not synced</span>`;
    return `<div class="goal"><div class="ring gold" style="--p:${p}"><span class="ring-txt">${r.actual}</span></div>
      <div class="g-body"><div class="g-lbl">Google Reviews · New This Period</div><div class="g-val">${r.actual}<small> / ${r.target}</small></div>
      <div class="stars">${stars}</div><span class="status ${s.cls}">${s.ic} ${s.txt}</span></div></div>`; }
  function renderGoals(){ const g=location.goals,c=location.context;
    const revFill=clampPct(g.revenue.actual/g.revenue.target); const scaleMax=Math.max(g.revenue.actual,g.revenue.target)*1.08||1;
    const revTick=Math.min(100,g.revenue.target/scaleMax*100), revPos=Math.min(100,g.revenue.actual/scaleMax*100);
    return `<div class="slide"><div class="slide-head"><div><p class="eyebrow">Company Goals</p><h2>${esc(location.name)}</h2>
      <div class="slide-sub">${location.period} · progress to targets</div></div><img class="goals-mascot" src="${MASCOT}" alt="PatchitUP"/></div>
      <div class="goals-wrap"><div class="g-hero"><div><div class="h-lbl">Revenue to Goal · ${perLabel(g.revenue.period)}</div><div class="h-val">${usd(g.revenue.actual)}</div>
        <div class="h-tgt">of ${usd(g.revenue.target)} ${perLabel(g.revenue.period)} target · ${usd(Math.max(0,g.revenue.target-g.revenue.actual))} to go</div>
        <div class="h-meter"><i style="width:${revPos}%"></i><span style="left:${revTick}%"></span></div></div>
        <div class="h-attain"><div class="big">${revFill}%</div><div class="cap">of goal</div></div></div>
        <div class="goals-grid">
          ${ringGoal("Average Close Rate", pct(g.close.actual), pct(g.close.target), g.close.target?g.close.actual/g.close.target:0)}
          ${membershipCard("HomeGuard Memberships", g.homeguard.actual, g.homeguard.target, g.membershipsPeriod)}
          ${membershipCard("Power Partner Memberships", g.powerPartner.actual, g.powerPartner.target, g.membershipsPeriod)}
          ${reviewsGoal(g.reviews)}
        </div>
        <div class="ctx-strip">
          <div class="ctx"><span class="k">Opportunities</span><span class="v">${c.opportunities}</span></div>
          <div class="ctx"><span class="k">Opp Job Avg</span><span class="v">${usd(c.oppJobAvg)}</span></div>
          <div class="ctx"><span class="k">Avg Close Rate</span><span class="v">${pct(g.close.actual)}</span></div>
          <div class="ctx"><span class="k">Cancellations</span><span class="v">${c.cancellations==null?'—':c.cancellations}</span></div>
        </div></div></div>`;
  }

  // ===================== slides + kiosk controller ======================
  let slides=[], idx=0;
  const stage=$("#stage"), dotsEl=$("#dots"), nowLabel=$("#nowLabel"), progFill=$("#progress").firstElementChild;
  function buildSlides(){
    slides=[ {type:"goals",label:"Company Goals",render:renderGoals},
      ...techs.map(t=>({type:"tech",label:(t.name||"").split(" ")[0],render:()=>renderTech(t)})),
      ...LB_METRICS.map(m=>({type:"lb",metric:m.key,label:`Leaders · ${m.label}`,render(){return renderLeaderboard(this.metric);}})) ];
    if(idx>=slides.length) idx=0;
    dotsEl.innerHTML=slides.map((s,i)=>`<button data-i="${i}" class="${s.type} ${i===idx?"on":""}" title="${esc(s.label)}"></button>`).join("");
  }
  function paint(){ stage.innerHTML=slides[idx].render();
    [...dotsEl.children].forEach((b,i)=>b.classList.toggle("on",i===idx));
    nowLabel.textContent = slides[idx].type==="tech" ? `Scorecard · ${slides[idx].label}` : slides[idx].label;
    if(slides[idx].type==="lb"){ const tbl=$("#lbTable"); tbl&&tbl.addEventListener("click",e=>{ const b=e.target.closest("button.h"); if(!b)return; slides[idx].metric=b.dataset.k; paint(); restart(); }); }
  }
  function go(n){ idx=(n+slides.length)%slides.length; paint(); restart(); }
  const DWELL={goals:13000,tech:7000,lb:6000}; const dwellFor=()=>DWELL[slides[idx].type]||8000;
  let kmode="kiosk", playing=true, t0=0, raf=0;
  function frame(ts){ if(!t0)t0=ts; const p=Math.min(1,(ts-t0)/dwellFor()); progFill.style.width=(p*100)+"%"; if(p>=1){t0=0;go(idx+1);return;} raf=requestAnimationFrame(frame); }
  function restart(){ cancelAnimationFrame(raf); t0=0; progFill.style.width="0%"; if(kmode==="kiosk"&&playing) raf=requestAnimationFrame(frame); }
  function setPlaying(p){ playing=p; $("#play").textContent=p?"❚❚":"▶"; restart(); }
  function setMode(m){ kmode=m; [...$("#mode").children].forEach(b=>b.classList.toggle("on",b.dataset.mode===m)); $("#progress").style.visibility=m==="kiosk"?"visible":"hidden"; $("#play").style.display=m==="kiosk"?"grid":"none"; restart(); }

  // ===================== chrome / toolbar ===============================
  function updateChrome(){
    const pill=$("#locName"); if(pill) pill.textContent=location.name;
    const dot=$("#liveDot"); if(dot){ dot.style.background=Adapter.live?'var(--good)':'var(--ink-3)'; dot.title=Adapter.live?'Live ServiceTitan data':'Sample data'; }
    const sel=$("#locSel");
    if(sel){ if(mode==='supabase' && supaLocations.length>1){ sel.style.display=''; sel.innerHTML=supaLocations.map(l=>`<option value="${l.id}" ${l.id===currentLocationId?'selected':''}>${esc(l.name)}</option>`).join(''); } else sel.style.display='none'; }
    const so=$("#signout"); if(so) so.style.display = mode==='supabase' ? 'grid':'none';
    let adminLink=$("#adminLink");
    if(mode==='supabase'){ if(!adminLink && so){ adminLink=document.createElement('a'); adminLink.id='adminLink'; adminLink.href='admin.html'; adminLink.textContent='Admin'; adminLink.className='iconbtn'; adminLink.title='Admin console'; adminLink.style.cssText='width:auto;padding:0 13px;text-decoration:none;display:grid;place-items:center;font-weight:800;font-size:12.5px'; so.parentNode.insertBefore(adminLink, so); } if(adminLink) adminLink.style.display='grid'; }
    else if(adminLink) adminLink.style.display='none';
    const badge=$("#roleBadge"); if(badge){ if(mode==='supabase'&&profile){ badge.style.display=''; badge.textContent = profile.role==='super_admin'?'Super Admin':'Franchisee'; } else badge.style.display='none'; }
  }
  $("#prev").addEventListener("click",()=>go(idx-1));
  $("#next").addEventListener("click",()=>go(idx+1));
  $("#play").addEventListener("click",()=>setPlaying(!playing));
  dotsEl.addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) go(+b.dataset.i); });
  $("#mode").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) setMode(b.dataset.mode); });
  $("#range").addEventListener("change",e=>{ range=e.target.value; loadData(); });
  const locSel=$("#locSel"); locSel&&locSel.addEventListener("change",async e=>{ currentLocationId=e.target.value; if(!overlays[currentLocationId]) await loadOverlay(currentLocationId); loadData(); });
  document.addEventListener("keydown",e=>{ if(e.key==="ArrowRight")go(idx+1); else if(e.key==="ArrowLeft")go(idx-1); else if(e.key===" "){e.preventDefault();setPlaying(!playing);} });
  $(".stage").addEventListener("mouseenter",()=>{ if(kmode==="kiosk")cancelAnimationFrame(raf); });
  $(".stage").addEventListener("mouseleave",()=>{ if(kmode==="kiosk"&&playing)restart(); });
  $("#theme").addEventListener("click",()=>{ const cur=document.documentElement.getAttribute("data-theme"); const sysDark=window.matchMedia("(prefers-color-scheme: dark)").matches; document.documentElement.setAttribute("data-theme", cur?(cur==="dark"?"light":"dark"):(sysDark?"light":"dark")); });
  const fsBtn=$("#fs"); fsBtn&&fsBtn.addEventListener("click",()=>{ try{ if(document.fullscreenElement){ document.exitFullscreen(); } else { const el=document.documentElement; (el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen).call(el); } }catch(_){} });
  function tick(){ const el=$("#clock"); if(el) el.textContent=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); }
  setInterval(tick,1000); tick();
  setInterval(()=>{ if(Adapter.live) Adapter.preload().then(loadData).catch(()=>{}); }, 15*60*1000);

  // ===================== Supabase auth + context ========================
  async function loadOverlay(locId){ if(!SB||!locId) return;
    try{ const [{data:g},{data:tm}] = await Promise.all([
        SB.from('location_goals').select('*').eq('location_id',locId).maybeSingle(),
        SB.from('technician_meta').select('*').eq('location_id',locId) ]);
      overlays[locId]={ goals:g||null, techMeta:tm||[] };
    }catch(_){ overlays[locId]={goals:null,techMeta:[]}; }
  }
  async function loadSupabaseContext(){
    try{ const {data:prof}=await SB.from('profiles').select('role,full_name,email').eq('id',session.user.id).single(); profile=prof; }catch(_){ profile=null; }
    try{ const {data:locs}=await SB.from('locations').select('id,name,code,region,st_tenant_id,is_active').eq('is_active',true).order('name');
      supaLocations=(locs||[]).map(l=>({id:l.id,name:l.name,stTenant:l.st_tenant_id||null})); }catch(_){ supaLocations=[]; }
    if(!currentLocationId && supaLocations.length) currentLocationId=supaLocations[0].id;
    if(currentLocationId) await loadOverlay(currentLocationId);
  }
  function showLogin(show){ const el=$("#loginOverlay"); if(el) el.hidden=!show; }
  function loginMsg(t,bad){ const el=$("#loginMsg"); if(el){ el.textContent=t||''; el.style.color=bad?'var(--bad)':'var(--good)'; } }
  let loginTab='password';
  function wireLogin(){
    if(!$("#loginOverlay")) return;
    $("#loginTabs")&&$("#loginTabs").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b)return; loginTab=b.dataset.tab;
      [...$("#loginTabs").children].forEach(x=>x.classList.toggle("on",x===b));
      $("#loginPassword").style.display = loginTab==='password'?'':'none';
      $("#loginSubmit").textContent = loginTab==='password'?'Sign in':'Send magic link'; loginMsg(''); });
    $("#loginDemo")&&$("#loginDemo").addEventListener("click",()=>{ mode='demo'; showLogin(false); loadData(); });
    $("#signout")&&$("#signout").addEventListener("click",async()=>{ if(SB) await SB.auth.signOut(); });
    $("#loginForm")&&$("#loginForm").addEventListener("submit",async e=>{ e.preventDefault();
      const email=$("#loginEmail").value.trim(), pw=$("#loginPassword").value;
      if(!email){ loginMsg('Enter your email',true); return; }
      $("#loginSubmit").disabled=true;
      try{
        if(loginTab==='password'){ const {error}=await SB.auth.signInWithPassword({email,password:pw}); if(error) throw error; }
        else { const {error}=await SB.auth.signInWithOtp({email, options:{emailRedirectTo: window.location.href}}); if(error) throw error; loginMsg('Check your email for the sign-in link.'); }
      }catch(err){ loginMsg(err.message||'Sign-in failed',true); }
      finally{ $("#loginSubmit").disabled=false; }
    });
  }

  // ===================== boot ===========================================
  async function boot(){
    setMode("kiosk"); wireLogin();
    await Adapter.init();
    if(SB){
      SB.auth.onAuthStateChange(async (_e,s)=>{ session=s;
        if(s){ mode='supabase'; await loadSupabaseContext(); showLogin(false); loadData(); }
      });
      const {data}=await SB.auth.getSession(); session=data.session;
      if(session){ mode='supabase'; await loadSupabaseContext(); showLogin(false); loadData(); }
      else { showLogin(true); loadData(); }   // render sample behind the login card
    } else {
      mode='demo'; loadData();
    }
  }
  boot();
})();
