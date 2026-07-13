function ensureSettingsModal(){
  let modal=document.getElementById('settingsModal');
  if(modal) return modal;

  modal=document.createElement('div');
  modal.id='settingsModal';
  modal.className='settings-modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`
    <div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <div class="settings-header">
        <h2 id="settingsTitle">⚙️ Configurações do Catálogo</h2>
        <button id="btnCloseSettings" class="settings-close" type="button">Fechar</button>
      </div>
      <div class="settings-body">
        <section class="settings-section">
          <h3>1. Catálogo Online</h3>
          <p class="small">Atualize a lista de bases diretamente do catálogo hospedado no GitHub.</p>
          <button id="btnRefreshCatalog" class="block" type="button">Atualizar Catálogo Online</button>
          <div id="catalogStatus" class="catalog-status">Catálogo carregado automaticamente ao iniciar.</div>
        </section>
        <section class="settings-section settings-collapsible collapsed" id="allBasesSection">
          <button class="settings-section-toggle" id="btnToggleAllBases" type="button" aria-expanded="false">
            <span>
              <b>2. Todas as Bases</b>
              <small>Lista alfabética completa do catálogo</small>
            </span>
            <span class="settings-section-chevron">⌄</span>
          </button>
          <div class="settings-section-content" id="allBasesContent" hidden>
            <div class="catalog-search-wrap">
              <label for="catalogBaseSearch">Buscar base</label>
              <input id="catalogBaseSearch" type="search" placeholder="Digite o nome, fonte, categoria ou família...">
              <button id="btnClearCatalogSearch" class="secondary" type="button">Limpar</button>
            </div>
            <div id="allBasesCount" class="catalog-status"></div>
            <div id="allBasesAlphabeticalList" class="all-bases-list"></div>
          </div>
        </section>

        <section class="settings-section">
          <h3>3. Bases Organizadas por Categoria</h3>
          <p class="small">As bases são agrupadas por tema. Ligue ou desligue as que participarão da análise e ajuste seus estilos.</p>
          <div id="catalogBaseList" class="catalog-base-list"></div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(modal);
  bindSettingsModalEvents(modal);
  return modal;
}


function renderAllBasesAlphabetical(filterText=''){
  const list=document.getElementById('allBasesAlphabeticalList');
  const count=document.getElementById('allBasesCount');
  if(!list) return;

  const filter=String(filterText||'').trim().toLowerCase();
  const sorted=bases.slice().sort((a,b)=>
    String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'})
  );

  const filtered=sorted.filter(base=>{
    if(!filter) return true;
    const haystack=[
      base.name,
      base.source,
      base.group,
      base.category,
      base.family,
      base.analysisType
    ].join(' ').toLowerCase();
    return haystack.includes(filter);
  });

  list.innerHTML='';
  if(!filtered.length){
    list.innerHTML='<div class="catalog-status">Nenhuma base encontrada para esta busca.</div>';
  }else{
    filtered.forEach(base=>{
      const item=document.createElement('details');
      item.className='all-base-item';
      item.innerHTML=`
        <summary>
          <span>
            <b>${escapeHtml(base.name||'Base sem nome')}</b>
            <small>${escapeHtml(base.source||'Fonte não informada')}</small>
          </span>
          <span class="all-base-state ${base.active?'active':'inactive'}">${base.active?'LIGADA':'DESLIGADA'}</span>
        </summary>
        <div class="all-base-details">
          <div><b>Categoria:</b> ${escapeHtml(base.category||'outras')}</div>
          <div><b>Família:</b> ${escapeHtml(base.family||'geral')}</div>
          <div><b>Grupo:</b> ${escapeHtml(base.group||'Outras Bases')}</div>
          <div><b>Tipo de análise:</b> ${escapeHtml(base.analysisType||'generico')}</div>
          <div><b>Formato:</b> ${escapeHtml(base.type||'geojson')}</div>
        </div>`;
      list.appendChild(item);
    });
  }

  if(count){
    count.textContent=`${filtered.length} de ${bases.length} base(s) exibidas.`;
  }
}

function bindAllBasesSection(modal){
  const section=modal.querySelector('#allBasesSection');
  const toggle=modal.querySelector('#btnToggleAllBases');
  const content=modal.querySelector('#allBasesContent');
  const search=modal.querySelector('#catalogBaseSearch');
  const clear=modal.querySelector('#btnClearCatalogSearch');

  toggle?.addEventListener('click',()=>{
    const open=toggle.getAttribute('aria-expanded')==='true';
    toggle.setAttribute('aria-expanded',String(!open));
    content.hidden=open;
    section?.classList.toggle('collapsed',open);
    if(!open){
      renderAllBasesAlphabetical(search?.value||'');
      setTimeout(()=>search?.focus(),0);
    }
  });

  search?.addEventListener('input',()=>renderAllBasesAlphabetical(search.value));
  clear?.addEventListener('click',()=>{
    if(search) search.value='';
    renderAllBasesAlphabetical('');
    search?.focus();
  });
}

function bindSettingsModalEvents(modal){
  const closeButton=modal.querySelector('#btnCloseSettings');
  const refreshButton=modal.querySelector('#btnRefreshCatalog');
  bindAllBasesSection(modal);

  closeButton?.addEventListener('click',closeSettingsModal);

  refreshButton?.addEventListener('click',async()=>{
    const original=refreshButton.textContent;
    const status=modal.querySelector('#catalogStatus');
    refreshButton.disabled=true;
    refreshButton.textContent='Atualizando catálogo...';
    if(status) status.textContent='Consultando catálogo online...';

    try{
      const previousState=new Map(bases.map(base=>[base.id,base.active]));
      const updated=await fetchCatalogOnline();
      bases=updated.map(base=>({
        ...base,
        active:previousState.has(base.id)?previousState.get(base.id):base.active
      }));
      saveBases();
      renderBases();
      renderAllBasesAlphabetical(modal.querySelector('#catalogBaseSearch')?.value||'');
      renderWms();
      if(status) status.textContent=`Catálogo atualizado: ${bases.length} base(s) disponíveis.`;
    }catch(err){
      if(status) status.textContent='Falha ao atualizar: '+(err.message||err);
      alert('Falha ao atualizar o catálogo: '+(err.message||err));
    }finally{
      refreshButton.disabled=false;
      refreshButton.textContent=original;
    }
  });

  modal.addEventListener('click',event=>{
    if(event.target===modal) closeSettingsModal();
  });
}

function openSettingsModal(){
  const modal=ensureSettingsModal();
  renderBases();
  renderAllBasesAlphabetical(modal.querySelector('#catalogBaseSearch')?.value||'');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('settings-modal-open');
}

function closeSettingsModal(){
  const modal=document.getElementById('settingsModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('settings-modal-open');
}

window.addEventListener('DOMContentLoaded',()=>{
  const openButton=document.getElementById('btnOpenSettings');
  if(openButton && !openButton.dataset.bound){
    openButton.dataset.bound='1';
    openButton.addEventListener('click',event=>{
      event.preventDefault();
      openSettingsModal();
    });
  }

  document.addEventListener('keydown',event=>{
    const modal=document.getElementById('settingsModal');
    if(event.key==='Escape' && modal?.classList.contains('open')){
      closeSettingsModal();
    }
  });
});


