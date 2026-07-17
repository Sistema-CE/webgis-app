
const referencePointGroup=L.layerGroup().addTo(map);
let referencePoints=[];
const LS_REFERENCE_POINTS='webgis_geo_reference_points_v2';

function saveReferencePoints(){
  localStorage.setItem(LS_REFERENCE_POINTS,JSON.stringify(referencePoints));
}

function formatCoordinate(value,decimals=6){
  return Number(value).toLocaleString('pt-BR',{
    minimumFractionDigits:decimals,
    maximumFractionDigits:decimals
  });
}

function getUtmProj(zone){
  return `+proj=utm +zone=${zone} +south +ellps=GRS80 +units=m +no_defs`;
}

function latLngToUtm(lat,lng,zone){
  const result=proj4('EPSG:4326',getUtmProj(zone),[lng,lat]);
  return {easting:result[0],northing:result[1]};
}

function utmToLatLng(easting,northing,zone){
  const result=proj4(getUtmProj(zone),'EPSG:4326',[easting,northing]);
  return {lng:result[0],lat:result[1]};
}

function pointPopupHtml(point){
  const utm=latLngToUtm(point.lat,point.lng,point.zone||24);
  return `
    <div class="point-popup-table">
      <b>${escapeHtml(point.label||'Ponto de referência')}</b><br>
      Latitude: ${formatCoordinate(point.lat)}<br>
      Longitude: ${formatCoordinate(point.lng)}<br>
      UTM ${point.zone||24}S — E: ${formatCoordinate(utm.easting,2)} m<br>
      UTM ${point.zone||24}S — N: ${formatCoordinate(utm.northing,2)} m
      ${point.accuracy?`<br>Precisão estimada: ${formatCoordinate(point.accuracy,1)} m`:''}
      <br>Origem: ${escapeHtml(point.source||'Manual')}
    </div>`;
}

function renderReferencePoints(){
  referencePointGroup.clearLayers();

  referencePoints.forEach(point=>{
    L.marker([point.lat,point.lng],{
      title:point.label||'Ponto de referência'
    }).bindPopup(pointPopupHtml(point)).addTo(referencePointGroup);
  });

  const status=document.getElementById('pointStatus');
  if(status){
    status.textContent=referencePoints.length
      ? `${referencePoints.length} ponto(s) de referência adicionado(s).`
      : 'Nenhum ponto de referência adicionado.';
  }

  renderReferencePointList();
}

function addReferencePoint(point,zoom=true){
  referencePoints.push({
    id:point.id||uid(),
    label:point.label||`Ponto ${referencePoints.length+1}`,
    lat:Number(point.lat),
    lng:Number(point.lng),
    zone:Number(point.zone||24),
    accuracy:point.accuracy?Number(point.accuracy):null,
    source:point.source||'Manual',
    createdAt:point.createdAt||new Date().toISOString()
  });
  saveReferencePoints();
  renderReferencePoints();
  if(zoom) map.setView([point.lat,point.lng],Math.max(map.getZoom(),16));
}

function loadReferencePoints(){
  try{
    const saved=JSON.parse(localStorage.getItem(LS_REFERENCE_POINTS)||'[]');
    if(Array.isArray(saved)) referencePoints=saved;
  }catch(error){
    referencePoints=[];
  }
  renderReferencePoints();
}

function ensureReferencePointsModal(){
  let modal=document.getElementById('referencePointsModal');
  if(modal) return modal;

  modal=document.createElement('div');
  modal.id='referencePointsModal';
  modal.className='settings-modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`
    <div class="settings-card reference-points-card" role="dialog" aria-modal="true">
      <div class="settings-header">
        <h2>📍 Pontos de Referência</h2>
        <button id="btnCloseReferencePoints" class="settings-close" type="button">Fechar</button>
      </div>
      <div class="settings-body">
        <section class="settings-section">
          <h3>Adicionar ponto</h3>
          <div class="reference-action-grid">
            <button id="btnGpsLocation" type="button">📍 Minha Localização</button>
            <button id="btnToggleCoordinateForm" class="secondary" type="button">⌨️ Inserir Coordenadas</button>
            <button id="btnClearPoints" class="danger" type="button">🗑️ Limpar Pontos</button>
          </div>
          <div id="referencePointActionStatus" class="catalog-status"></div>
        </section>

        <section id="coordinateFormSection" class="settings-section" hidden>
          <h3>Inserir Coordenadas UTM — SIRGAS 2000</h3>
          <div class="utm-form-grid">
            <label>Nome do ponto
              <input id="utmLabel" type="text" placeholder="Ex.: Acesso principal">
            </label>
            <label>Fuso
              <select id="utmZone">
                <option value="24">24S</option>
                <option value="23">23S</option>
                <option value="25">25S</option>
              </select>
            </label>
            <label>Este (E)
              <input id="utmEasting" type="number" step="0.01" placeholder="Ex.: 637765">
            </label>
            <label>Norte (N)
              <input id="utmNorthing" type="number" step="0.01" placeholder="Ex.: 9464835">
            </label>
          </div>
          <button id="btnAddUtmPoint" type="button">Adicionar ponto UTM</button>
          <div id="utmStatus" class="catalog-status"></div>
        </section>

        <section class="settings-section">
          <h3>Pontos adicionados</h3>
          <div id="referencePointList" class="reference-point-list"></div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelector('#btnCloseReferencePoints')?.addEventListener('click',closeReferencePointsModal);
  modal.querySelector('#btnToggleCoordinateForm')?.addEventListener('click',()=>{
    const section=modal.querySelector('#coordinateFormSection');
    section.hidden=!section.hidden;
    if(!section.hidden) modal.querySelector('#utmLabel')?.focus();
  });

  modal.querySelector('#btnGpsLocation')?.addEventListener('click',getDeviceLocation);
  modal.querySelector('#btnAddUtmPoint')?.addEventListener('click',addUtmPointFromForm);
  modal.querySelector('#btnClearPoints')?.addEventListener('click',()=>{
    if(!referencePoints.length) return;
    if(!confirm('Remover todos os pontos de referência?')) return;
    referencePoints=[];
    saveReferencePoints();
    renderReferencePoints();
  });

  modal.addEventListener('click',event=>{
    if(event.target===modal) closeReferencePointsModal();
  });

  return modal;
}

function openReferencePointsModal(){
  const modal=ensureReferencePointsModal();
  renderReferencePointList();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('settings-modal-open');
}

function closeReferencePointsModal(){
  const modal=document.getElementById('referencePointsModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('settings-modal-open');
}

function renderReferencePointList(){
  const list=document.getElementById('referencePointList');
  if(!list) return;

  list.innerHTML='';
  if(!referencePoints.length){
    list.innerHTML='<div class="catalog-status">Nenhum ponto de referência adicionado.</div>';
    return;
  }

  referencePoints.forEach((point,index)=>{
    const item=document.createElement('div');
    item.className='reference-point-item';
    item.innerHTML=`
      <div class="reference-point-main">
        <input class="reference-point-name" type="text" value="${escapeHtml(point.label||`Ponto ${index+1}`)}" aria-label="Nome do ponto">
        <small>${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)} — ${escapeHtml(point.source||'Manual')}</small>
      </div>
      <div class="reference-point-actions">
        <button class="zoom-point secondary" type="button">Localizar</button>
        <button class="delete-point danger" type="button">Excluir</button>
      </div>`;

    item.querySelector('.reference-point-name')?.addEventListener('change',event=>{
      point.label=String(event.target.value||'').trim()||`Ponto ${index+1}`;
      saveReferencePoints();
      renderReferencePoints();
    });

    item.querySelector('.zoom-point')?.addEventListener('click',()=>{
      map.setView([point.lat,point.lng],Math.max(map.getZoom(),17));
      referencePointGroup.eachLayer(layer=>{
        const latlng=layer.getLatLng?.();
        if(latlng&&Math.abs(latlng.lat-point.lat)<1e-9&&Math.abs(latlng.lng-point.lng)<1e-9){
          layer.openPopup?.();
        }
      });
    });

    item.querySelector('.delete-point')?.addEventListener('click',()=>{
      referencePoints=referencePoints.filter(current=>current.id!==point.id);
      saveReferencePoints();
      renderReferencePoints();
    });

    list.appendChild(item);
  });
}

function getDeviceLocation(){
  const status=document.getElementById('referencePointActionStatus');

  if(!navigator.geolocation){
    alert('Este dispositivo ou navegador não oferece suporte à localização.');
    return;
  }
  if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.protocol!=='file:'){
    alert('A localização do dispositivo exige acesso por HTTPS.');
    return;
  }

  if(status) status.textContent='Obtendo localização do dispositivo...';

  navigator.geolocation.getCurrentPosition(position=>{
    const {latitude,longitude,accuracy}=position.coords;
    addReferencePoint({
      label:`Localização ${referencePoints.length+1}`,
      lat:latitude,
      lng:longitude,
      zone:24,
      accuracy,
      source:'GPS / dispositivo'
    });
    if(status) status.textContent=`Localização adicionada. Precisão estimada: ${formatCoordinate(accuracy,1)} m.`;
  },error=>{
    const messages={
      1:'Permissão de localização negada.',
      2:'Localização indisponível.',
      3:'Tempo limite excedido ao obter localização.'
    };
    const message=messages[error.code]||error.message||'Falha ao obter localização.';
    if(status) status.textContent=message;
    alert(message);
  },{
    enableHighAccuracy:true,
    timeout:20000,
    maximumAge:0
  });
}

function addUtmPointFromForm(){
  const easting=Number(document.getElementById('utmEasting')?.value);
  const northing=Number(document.getElementById('utmNorthing')?.value);
  const zone=Number(document.getElementById('utmZone')?.value||24);
  const label=String(document.getElementById('utmLabel')?.value||'').trim()||`Ponto UTM ${referencePoints.length+1}`;
  const status=document.getElementById('utmStatus');

  if(!Number.isFinite(easting)||!Number.isFinite(northing)){
    if(status) status.textContent='Informe valores válidos para Este e Norte.';
    return;
  }
  if(easting<100000||easting>900000||northing<0||northing>10000000){
    if(status) status.textContent='As coordenadas estão fora da faixa UTM esperada.';
    return;
  }

  try{
    const {lat,lng}=utmToLatLng(easting,northing,zone);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){
      throw new Error('Conversão resultou em coordenadas inválidas.');
    }

    addReferencePoint({
      label,
      lat,
      lng,
      zone,
      source:'UTM SIRGAS 2000'
    });

    if(status) status.textContent=`Ponto adicionado: ${formatCoordinate(lat)}, ${formatCoordinate(lng)}.`;
    document.getElementById('utmEasting').value='';
    document.getElementById('utmNorthing').value='';
    document.getElementById('utmLabel').value='';
  }catch(error){
    if(status) status.textContent='Erro na conversão: '+(error.message||error);
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btnOpenReferencePoints')?.addEventListener('click',openReferencePointsModal);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById('referencePointsModal')?.classList.contains('open')){
      closeReferencePointsModal();
    }
  });
  loadReferencePoints();
});
