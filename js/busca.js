
const featureSearchLayer=L.layerGroup().addTo(map);
const addressSearchLayer=L.layerGroup().addTo(map);
const addressSearchCache=new Map();
let featureSearchResults=[];

function ensureSearchModal(){
  let modal=document.getElementById('searchModal');
  if(modal) return modal;

  modal=document.createElement('div');
  modal.id='searchModal';
  modal.className='settings-modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`
    <div class="settings-card search-card" role="dialog" aria-modal="true">
      <div class="settings-header">
        <h2>🔎 Busca</h2>
        <button id="btnCloseSearch" class="settings-close" type="button">Fechar</button>
      </div>

      <div class="search-tabs" role="tablist">
        <button class="search-tab active" data-tab="bases" type="button">Buscar nas Bases</button>
        <button class="search-tab" data-tab="mapa" type="button">Buscar no Mapa</button>
      </div>

      <div class="settings-body">
        <section id="searchBasesPanel" class="search-panel">
          <div class="search-form-grid">
            <label>Base
              <select id="featureSearchBase"></select>
            </label>
            <label>Termo
              <input id="featureSearchText" type="search" placeholder="Município, açude, processo ANM, APA...">
            </label>
          </div>
          <div class="search-action-row">
            <button id="btnRunFeatureSearch" type="button">Buscar nas Bases</button>
            <button id="btnClearFeatureSearch" class="secondary" type="button">Limpar resultados</button>
          </div>
          <p class="small">A busca verifica os atributos da base selecionada. Bases grandes podem levar alguns segundos no primeiro uso.</p>
          <div id="featureSearchStatus" class="catalog-status"></div>
          <div id="featureSearchResults" class="search-results-list"></div>
        </section>

        <section id="searchMapPanel" class="search-panel" hidden>
          <div class="search-map-row">
            <input id="addressSearchText" type="search" placeholder="Endereço, localidade, município ou ponto de interesse">
            <button id="btnRunAddressSearch" type="button">Buscar no Mapa</button>
          </div>
          <p class="small">Pesquisa geográfica baseada nos dados do OpenStreetMap. Faça buscas pontuais, não automatizadas.</p>
          <div id="addressSearchStatus" class="catalog-status"></div>
          <div id="addressSearchResults" class="search-results-list"></div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelector('#btnCloseSearch')?.addEventListener('click',closeSearchModal);
  modal.querySelectorAll('.search-tab').forEach(button=>{
    button.addEventListener('click',()=>switchSearchTab(button.dataset.tab));
  });

  modal.querySelector('#btnRunFeatureSearch')?.addEventListener('click',runFeatureSearch);
  modal.querySelector('#featureSearchText')?.addEventListener('keydown',event=>{
    if(event.key==='Enter') runFeatureSearch();
  });
  modal.querySelector('#btnClearFeatureSearch')?.addEventListener('click',()=>{
    featureSearchLayer.clearLayers();
    featureSearchResults=[];
    modal.querySelector('#featureSearchResults').innerHTML='';
    modal.querySelector('#featureSearchStatus').textContent='';
  });

  modal.querySelector('#btnRunAddressSearch')?.addEventListener('click',runAddressSearch);
  modal.querySelector('#addressSearchText')?.addEventListener('keydown',event=>{
    if(event.key==='Enter') runAddressSearch();
  });

  modal.addEventListener('click',event=>{
    if(event.target===modal) closeSearchModal();
  });

  return modal;
}

function openSearchModal(){
  const modal=ensureSearchModal();
  populateFeatureSearchBases();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('settings-modal-open');
}

function closeSearchModal(){
  const modal=document.getElementById('searchModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('settings-modal-open');
}

function switchSearchTab(tab){
  document.querySelectorAll('#searchModal .search-tab').forEach(button=>{
    button.classList.toggle('active',button.dataset.tab===tab);
  });
  document.getElementById('searchBasesPanel').hidden=tab!=='bases';
  document.getElementById('searchMapPanel').hidden=tab!=='mapa';
}

function populateFeatureSearchBases(){
  const select=document.getElementById('featureSearchBase');
  if(!select) return;

  const previous=select.value;
  const searchable=bases
    .filter(base=>base.url&&base.type!=='wms')
    .slice()
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR',{sensitivity:'base'}));

  select.innerHTML='<option value="">Selecione uma base</option>';
  searchable.forEach(base=>{
    const option=document.createElement('option');
    option.value=base.id;
    option.textContent=base.name;
    select.appendChild(option);
  });
  if(searchable.some(base=>base.id===previous)) select.value=previous;
}

function featureSearchText(feature){
  const properties=feature.properties||{};
  return Object.values(properties)
    .filter(value=>value!==null&&value!==undefined)
    .map(value=>String(value))
    .join(' ')
    .toLowerCase();
}

function preferredFeatureName(feature,base){
  const properties=feature.properties||{};
  const preferred=[
    base.nameField,
    base.codeField,
    'nmoriginal','noriocomp','NM_MUN','DSProcesso',
    'nome_uc','NOME','nome','Name','NAME'
  ];
  for(const field of preferred){
    if(field&&properties[field]!==undefined&&properties[field]!==null&&String(properties[field]).trim()){
      return String(properties[field]).trim();
    }
  }
  return featureLabel(feature,base);
}

async function runFeatureSearch(){
  const baseId=document.getElementById('featureSearchBase')?.value;
  const query=String(document.getElementById('featureSearchText')?.value||'').trim().toLowerCase();
  const status=document.getElementById('featureSearchStatus');
  const resultsContainer=document.getElementById('featureSearchResults');

  if(!baseId){
    status.textContent='Selecione uma base.';
    return;
  }
  if(query.length<2){
    status.textContent='Digite ao menos dois caracteres.';
    return;
  }

  const base=bases.find(item=>item.id===baseId);
  if(!base) return;

  status.textContent=`Carregando ${base.name}...`;
  resultsContainer.innerHTML='';

  try{
    const collection=await fetchBaseFeatures(base);
    const matches=(collection.features||[])
      .filter(feature=>featureSearchText(feature).includes(query))
      .slice(0,100)
      .map((feature,index)=>({
        id:`search_${base.id}_${index}`,
        base,
        feature,
        name:preferredFeatureName(feature,base)
      }));

    featureSearchResults=matches;
    status.textContent=matches.length
      ? `${matches.length} resultado(s) encontrado(s)${matches.length===100?' — limite de exibição atingido':''}.`
      : 'Nenhuma feição encontrada.';

    renderFeatureSearchResults();
  }catch(error){
    status.textContent='Falha na busca: '+(error.message||error);
  }
}

function renderFeatureSearchResults(){
  const container=document.getElementById('featureSearchResults');
  if(!container) return;
  container.innerHTML='';

  featureSearchResults.forEach(result=>{
    const item=document.createElement('div');
    item.className='search-result-item';
    item.innerHTML=`
      <div class="search-result-info">
        <b>${escapeHtml(result.name)}</b>
        <small>${escapeHtml(result.base.name)}</small>
      </div>
      <div class="search-result-actions">
        <button class="load-feature" type="button">Carregar</button>
        <button class="download-feature secondary" type="button">Baixar</button>
      </div>`;

    item.querySelector('.load-feature')?.addEventListener('click',()=>loadSingleFeature(result));
    item.querySelector('.download-feature')?.addEventListener('click',()=>downloadSingleFeature(result));
    container.appendChild(item);
  });
}

function loadSingleFeature(result){
  featureSearchLayer.clearLayers();

  const style=visualStyle(result.base);
  const layer=L.geoJSON(result.feature,{
    style,
    pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{
      radius:7,
      color:style.color||'#0f766e',
      weight:3,
      fillColor:style.fillColor||style.color||'#14b8a6',
      fillOpacity:.8
    }),
    onEachFeature:(feature,leafletLayer)=>{
      leafletLayer.bindPopup(`<b>${escapeHtml(result.name)}</b><br>${escapeHtml(result.base.name)}`);
    }
  }).addTo(featureSearchLayer);

  try{
    const bounds=layer.getBounds();
    if(bounds.isValid()) map.fitBounds(bounds.pad(.25),{maxZoom:17});
    layer.eachLayer(child=>child.openPopup?.());
  }catch(error){}
}

function downloadSingleFeature(result){
  const content={
    type:'FeatureCollection',
    name:result.name,
    features:[result.feature]
  };
  const blob=new Blob([JSON.stringify(content,null,2)],{type:'application/geo+json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  const filename=String(result.name||'feicao')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .toLowerCase()||'feicao';
  anchor.href=url;
  anchor.download=`${filename}.geojson`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function runAddressSearch(){
  const query=String(document.getElementById('addressSearchText')?.value||'').trim();
  const status=document.getElementById('addressSearchStatus');
  const container=document.getElementById('addressSearchResults');

  if(query.length<3){
    status.textContent='Digite ao menos três caracteres.';
    return;
  }

  status.textContent='Buscando no mapa...';
  container.innerHTML='';

  try{
    let results=addressSearchCache.get(query.toLowerCase());
    if(!results){
      const params=new URLSearchParams({
        q:query,
        format:'jsonv2',
        addressdetails:'1',
        limit:'7',
        countrycodes:'br',
        'accept-language':'pt-BR'
      });
      const response=await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,{
        headers:{'Accept':'application/json'}
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      results=await response.json();
      addressSearchCache.set(query.toLowerCase(),results);
    }

    status.textContent=results.length
      ? `${results.length} resultado(s) encontrado(s).`
      : 'Nenhum endereço encontrado.';

    results.forEach(result=>{
      const item=document.createElement('div');
      item.className='search-result-item';
      item.innerHTML=`
        <div class="search-result-info">
          <b>${escapeHtml(result.display_name||'Local encontrado')}</b>
          <small>OpenStreetMap / Nominatim</small>
        </div>
        <div class="search-result-actions">
          <button type="button">Localizar</button>
        </div>`;

      item.querySelector('button')?.addEventListener('click',()=>{
        const lat=Number(result.lat);
        const lng=Number(result.lon);
        addressSearchLayer.clearLayers();

        if(result.geojson){
          const layer=L.geoJSON({
            type:'Feature',
            properties:{name:result.display_name},
            geometry:result.geojson
          },{
            style:{color:'#be123c',weight:4,fillColor:'#fb7185',fillOpacity:.18}
          }).addTo(addressSearchLayer);
          try{
            const bounds=layer.getBounds();
            if(bounds.isValid()) map.fitBounds(bounds.pad(.25),{maxZoom:17});
          }catch(error){
            map.setView([lat,lng],17);
          }
        }else{
          L.marker([lat,lng]).bindPopup(escapeHtml(result.display_name)).addTo(addressSearchLayer).openPopup();
          map.setView([lat,lng],17);
        }
      });

      container.appendChild(item);
    });
  }catch(error){
    status.textContent='Falha na busca de endereço: '+(error.message||error);
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btnOpenSearch')?.addEventListener('click',openSearchModal);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById('searchModal')?.classList.contains('open')){
      closeSearchModal();
    }
  });
});
