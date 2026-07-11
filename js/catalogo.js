function normalizeCatalogBase(item){
  const type=String(item.tipo||item.type||'geojson').toLowerCase();
  return {
    id:item.id||uid(),
    active:item.ativo!==false && item.analisar!==false,
    visible:item.visivelInicialmente===true,
    name:item.nome||item.name||'Base sem nome',
    group:item.grupo||item.group||'Outras Bases',
    source:item.fonte||item.source||'',
    type,
    layer:item.layer||item.camada||'',
    wfsLayer:item.wfsLayer||item.typeName||item.typename||'',
    nameField:item.campoNome||item.nameField||'',
    url:item.url||'',
    status:'Catálogo online',
    color:item.cor||item.corContorno||'',
    fillColor:item.corPreenchimento||'',
    opacity:Number(item.opacidade??0.2),
    order:Number(item.ordem??999),
    description:item.descricao||'',
    version:item.versaoBase||'',
    updatedAt:item.dataAtualizacao||item.dataBase||'',
    role:String(item.papel||item.role||'').toLowerCase(),
    codeField:item.campoCodigo||item.codeField||'',
    dashboardEnabled:item.dashboard===true,
    specialReportEnabled:item.relatorioEspecial===true || item.relatorio===true,
    specialAnalysisEnabled:item.analiseEspecial===true,
    fieldMap:item.campos||item.fieldMap||{}
  };
}

async function fetchCatalogOnline(){
  const response=await fetch(CATALOG_URL,{cache:'no-store'});
  if(!response.ok) throw new Error('HTTP '+response.status);
  const data=await response.json();
  const list=Array.isArray(data)?data:(Array.isArray(data.bases)?data.bases:[]);
  const normalized=list.map(normalizeCatalogBase).sort((a,b)=>(a.order||999)-(b.order||999));
  localStorage.setItem(LS_CATALOG_CACHE,JSON.stringify({savedAt:new Date().toISOString(),bases:normalized}));
  return normalized;
}

async function loadBases(){
  log('runLog','Carregando catálogo online...');
  try{
    bases=await fetchCatalogOnline();
    localStorage.setItem(LS_BASES,JSON.stringify(bases));
    log('runLog',`Catálogo online carregado: ${bases.length} base(s).`);
  }catch(err){
    const cache=JSON.parse(localStorage.getItem(LS_CATALOG_CACHE)||'null');
    if(cache&&Array.isArray(cache.bases)){
      bases=cache.bases;
      log('runLog','Catálogo online indisponível. Usando cópia em cache.');
    }else{
      bases=[];
      log('runLog','Não foi possível carregar o catálogo: '+(err.message||err));
    }
  }
  bases=bases.map(b=>({...b,visible:b.visible===true}));
  saveBases();
  renderBases();
  renderWms();
}

function saveBases(){localStorage.setItem(LS_BASES,JSON.stringify(bases)); document.getElementById('baseCount').textContent=bases.filter(b=>b.active).length;}
function renderBases(){
  const list=document.getElementById('catalogBaseList');
  const activeCount=bases.filter(base=>base.active).length;
  const count=document.getElementById('baseCount');
  if(count) count.textContent=activeCount;

  if(!list) return;

  list.innerHTML='';
  if(!bases.length){
    list.innerHTML='<div class="catalog-status">Nenhuma base encontrada no catálogo online.</div>';
    return;
  }

  bases.forEach(base=>{
    const item=document.createElement('div');
    item.className='catalog-base-item';
    const safeName=escapeHtml(base.name||'Base sem nome');
    const safeGroup=escapeHtml(base.group||'Sem grupo');
    const safeSource=escapeHtml(base.source||'Fonte não informada');

    item.innerHTML=`
      <div class="catalog-base-info">
        <strong>${safeName}</strong>
        <span>${safeGroup} · ${safeSource}</span>
      </div>
      <div>
        <label class="switch" title="Ligar ou desligar base na análise">
          <input type="checkbox" ${base.active?'checked':''} aria-label="Ativar ${safeName}">
          <span class="slider"></span>
        </label>
        <div class="switch-label">${base.active?'LIGADA':'DESLIGADA'}</div>
      </div>`;

    const input=item.querySelector('input');
    const label=item.querySelector('.switch-label');
    input.addEventListener('change',()=>{
      base.active=input.checked;
      label.textContent=base.active?'LIGADA':'DESLIGADA';
      saveBases();
      renderWms();
      const status=document.getElementById('catalogStatus');
      if(status){
        status.textContent=`${bases.filter(b=>b.active).length} de ${bases.length} base(s) ligadas para análise.`;
      }
    });

    list.appendChild(item);
  });

  const status=document.getElementById('catalogStatus');
  if(status){
    status.textContent=`${activeCount} de ${bases.length} base(s) ligadas para análise.`;
  }
}

function isWmsBase(b){return (b.type==='wms'||b.type==='auto'||!b.type) && String(b.url||'').toLowerCase().includes('wms');}
function isVisualizableBase(b){
  return ['wms','wfs','arcgis','geojson','embedded','local'].includes(String(b.type||'').toLowerCase()) || isWmsBase(b);
}
const vectorVisualLayers=new Map();

function visualStyle(base){
  const n=String(base.name||'').toLowerCase();
  if(n.includes('mata atlântica')) return {color:'#1b5e20',weight:2,fillColor:'#43a047',fillOpacity:.18};
  if(n.includes('municip')) return {color:'#37474f',weight:1.4,fillColor:'#90a4ae',fillOpacity:.025,dashArray:'5,4'};
  if(n.includes('cipp')||n.includes('pecém')) return {color:'#d84315',weight:2.5,fillColor:'#ff7043',fillOpacity:.18};
  if(n.includes('massa')) return {color:'#1565c0',weight:1.8,fillColor:'#42a5f5',fillOpacity:.22};
  if(n.includes('curso')) return {color:'#0d47a1',weight:2.2,fillOpacity:0};
  if(n.includes('cnuc')||n.includes('conservação')) return {color:'#6a1b9a',weight:2,fillColor:'#ab47bc',fillOpacity:.14};
  return {color:'#7c3aed',weight:2,fillColor:'#a78bfa',fillOpacity:.12};
}
function currentVisualOpacity(){return Number(document.getElementById('wmsOpacity')?.value||55)/100;}
function setVectorLayerOpacity(layer,base){
  const op=currentVisualOpacity(), s=visualStyle(base);
  layer.setStyle?.({...s,opacity:Math.max(.25,op),fillOpacity:(s.fillOpacity||0)*op});
  layer.eachLayer?.(l=>{
    if(l.setStyle && !l.feature?.geometry?.type?.includes('Polygon')) l.setStyle({...s,opacity:Math.max(.25,op)});
  });
}
async function ensureVectorVisualLayer(base){
  if(vectorVisualLayers.has(base.id)) return vectorVisualLayers.get(base.id);
  const fc=await fetchBaseFeatures(base);
  const s=visualStyle(base);
  const layer=L.geoJSON(fc,{
    style:()=>s,
    pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:5,...s}),
    onEachFeature:(f,l)=>{
      const p=f.properties||{};
      const title=p[base.nameField]||p.Name||p.NOME||p.nome||base.name;
      l.bindPopup(`<b>${String(title)}</b><br>${base.name}`);
    }
  });
  setVectorLayerOpacity(layer,base);
  vectorVisualLayers.set(base.id,layer);
  return layer;
}
function bringAnalysisLayersToFront(){
  try{if(aoiLayer?.bringToFront)aoiLayer.bringToFront();}catch(e){}
  try{hitLayerGroup?.eachLayer(l=>l.bringToFront?.());}catch(e){}
  try{drawGroup?.eachLayer(l=>l.bringToFront?.());}catch(e){}
}
function renderWms(){
  wmsLayerGroup.clearLayers();
  wmsLayers.clear();
  bases.filter(isWmsBase).forEach(b=>{
    try{
      const layer=L.tileLayer.wms(wmsTileUrl(b.url),{
        layers:b.layer||guessLayer(b.url),format:'image/png',transparent:true,
        version:'1.1.0',attribution:b.source||b.name,opacity:currentVisualOpacity()
      });
      wmsLayers.set(b.id,layer);
      if(b.visible===true) layer.addTo(wmsLayerGroup);
    }catch(e){}
  });
  if(wmsLayerGroup.getLayers().length && !map.hasLayer(wmsLayerGroup)) wmsLayerGroup.addTo(map);
  if(!wmsLayerGroup.getLayers().length && map.hasLayer(wmsLayerGroup)) map.removeLayer(wmsLayerGroup);

  bases.filter(b=>isVisualizableBase(b)&&!isWmsBase(b)).forEach(async b=>{
    try{
      if(b.visible===true){
        const layer=await ensureVectorVisualLayer(b);
        if(!map.hasLayer(layer)) layer.addTo(map);
      }else{
        const layer=vectorVisualLayers.get(b.id);
        if(layer&&map.hasLayer(layer)) map.removeLayer(layer);
      }
      bringAnalysisLayersToFront();
    }catch(err){
      b.visible=false; saveBases();
      console.warn('Falha ao visualizar '+b.name,err);
      const cb=document.getElementById('vis_'+b.id); if(cb)cb.checked=false;
    }
  });
  renderWmsPanel();
}
function typeLabel(b){
  const t=String(b.type||'').toLowerCase();
  if(isWmsBase(b))return 'WMS';
  if(t==='wfs')return 'WFS';
  if(t==='arcgis')return 'ArcGIS REST';
  if(t==='geojson')return 'GeoJSON';
  if(t==='embedded'||t==='local')return 'Arquivo Local';
  return t||'Base';
}
function renderWmsPanel(){
  const list=document.getElementById('wmsLayerList'); if(!list)return;
  const items=bases.filter(isVisualizableBase);
  list.innerHTML=items.length?'':'<p class="small">Nenhuma base cadastrada para visualização.</p>';
  items.forEach(b=>{
    const row=document.createElement('div'); row.className='layer-item';
    row.innerHTML=`<input type="checkbox" id="vis_${b.id}" ${b.visible===true?'checked':''}>
      <label for="vis_${b.id}">${b.name}<small>${b.source||''} · ${typeLabel(b)}</small></label>`;
    row.querySelector('input').addEventListener('change',e=>setWmsVisibility(b.id,e.target.checked));
    list.appendChild(row);
  });
}
async function setWmsVisibility(id,visible){
  const b=bases.find(x=>x.id===id); if(!b)return;
  b.visible=visible; saveBases(); renderWms();
}
function setAllWmsVisibility(visible){
  bases.forEach(b=>{if(isVisualizableBase(b))b.visible=visible});
  saveBases(); renderWms();
}

async function detectBase(){ const url=baseUrl.value.trim(); if(!url){log('validationLog','Informe uma URL.');return;} if(baseType.value==='overpass' || url.includes('overpass-api')){ log('validationLog','OpenStreetMap/Overpass detectado. Use camada: waterways para cursos d’água ou waterbodies para corpos d’água. A consulta será limitada ao polígono/BBOX da área analisada.'); return {layer:baseLayer.value.trim()||'waterways',wfs:'',caps:url}; } if(baseType.value==='arcgis' || /\/MapServer\/\d+|\/FeatureServer\/\d+/i.test(url)){ const test=url.replace(/\/+$/,'')+'/query?f=geojson&where=1%3D0&outFields=*&returnGeometry=false'; log('validationLog','ArcGIS REST detectado. Endpoint de consulta GeoJSON:\n'+url.replace(/\/+$/,'')+'/query\n\nTeste leve:\n'+test); return {layer:baseLayer.value.trim()||'',wfs:'',caps:test}; } if((baseType.value==='gpkg') || url.toLowerCase().includes('.gpkg')){ log('validationLog','GeoPackage detectado. A ferramenta fará download do arquivo e leitura vetorial por BBOX, quando houver índice espacial.'); return {layer:'',wfs:'',caps:''}; } const rawLayer=baseLayer.value.trim()||guessLayer(url); const layer=vectorLayerName({url,layer:rawLayer,wfsLayer:rawLayer}); const wfs=buildWfsUrl({url,layer,wfsLayer:layer},null); const caps=buildCapabilitiesUrl(url,'WFS'); let msg=`Camada detectada: ${layer||'não identificada'}\nEndpoint WFS sugerido:\n${wfs}\n\nGetCapabilities WFS:\n${caps}\n\nTestando acesso...` ; log('validationLog',msg); try{ const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(),12000); const r=await fetch(caps,{signal:ctrl.signal}); const txt=await r.text(); msg += `\n\nResposta GetCapabilities: ${r.status} ${r.ok?'OK':'falhou'}`; if(txt.includes(layer)||txt.includes(rawLayer)) msg+='\nCamada encontrada no GetCapabilities.'; else msg+='\nCamada não localizada no texto do GetCapabilities; ainda assim o WFS pode funcionar.'; }catch(e){ msg += `\n\nNão foi possível validar no navegador (${e.message}). Pode ser CORS ou indisponibilidade. A ferramenta ainda salvará o endpoint sugerido.`; }
 log('validationLog',msg); return {layer,wfs,caps}; }


fileInput.onchange=async e=>{ const file=e.target.files[0]; if(!file)return; const ext=file.name.split('.').pop().toLowerCase(); try{ if(ext==='kml'){ const xml=new DOMParser().parseFromString(await file.text(),'text/xml'); setAOI(toGeoJSON.kml(xml),file.name); } else if(ext==='zip'){ const gj=await shp(await file.arrayBuffer()); setAOI(gj,file.name); } else alert('Formato não suportado. Use KML ou Shapefile ZIP.'); }catch(err){alert('Erro ao importar: '+err.message);} };
