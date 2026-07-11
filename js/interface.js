function setAOI(gj,name,resetDraw=true){ aoi=normalizeFeature(gj); if(!aoi){alert('Não foi possível reconhecer a geometria.');return;} if(aoiLayer) map.removeLayer(aoiLayer); aoiLayer=L.geoJSON(aoi,{style:{color:'#0284c7',weight:3,fillColor:'#38bdf8',fillOpacity:.18}}).addTo(map); if(aoiLayer.bringToFront)aoiLayer.bringToFront(); if(resetDraw) {drawGroup.clearLayers(); L.geoJSON(aoi).eachLayer(l=>drawGroup.addLayer(l));} try{map.fitBounds(aoiLayer.getBounds(),{padding:[25,25]});}catch(e){} document.getElementById('aoiBadge').className='pill ok'; document.getElementById('aoiBadge').textContent=name||'definida'; document.getElementById('aoiArea').textContent=fmt(areaHa(aoi)); document.getElementById('aoiFeatCount').textContent='1'; results=[]; renderResults(); }
btnClearAoi.onclick=()=>{aoi=null; if(aoiLayer) map.removeLayer(aoiLayer); drawGroup.clearLayers(); hitLayerGroup.clearLayers(); aoiBadge.className='pill gray'; aoiBadge.textContent='não definida'; aoiArea.textContent='0,0000'; aoiFeatCount.textContent='0';};
btnZoomAoi.onclick=()=>{if(aoiLayer)map.fitBounds(aoiLayer.getBounds(),{padding:[25,25]})};
btnFitCeara.onclick=()=>map.fitBounds([[-7.9,-41.5],[-2.7,-37.0]],{padding:[20,20]});
btnToggleBases.onclick=(ev)=>{ev.stopPropagation();document.getElementById('wmsPanel').classList.toggle('open');};
document.getElementById('btnShowAllWms').onclick=()=>setAllWmsVisibility(true);
document.getElementById('btnHideAllWms').onclick=()=>setAllWmsVisibility(false);
document.getElementById('baseMapSelect').onchange=e=>{if(currentBaseMap)map.removeLayer(currentBaseMap);currentBaseMap=baseMaps[e.target.value]||baseMaps.osm;currentBaseMap.addTo(map);currentBaseMap.bringToBack();};
document.getElementById('wmsOpacity').oninput=e=>{const opacity=Number(e.target.value)/100;document.getElementById('wmsOpacityValue').textContent=e.target.value+'%';wmsLayers.forEach(layer=>layer.setOpacity(opacity));vectorVisualLayers.forEach((layer,id)=>{const b=bases.find(x=>x.id===id);if(b)setVectorLayerOpacity(layer,b);});};
document.addEventListener('click',e=>{const panel=document.getElementById('wmsPanel');const toolbar=document.querySelector('.toolbar-top');if(panel.classList.contains('open')&&!toolbar.contains(e.target))panel.classList.remove('open');});


let SQL_PROMISE=null;
const gpkgCache={};
