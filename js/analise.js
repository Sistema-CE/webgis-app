function featureLabel(f,base){ const p=f.properties||{}; if(base.nameField&&p[base.nameField])return p[base.nameField]; const keys=['nome','NOME','name','NAME','nome_uc','NM_UNIDADE','terrai_nom','denominacao','nom_cav','nome_rio','NOME_RIO','rio_nome','NOMEMASSA','nomemassa','nome_massa','NOME_MASSA','nm_massa','NM_MASSA','ds_nome','DS_NOME','waterway','natural','water','landuse']; for(const k of keys) if(p[k]) return p[k]; return 'Feição sem nome'; }
function checkIntersection(aoiF,feat){ try{ const gt=feat.geometry&&feat.geometry.type; if(!gt) return {hit:false,area:0,geom:null}; if(gt.includes('Point')){ const hit=gt==='Point'?turf.booleanPointInPolygon(feat,aoiF):feat.geometry.coordinates.some(c=>turf.booleanPointInPolygon(turf.point(c),aoiF)); return {hit,area:0,geom:hit?feat:null}; } if(gt.includes('Polygon') && aoiF.geometry.type.includes('Polygon')){ const inter=turf.intersect(aoiF,feat); return {hit:!!inter,area:inter?areaHa(inter):0,geom:inter}; } const hit=turf.booleanIntersects(aoiF,feat); return {hit,area:0,geom:hit?feat:null}; }catch(e){ return {hit:false,area:0,geom:null,error:e.message}; } }
btnRun.onclick=async()=>{ if(!aoi){alert('Defina a área de interesse.');return;} results=[]; hitLayerGroup.clearLayers(); const active=bases.filter(b=>b.active); log('runLog',`Iniciando análise de ${active.length} bases...`); for(const [i,b] of active.entries()){ log('runLog',`Analisando ${i+1}/${active.length}: ${b.name}`); try{ const fc=await fetchBaseFeatures(b); let totalArea=0, names=[], hitGeoms=[]; for(const f of fc.features||[]){ const r=checkIntersection(aoi,f); if(r.hit){ totalArea+=r.area; names.push(featureLabel(f,b)); if(r.geom) hitGeoms.push(r.geom); } } const pct=areaHa(aoi)>0?(totalArea/areaHa(aoi))*100:0;
let municipalityBreakdown=null;
if(b.layer==='IBGE_MUNICIPIOS_2025_EMBEDDED'){
  municipalityBreakdown=[];
  for(const f of fc.features||[]){
    const rr=checkIntersection(aoi,f);
    if(!rr.hit||!rr.geom) continue;
    const ah=areaHa(rr.geom);
    if(ah<=0) continue;
    const pp=f.properties||{};
    const nm=pp[b.nameField]||pp.Name||pp.NOME||pp.nome||'Município não identificado';
    municipalityBreakdown.push({nome:String(nm),area:ah,pct:areaHa(aoi)>0?(ah/areaHa(aoi))*100:0});
  }
  municipalityBreakdown.sort((x,y)=>y.pct-x.pct);
}
results.push({base:b.name,group:b.group,source:b.source,hit:names.length>0,feature:[...new Set(names)].slice(0,8).join('; '),area:totalArea,pct,url:b.url,status:'OK',hitGeoms,baseFeatures:(fc.features||[]).filter(f=>checkIntersection(aoi,f).hit),municipalityBreakdown}); hitGeoms.forEach(g=>L.geoJSON(g,{style:{color:'#dc2626',weight:3,fillColor:'#ef4444',fillOpacity:.28},pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:7,color:'#dc2626',fillColor:'#ef4444',fillOpacity:.8})}).addTo(hitLayerGroup)); }catch(e){ results.push({base:b.name,group:b.group,source:b.source,hit:false,feature:'Erro ao carregar/analisar: '+e.message,area:0,pct:0,url:b.url,status:'ERRO'}); } renderResults(); }
 log('runLog',`Análise concluída. Bases: ${results.length}. Interseções: ${results.filter(r=>r.hit).length}.`); };
function renderResults(){ const tb=document.querySelector('#resultsTable tbody'); tb.innerHTML=''; results.forEach(r=>{ const tr=document.createElement('tr'); const cls=r.status==='ERRO'?'warn':(r.hit?'no':'ok'); const label=r.status==='ERRO'?'ERRO':(r.hit?'SIM':'NÃO'); tr.innerHTML=`<td><b>${r.base}</b><br><span class="small">${r.source||''}</span></td><td><span class="pill ${cls}">${label}</span></td><td>${r.feature||'-'}</td><td>${r.area?fmt(r.area)+' ha':'-'}</td><td>${r.pct?fmt(r.pct,2)+'%':'-'}</td>`; tb.appendChild(tr); }); resBases.textContent=results.length; resHits.textContent=results.filter(r=>r.hit).length; resArea.textContent=fmt(results.reduce((s,r)=>s+(r.area||0),0)); }
btnCsv.onclick=()=>{ if(!results.length){alert('Execute a análise primeiro.');return;} const rows=[['Base','Grupo','Fonte','Intersecta','Feicao','Area_ha','Percentual','Status'],...results.map(r=>[r.base,r.group,r.source,r.hit?'Sim':'Não',r.feature,fmt(r.area),fmt(r.pct,2),r.status])]; download('resultado_intersecoes.csv',rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n'),'text/csv;charset=utf-8'); };

