
function clampNumber(value,min,max,fallback){
  const number=Number(value);
  return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;
}

function loadBaseStyleOverrides(){
  try{
    const value=JSON.parse(localStorage.getItem(LS_BASE_STYLE_OVERRIDES)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch(error){
    return {};
  }
}

function saveBaseStyleOverrides(value){
  localStorage.setItem(LS_BASE_STYLE_OVERRIDES,JSON.stringify(value||{}));
}

function heuristicVisualStyle(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('mata atlântica')) return {strokeColor:'#1b5e20',strokeWidth:2,strokeOpacity:1,fillColor:'#43a047',fillOpacity:.18,fillEnabled:true,dashArray:''};
  if(n.includes('municip')) return {strokeColor:'#37474f',strokeWidth:1.4,strokeOpacity:1,fillColor:'#90a4ae',fillOpacity:.025,fillEnabled:true,dashArray:'5,4'};
  if(n.includes('cipp')||n.includes('pecém')) return {strokeColor:'#d84315',strokeWidth:2.5,strokeOpacity:1,fillColor:'#ff7043',fillOpacity:.18,fillEnabled:true,dashArray:''};
  if(n.includes('massa')) return {strokeColor:'#1565c0',strokeWidth:1.8,strokeOpacity:1,fillColor:'#42a5f5',fillOpacity:.22,fillEnabled:true,dashArray:''};
  if(n.includes('curso')) return {strokeColor:'#0d47a1',strokeWidth:2.2,strokeOpacity:1,fillColor:'#0d47a1',fillOpacity:0,fillEnabled:false,dashArray:''};
  if(n.includes('cnuc')||n.includes('conservação')) return {strokeColor:'#6a1b9a',strokeWidth:2,strokeOpacity:1,fillColor:'#ab47bc',fillOpacity:.14,fillEnabled:true,dashArray:''};
  if(n.includes('anm')||n.includes('miner')) return {strokeColor:'#92400e',strokeWidth:2,strokeOpacity:1,fillColor:'#f59e0b',fillOpacity:.14,fillEnabled:true,dashArray:''};
  return {strokeColor:'#7c3aed',strokeWidth:2,strokeOpacity:1,fillColor:'#a78bfa',fillOpacity:.12,fillEnabled:true,dashArray:''};
}

function catalogStyleFromItem(item,name){
  const fallback=heuristicVisualStyle(name);
  const strokeColor=item.corContorno||item.cor||fallback.strokeColor;
  const fillColor=item.corPreenchimento||item.fillColor||item.cor||fallback.fillColor;
  return {
    strokeColor,
    strokeWidth:clampNumber(item.espessuraLinha??item.strokeWidth,0,12,fallback.strokeWidth),
    strokeOpacity:clampNumber(item.opacidadeContorno??item.strokeOpacity,0,1,fallback.strokeOpacity),
    fillColor,
    fillOpacity:clampNumber(item.opacidadePreenchimento??item.fillOpacity??item.opacidade,0,1,fallback.fillOpacity),
    fillEnabled:item.preenchimento!==false && item.fillEnabled!==false,
    dashArray:String(item.tracejado||item.dashArray||fallback.dashArray||'')
  };
}

function mergeBaseStyle(baseId,catalogStyle){
  const overrides=loadBaseStyleOverrides();
  return {...catalogStyle,...(overrides[baseId]||{})};
}

function persistBaseStyle(base){
  const overrides=loadBaseStyleOverrides();
  overrides[base.id]={
    strokeColor:base.style.strokeColor,
    strokeWidth:base.style.strokeWidth,
    strokeOpacity:base.style.strokeOpacity,
    fillColor:base.style.fillColor,
    fillOpacity:base.style.fillOpacity,
    fillEnabled:base.style.fillEnabled,
    dashArray:base.style.dashArray||''
  };
  saveBaseStyleOverrides(overrides);
}

function applyBaseStyleToExistingLayer(base){
  const layer=vectorVisualLayers.get(base.id);
  if(!layer) return;
  setVectorLayerOpacity(layer,base);
}

function cancelPendingBaseVisualLoad(baseId){
  vectorVisualLoadTokens.set(baseId,(vectorVisualLoadTokens.get(baseId)||0)+1);
}

function restoreBaseCatalogStyle(base){
  const overrides=loadBaseStyleOverrides();
  delete overrides[base.id];
  saveBaseStyleOverrides(overrides);

  base.style={...base.catalogStyle};
  applyBaseStyleToExistingLayer(base);
  saveBases();
  renderBases();
  renderWmsPanel();
}

function invalidateBaseVisualLayer(base){
  cancelPendingBaseVisualLoad(base.id);
  const layer=vectorVisualLayers.get(base.id);
  if(layer&&map.hasLayer(layer)) map.removeLayer(layer);
  vectorVisualLayers.delete(base.id);
}

function updateBaseStyle(base,patch){
  base.style={...base.style,...patch};
  base.style.strokeWidth=clampNumber(base.style.strokeWidth,0,12,2);
  base.style.strokeOpacity=clampNumber(base.style.strokeOpacity,0,1,1);
  base.style.fillOpacity=clampNumber(base.style.fillOpacity,0,1,.15);

  persistBaseStyle(base);
  applyBaseStyleToExistingLayer(base);
  saveBases();
}

function normalizeCatalogBase(item){
  const type=String(item.tipo||item.type||'geojson').toLowerCase();
  const name=item.nome||item.name||'Base sem nome';
  const id=item.id||uid();
  const catalogStyle=catalogStyleFromItem(item,name);
  return {
    id,
    active:item.ativo!==false && item.analisar!==false,
    visible:item.visivelInicialmente===true,
    name,
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
    analysisType:String(item.tipoAnalise||item.analysisType||'generico').toLowerCase(),
    codeField:item.campoCodigo||item.codeField||'',
    dashboardEnabled:item.dashboard===true,
    specialReportEnabled:item.relatorioEspecial===true || item.relatorio===true,
    specialAnalysisEnabled:item.analiseEspecial===true,
    fieldMap:item.campos||item.fieldMap||{},
    catalogStyle,
    style:mergeBaseStyle(id,catalogStyle)
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

  const groups=new Map();
  bases.slice().sort((a,b)=>(a.order||999)-(b.order||999)).forEach(base=>{
    const groupName=base.group||'Outras Bases';
    if(!groups.has(groupName)) groups.set(groupName,[]);
    groups.get(groupName).push(base);
  });

  groups.forEach((groupBases,groupName)=>{
    const section=document.createElement('section');
    section.className='catalog-group';
    const enabledCount=groupBases.filter(base=>base.active).length;
    section.innerHTML=`
      <button class="catalog-group-header" type="button" aria-expanded="true">
        <span><b>${escapeHtml(groupName)}</b><small>${enabledCount} de ${groupBases.length} ligada(s)</small></span>
        <span class="catalog-group-chevron">⌄</span>
      </button>
      <div class="catalog-group-content"></div>`;

    const header=section.querySelector('.catalog-group-header');
    const content=section.querySelector('.catalog-group-content');
    header.addEventListener('click',()=>{
      const expanded=header.getAttribute('aria-expanded')==='true';
      header.setAttribute('aria-expanded',String(!expanded));
      content.hidden=expanded;
      section.classList.toggle('collapsed',expanded);
    });

    groupBases.forEach(base=>{
      if(!base.catalogStyle) base.catalogStyle=heuristicVisualStyle(base.name);
      if(!base.style) base.style=mergeBaseStyle(base.id,base.catalogStyle);

      const item=document.createElement('div');
      item.className='catalog-base-item catalog-base-style-card';
      const safeName=escapeHtml(base.name||'Base sem nome');
      const safeSource=escapeHtml(base.source||'Fonte não informada');
      const vectorStyleAvailable=!isWmsBase(base);
      const analysisLabel=escapeHtml(base.analysisType||'generico');

      item.innerHTML=`
        <div class="catalog-base-main">
          <div class="catalog-base-info">
            <strong>${safeName}</strong>
            <span>${safeSource}</span>
            <span class="analysis-type-badge">Análise: ${analysisLabel}</span>
          </div>
          <div class="catalog-base-actions">
            <button class="base-style-toggle secondary" type="button">Editar estilo</button>
            <div>
              <label class="switch">
                <input class="base-active-input" type="checkbox" ${base.active?'checked':''}>
                <span class="slider"></span>
              </label>
              <div class="switch-label">${base.active?'LIGADA':'DESLIGADA'}</div>
            </div>
          </div>
        </div>
        <div class="base-style-editor" hidden>
          ${vectorStyleAvailable?'':'<div class="base-style-note">Em bases WMS, o estilo é definido pelo servidor.</div>'}
          <div class="base-style-grid ${vectorStyleAvailable?'':'disabled-style-grid'}">
            <label><span>Cor do contorno</span><input class="style-stroke-color" type="color" value="${base.style.strokeColor}"></label>
            <label><span>Espessura da linha</span><div class="style-range-row"><input class="style-stroke-width" type="range" min="0" max="8" step="0.2" value="${base.style.strokeWidth}"><output>${Number(base.style.strokeWidth).toFixed(1)} px</output></div></label>
            <label><span>Transparência da linha</span><div class="style-range-row"><input class="style-stroke-opacity" type="range" min="0" max="100" step="1" value="${Math.round(base.style.strokeOpacity*100)}"><output>${Math.round((1-base.style.strokeOpacity)*100)}%</output></div></label>
            <label><span>Cor do preenchimento</span><input class="style-fill-color" type="color" value="${base.style.fillColor}"></label>
            <label><span>Transparência do preenchimento</span><div class="style-range-row"><input class="style-fill-opacity" type="range" min="0" max="100" step="1" value="${Math.round(base.style.fillOpacity*100)}"><output>${Math.round((1-base.style.fillOpacity)*100)}%</output></div></label>
            <label class="style-checkbox-label"><span>Preenchimento</span><input class="style-fill-enabled" type="checkbox" ${base.style.fillEnabled?'checked':''}><b>${base.style.fillEnabled?'ATIVADO':'DESATIVADO'}</b></label>
          </div>
          <div class="base-style-footer">
            <span class="small">As alterações ficam salvas neste navegador.</span>
            <button class="restore-base-style secondary" type="button">Restaurar estilo do catálogo</button>
          </div>
        </div>`;

      const activeInput=item.querySelector('.base-active-input');
      const stateLabel=item.querySelector('.switch-label');
      activeInput.addEventListener('change',()=>{
        base.active=activeInput.checked;
        stateLabel.textContent=base.active?'LIGADA':'DESLIGADA';
        saveBases();
        renderWms();
        renderBases();
      });

      const toggle=item.querySelector('.base-style-toggle');
      const editor=item.querySelector('.base-style-editor');
      toggle.addEventListener('click',()=>{
        editor.hidden=!editor.hidden;
        toggle.textContent=editor.hidden?'Editar estilo':'Fechar estilo';
      });

      if(vectorStyleAvailable){
        const bindRange=(selector,property,transform,format)=>{
          const input=item.querySelector(selector);
          const output=input.parentElement.querySelector('output');
          input.addEventListener('input',()=>{
            const value=transform(input.value);
            output.textContent=format(value);
            updateBaseStyle(base,{[property]:value});
          });
        };
        item.querySelector('.style-stroke-color').addEventListener('input',e=>updateBaseStyle(base,{strokeColor:e.target.value}));
        item.querySelector('.style-fill-color').addEventListener('input',e=>updateBaseStyle(base,{fillColor:e.target.value}));
        bindRange('.style-stroke-width','strokeWidth',v=>Number(v),v=>`${v.toFixed(1)} px`);
        bindRange('.style-stroke-opacity','strokeOpacity',v=>Number(v)/100,v=>`${Math.round((1-v)*100)}%`);
        bindRange('.style-fill-opacity','fillOpacity',v=>Number(v)/100,v=>`${Math.round((1-v)*100)}%`);
        const fillEnabled=item.querySelector('.style-fill-enabled');
        const fillState=fillEnabled.parentElement.querySelector('b');
        fillEnabled.addEventListener('change',()=>{
          fillState.textContent=fillEnabled.checked?'ATIVADO':'DESATIVADO';
          updateBaseStyle(base,{fillEnabled:fillEnabled.checked});
        });
      }else{
        item.querySelectorAll('.base-style-grid input').forEach(input=>input.disabled=true);
      }

      item.querySelector('.restore-base-style').addEventListener('click',()=>restoreBaseCatalogStyle(base));
      content.appendChild(item);
    });

    list.appendChild(section);
  });

  const status=document.getElementById('catalogStatus');
  if(status) status.textContent=`${activeCount} de ${bases.length} base(s) ligadas para análise.`;
}

function isWmsBase(b){return (b.type==='wms'||b.type==='auto'||!b.type) && String(b.url||'').toLowerCase().includes('wms');}
function isVisualizableBase(b){
  return ['wms','wfs','arcgis','geojson','embedded','local'].includes(String(b.type||'').toLowerCase()) || isWmsBase(b);
}
const vectorVisualLayers=new Map();
const vectorVisualLoadTokens=new Map();

function visualStyle(base){
  const source=base.style||base.catalogStyle||heuristicVisualStyle(base.name);
  return {
    color:source.strokeColor,
    weight:Number(source.strokeWidth),
    opacity:Number(source.strokeOpacity),
    fillColor:source.fillColor,
    fillOpacity:source.fillEnabled===false?0:Number(source.fillOpacity),
    fill:source.fillEnabled!==false,
    dashArray:source.dashArray||''
  };
}
function currentVisualOpacity(){return Number(document.getElementById('wmsOpacity')?.value||55)/100;}
function setVectorLayerOpacity(layer,base){
  const op=currentVisualOpacity(), s=visualStyle(base);
  const finalStyle={
    ...s,
    opacity:Math.min(1,Math.max(0,s.opacity*op)),
    fillOpacity:Math.min(1,Math.max(0,(s.fillOpacity||0)*op))
  };
  layer.setStyle?.(finalStyle);
  layer.eachLayer?.(child=>{
    if(child.setStyle) child.setStyle(finalStyle);
  });
}
async function ensureVectorVisualLayer(base){
  if(vectorVisualLayers.has(base.id)){
    const existing=vectorVisualLayers.get(base.id);
    setVectorLayerOpacity(existing,base);
    return existing;
  }

  const token=(vectorVisualLoadTokens.get(base.id)||0)+1;
  vectorVisualLoadTokens.set(base.id,token);

  const fc=await fetchBaseFeatures(base);

  if(vectorVisualLoadTokens.get(base.id)!==token){
    throw new Error('Carregamento cancelado.');
  }

  const s=visualStyle(base);
  const layer=L.geoJSON(fc,{
    style:()=>s,
    pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{radius:5,...s}),
    onEachFeature:(feature,leafletLayer)=>{
      const properties=feature.properties||{};
      const title=properties[base.nameField]||properties.Name||properties.NOME||properties.nome||base.name;
      leafletLayer.bindPopup(`<b>${String(title)}</b><br>${base.name}`);
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

  bases.filter(base=>isVisualizableBase(base)&&!isWmsBase(base)).forEach(async base=>{
    if(base.visible!==true){
      cancelPendingBaseVisualLoad(base.id);
      const existing=vectorVisualLayers.get(base.id);
      if(existing&&map.hasLayer(existing)) map.removeLayer(existing);
      return;
    }

    try{
      const layer=await ensureVectorVisualLayer(base);

      // A base pode ter sido desligada enquanto o arquivo era carregado.
      if(base.visible!==true){
        if(map.hasLayer(layer)) map.removeLayer(layer);
        return;
      }

      setVectorLayerOpacity(layer,base);
      if(!map.hasLayer(layer)) layer.addTo(map);
      bringAnalysisLayersToFront();
    }catch(error){
      if(String(error?.message||error)==='Carregamento cancelado.') return;

      base.visible=false;
      cancelPendingBaseVisualLoad(base.id);
      saveBases();
      console.warn('Falha ao visualizar '+base.name,error);
      const checkbox=document.getElementById('vis_'+base.id);
      if(checkbox) checkbox.checked=false;
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
