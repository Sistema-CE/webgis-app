function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function selectedBaseTile(){
  if(currentBaseMap===baseMaps.satellite) return {url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attr:'Tiles © Esri, Maxar, Earthstar Geographics e demais fornecedores'};
  return {url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',attr:'© OpenStreetMap'};
}
function leafletMapToDataUrl(m){
  return new Promise((resolve,reject)=>{
    if(typeof leafletImage!=='function') return reject(new Error('Biblioteca de captura não carregada.'));
    leafletImage(m,(err,canvas)=>{ if(err) reject(err); else resolve(canvas.toDataURL('image/png',0.92)); });
  });
}
async function captureIntersectionMap(result,index){
  const holder=document.createElement('div');
  holder.style.cssText='position:fixed;left:-12000px;top:0;width:1100px;height:650px;background:#fff;z-index:-1;';
  document.body.appendChild(holder);
  const tile=selectedBaseTile();
  const temp=L.map(holder,{zoomControl:false,attributionControl:true,preferCanvas:true,fadeAnimation:false,zoomAnimation:false});
  L.tileLayer(tile.url,{maxZoom:20,crossOrigin:true,attribution:tile.attr}).addTo(temp);
  const group=L.featureGroup().addTo(temp);
  L.geoJSON(aoi,{style:{color:'#2563eb',weight:4,fillColor:'#60a5fa',fillOpacity:.12}}).addTo(group);
  (result.baseFeatures||[]).forEach(f=>L.geoJSON(f,{style:{color:'#f59e0b',weight:3,fillColor:'#fbbf24',fillOpacity:.18},pointToLayer:(ft,ll)=>L.circleMarker(ll,{radius:8,color:'#b45309',weight:2,fillColor:'#f59e0b',fillOpacity:.9})}).addTo(group));
  (result.hitGeoms||[]).forEach(g=>L.geoJSON(g,{style:{color:'#dc2626',weight:5,fillColor:'#ef4444',fillOpacity:.38},pointToLayer:(ft,ll)=>L.circleMarker(ll,{radius:10,color:'#991b1b',weight:3,fillColor:'#ef4444',fillOpacity:1})}).addTo(group));
  // O enquadramento do mapa individual deve ser definido exclusivamente pela Área de Interesse.
  // A extensão total da unidade ambiental não participa do cálculo de zoom/centralização.
  try{
    const aoiBounds=L.geoJSON(aoi).getBounds();
    if(aoiBounds && aoiBounds.isValid()){
      temp.fitBounds(aoiBounds.pad(.15),{
        animate:false,
        padding:[45,45],
        maxZoom:17
      });
    }else{
      throw new Error('Limites inválidos da Área de Interesse.');
    }
  }catch(e){
    try{
      const center=turf.center(aoi).geometry.coordinates;
      temp.setView([center[1],center[0]],15,{animate:false});
    }catch(err){
      temp.setView([-5.2,-39.5],7,{animate:false});
    }
  }
  await new Promise(r=>setTimeout(r,1800));
  try{
    const data=await leafletMapToDataUrl(temp);
    temp.remove(); holder.remove(); return data;
  }catch(e){ temp.remove(); holder.remove(); throw e; }
}
async function buildReportHtml(progressButton=null){
  if(!aoi) throw new Error('Defina a Área de Interesse.');
  if(!results.length) throw new Error('Execute a análise antes de visualizar o relatório.');

  const hits=results.filter(r=>r.hit), errors=results.filter(r=>r.status==='ERRO');
  const mapSections=[];
  for(let i=0;i<hits.length;i++){
    const r=hits[i]; if(progressButton) progressButton.textContent=`Gerando mapa ${i+1}/${hits.length}...`;
    try{
      const dataUrl=await captureIntersectionMap(r,i);
      mapSections.push(`<section class="map-section"><h3>Mapa ${i+1} — ${escapeHtml(r.base)}</h3><img src="${dataUrl}" alt="Mapa individual da interseção com ${escapeHtml(r.base)}"><div class="legend"><span class="aoi-box"></span> Área analisada &nbsp; <span class="base-box"></span> Base ambiental &nbsp; <span class="hit-box"></span> Interseção</div><p><b>Feição:</b> ${escapeHtml(r.feature||'-')}<br><b>Área sobreposta:</b> ${r.area?fmt(r.area)+' ha':'não aplicável'} &nbsp; <b>Percentual:</b> ${r.pct?fmt(r.pct,2)+'%':'não aplicável'}</p></section>`);
    }catch(e){
      mapSections.push(`<section class="map-section"><h3>Mapa ${i+1} — ${escapeHtml(r.base)}</h3><div class="map-error">Não foi possível gerar o mapa individual desta base.<br><small>${escapeHtml(e.message)}</small></div></section>`);
    }
  }
  const hitNames=hits.map(r=>r.base).join('; ');
  const errNames=errors.map(r=>r.base+' ('+r.feature+')').join('; ');
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Checagem Ambiental</title><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;margin:32px;color:#172554;line-height:1.45}h1{color:#0f766e}h2{border-bottom:2px solid #0f766e;padding-bottom:5px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #ddd;border-radius:12px;padding:12px;background:#f8fafc}b.big{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#ecfdf5}.sim{color:#b91c1c;font-weight:bold}.nao{color:#166534;font-weight:bold}.erro{color:#92400e;font-weight:bold}.note{background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:12px;margin:16px 0}.map-section{page-break-before:auto;break-inside:avoid;margin:26px 0;padding-top:8px;border-top:1px solid #cbd5e1}.map-section img{display:block;width:100%;max-width:1000px;border:1px solid #94a3b8;border-radius:8px}.legend{font-size:12px;margin:8px 0}.legend span{display:inline-block;width:18px;height:10px;border:2px solid;margin-right:4px}.aoi-box{background:#60a5fa33;border-color:#2563eb!important}.base-box{background:#fbbf2433;border-color:#f59e0b!important}.hit-box{background:#ef444466;border-color:#dc2626!important}.map-error{padding:35px;text-align:center;background:#f8fafc;border:1px dashed #94a3b8}.conclusion{background:#f0fdfa;border-left:5px solid #0f766e;padding:14px}@media print{body{margin:0}.map-section{page-break-before:always}}</style></head><body><h1>Relatório de Checagem de Áreas Sensíveis</h1><p><b>Data e hora:</b> ${new Date().toLocaleString('pt-BR')}</p><h2>1. Identificação da análise</h2><p><b>Área analisada:</b> ${fmt(areaHa(aoi))} ha.</p><h2>2. Resumo dos resultados</h2><div class="grid"><div class="card"><b class="big">${fmt(areaHa(aoi))}</b><br>ha analisados</div><div class="card"><b class="big">${results.length}</b><br>bases consultadas</div><div class="card"><b class="big">${hits.length}</b><br>interseções</div><div class="card"><b class="big">${errors.length}</b><br>erros de consulta</div></div><div class="note">${hits.length?'Foram identificadas interseções entre a área analisada e bases sensíveis.':'Não foram identificadas interseções com as bases consultadas.'}</div><h2>3. Tabela das bases analisadas</h2><table><thead><tr><th>Base</th><th>Fonte</th><th>Resultado</th><th>Feição</th><th>Área sobreposta</th><th>%</th></tr></thead><tbody>${results.map(r=>`<tr><td>${escapeHtml(r.base)}</td><td>${escapeHtml(r.source||'')}</td><td class="${r.status==='ERRO'?'erro':(r.hit?'sim':'nao')}">${r.status==='ERRO'?'Erro':(r.hit?'Sim':'Não')}</td><td>${escapeHtml(r.feature||'-')}${r.municipalityBreakdown&&r.municipalityBreakdown.length?'<div style="margin-top:6px;font-size:11px">'+r.municipalityBreakdown.map(m=>'<div><b>'+escapeHtml(m.nome)+'</b>: '+fmt(m.pct,2)+'% ('+fmt(m.area,4)+' ha)</div>').join('')+'</div>':''}</td><td>${r.area?fmt(r.area)+' ha':'-'}</td><td>${r.pct?fmt(r.pct,2)+'%':'-'}</td></tr>`).join('')}</tbody></table>${results.some(r=>r.municipalityBreakdown&&r.municipalityBreakdown.length)?'<h2>4. Distribuição da Área de Interesse por Município</h2>'+results.filter(r=>r.municipalityBreakdown&&r.municipalityBreakdown.length).map(r=>'<table><thead><tr><th>Município</th><th>Área intersectada</th><th>Percentual da Área de Interesse</th></tr></thead><tbody>'+r.municipalityBreakdown.map(m=>'<tr><td>'+escapeHtml(m.nome)+'</td><td>'+fmt(m.area,4)+' ha</td><td>'+fmt(m.pct,2)+'%</td></tr>').join('')+'</tbody></table>').join(''):''}${hits.length?'<h2>5. Mapas Individuais das Interseções Identificadas</h2>'+mapSections.join(''):'<h2>5. Mapas Individuais das Interseções Identificadas</h2><p>Não há interseções positivas para representação individual.</p>'}<h2>6. Conclusão textual</h2><div class="conclusion"><p>Foram analisadas <b>${results.length}</b> bases ambientais. Foram identificadas <b>${hits.length}</b> bases com interseção${hits.length?': '+escapeHtml(hitNames):'.'}</p>${errors.length?`<p>Apresentaram erro de consulta: ${escapeHtml(errNames)}.</p>`:''}<p>Esta checagem é preliminar e depende da disponibilidade, escala, atualização e precisão das bases consultadas.</p></div>${referencePoints.length?`<h2>Pontos de Referência</h2><table><thead><tr><th>Ponto</th><th>Latitude</th><th>Longitude</th><th>Origem</th></tr></thead><tbody>${referencePoints.map(p=>`<tr><td>${escapeHtml(p.label||'Ponto')}</td><td>${formatCoordinate(p.lat)}</td><td>${formatCoordinate(p.lng)}</td><td>${escapeHtml(p.source||'Manual')}</td></tr>`).join('')}</tbody></table>`:''}<h2>7. Observações e limitações</h2><p>Os resultados não substituem análise técnica, consulta aos órgãos responsáveis ou conferência em bases oficiais atualizadas.</p>
<div id="utmModal" class="utm-modal" aria-hidden="true">
  <div class="utm-card" role="dialog" aria-modal="true" aria-labelledby="utmTitle">
    <div class="utm-header">
      <h2 id="utmTitle">Inserir coordenadas UTM — SIRGAS 2000</h2>
      <button id="btnCloseUtm" class="danger" type="button">Fechar</button>
    </div>
    <div class="utm-body">
      <div class="utm-grid">
        <div><label for="utmEasting">Este / Easting (m)</label><input id="utmEasting" type="number" step="0.001" placeholder="Ex.: 542350"></div>
        <div><label for="utmNorthing">Norte / Northing (m)</label><input id="utmNorthing" type="number" step="0.001" placeholder="Ex.: 9584320"></div>
        <div><label for="utmZone">Zona UTM</label><select id="utmZone"><option value="22">22S</option><option value="23">23S</option><option value="24" selected>24S</option><option value="25">25S</option></select></div>
        <div><label for="utmLabel">Identificação do ponto</label><input id="utmLabel" type="text" placeholder="Ex.: Ponto de vistoria"></div>
      </div>
      <div class="utm-actions"><button id="btnAddUtmPoint" type="button">Adicionar ponto</button><button id="btnCancelUtm" class="secondary" type="button">Cancelar</button></div>
      <div id="utmStatus" class="status-box" style="margin-top:12px">Informe as coordenadas em SIRGAS 2000 / UTM.</div>
    </div>
  </div>
</div>

</body></html>`;
  const reportDoc=new DOMParser().parseFromString(html,'text/html');
  reportDoc.querySelectorAll(
    ''+
    '#settingsModal,.settings-modal,.settings-card,.settings-header,.settings-body,.settings-section,#btnOpenSettings,#btnCloseSettings,#btnRefreshCatalog,#catalogBaseList,#catalogStatus,#utmModal,.utm-modal,.utm-card,.utm-header,.utm-body,.utm-grid,.utm-actions,#btnOpenUtm,#btnCloseUtm,#btnCancelUtm,#btnAddUtmPoint,#utmEasting,#utmNorthing,#utmZone,#utmLabel,#utmStatus'
  ).forEach(el=>el.remove());
  reportDoc.querySelectorAll('#utmModal,.utm-modal,.utm-card,.utm-header,.utm-body,.utm-grid,.utm-actions,#btnOpenUtm,#btnCloseUtm,#btnCancelUtm,#btnAddUtmPoint,#utmEasting,#utmNorthing,#utmZone,#utmLabel,#utmStatus').forEach(el=>el.remove());
  return '<!doctype html>\n'+reportDoc.documentElement.outerHTML;
}

document.getElementById('btnReport')?.addEventListener('click',async()=>{
  const button=document.getElementById('btnReport');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Gerando relatório...';

  try{
    const reportHtml=await buildReportHtml(button);
    download(
      'relatorio_checagem_areas_sensiveis.html',
      reportHtml,
      'text/html'
    );
  }catch(err){
    alert(err.message||err);
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});

function download(filename,content,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
loadBases();



