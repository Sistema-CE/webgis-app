
const LS_ANALYSIS_PRESETS='webgis_geo_analysis_presets_v1';

function loadAnalysisPresets(){
  try{
    const value=JSON.parse(localStorage.getItem(LS_ANALYSIS_PRESETS)||'[]');
    return Array.isArray(value)?value:[];
  }catch(error){
    return [];
  }
}

function saveAnalysisPresets(presets){
  localStorage.setItem(LS_ANALYSIS_PRESETS,JSON.stringify(presets||[]));
}

function toggleSettingsSection(button,content,section){
  const open=button.getAttribute('aria-expanded')==='true';
  button.setAttribute('aria-expanded',String(!open));
  content.hidden=open;
  section?.classList.toggle('collapsed',open);
}

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
            <span><b>2. Todas as Bases</b><small>Lista alfabética e ativação direta</small></span>
            <span class="settings-section-chevron">⌄</span>
          </button>
          <div class="settings-section-content" id="allBasesContent" hidden>
            <div class="catalog-search-wrap">
              <label for="catalogBaseSearch">Buscar base</label>
              <input id="catalogBaseSearch" type="search" placeholder="Nome, fonte, categoria ou família...">
              <button id="btnClearCatalogSearch" class="secondary" type="button">Limpar</button>
            </div>
            <div id="allBasesCount" class="catalog-status"></div>
            <div id="allBasesAlphabeticalList" class="all-bases-list"></div>
          </div>
        </section>

        <section class="settings-section settings-collapsible collapsed" id="categoryBasesSection">
          <button class="settings-section-toggle" id="btnToggleCategoryBases" type="button" aria-expanded="false">
            <span><b>3. Bases Organizadas por Categoria</b><small>Organização temática, visualização e estilos</small></span>
            <span class="settings-section-chevron">⌄</span>
          </button>
          <div class="settings-section-content" id="categoryBasesContent" hidden>
            <p class="small">Ligue ou desligue bases por tema e ajuste seus estilos.</p>
            <div id="catalogBaseList" class="catalog-base-list"></div>
          </div>
        </section>

        <section class="settings-section settings-collapsible collapsed" id="presetsSection">
          <button class="settings-section-toggle" id="btnTogglePresets" type="button" aria-expanded="false">
            <span><b>4. Pré-configurações de Análise</b><small>Conjuntos de bases salvos neste navegador</small></span>
            <span class="settings-section-chevron">⌄</span>
          </button>
          <div class="settings-section-content" id="presetsContent" hidden>
            <div class="preset-create-row">
              <input id="presetName" type="text" maxlength="80" placeholder="Nome do preset">
              <button id="btnSavePreset" type="button">Salvar bases ligadas</button>
            </div>
            <p class="small">O preset guarda apenas quais bases estão ligadas para análise.</p>
            <div id="presetList" class="preset-list"></div>
          </div>
        </section>

      </div>
    </div>`;

  document.body.appendChild(modal);
  bindSettingsModalEvents(modal);
  return modal;
}

function syncBaseState(baseId,active){
  const base=bases.find(item=>item.id===baseId);
  if(!base) return;
  base.active=active;
  saveBases();
  renderBases();
  renderAllBasesAlphabetical(document.getElementById('catalogBaseSearch')?.value||'');
  renderAnalysisPresets();
  renderWms();
}

function renderAllBasesAlphabetical(filterText=''){
  const list=document.getElementById('allBasesAlphabeticalList');
  const count=document.getElementById('allBasesCount');
  if(!list) return;

  const filter=String(filterText||'').trim().toLowerCase();
  const filtered=bases.slice()
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'}))
    .filter(base=>!filter||[
      base.name,base.source,base.group,base.category,base.family,base.analysisType
    ].join(' ').toLowerCase().includes(filter));

  list.innerHTML='';
  filtered.forEach(base=>{
    const item=document.createElement('div');
    item.className='all-base-item all-base-toggle-item';
    item.innerHTML=`
      <div class="all-base-toggle-main">
        <div>
          <b>${escapeHtml(base.name||'Base sem nome')}</b>
          <small>${escapeHtml(base.source||'Fonte não informada')}</small>
        </div>
        <label class="switch" title="Ligar ou desligar para análise">
          <input type="checkbox" ${base.active?'checked':''}>
          <span class="slider"></span>
        </label>
      </div>
      <details>
        <summary>Ver informações</summary>
        <div class="all-base-details">
          <div><b>Categoria:</b> ${escapeHtml(base.category||'outras')}</div>
          <div><b>Família:</b> ${escapeHtml(base.family||'geral')}</div>
          <div><b>Grupo:</b> ${escapeHtml(base.group||'Outras Bases')}</div>
          <div><b>Tipo de análise:</b> ${escapeHtml(base.analysisType||'generico')}</div>
        </div>
      </details>`;
    item.querySelector('input').addEventListener('change',event=>{
      syncBaseState(base.id,event.target.checked);
    });
    list.appendChild(item);
  });

  if(!filtered.length){
    list.innerHTML='<div class="catalog-status">Nenhuma base encontrada.</div>';
  }
  if(count) count.textContent=`${filtered.length} de ${bases.length} base(s) exibidas.`;
}

function renderAnalysisPresets(){
  const list=document.getElementById('presetList');
  if(!list) return;
  const presets=loadAnalysisPresets();
  list.innerHTML='';

  if(!presets.length){
    list.innerHTML='<div class="catalog-status">Nenhum preset salvo.</div>';
    return;
  }

  presets
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}))
    .forEach(preset=>{
      const item=document.createElement('div');
      item.className='preset-item';
      const names=(preset.baseIds||[])
        .map(id=>bases.find(base=>base.id===id)?.name)
        .filter(Boolean);

      item.innerHTML=`
        <div class="preset-info">
          <b>${escapeHtml(preset.name)}</b>
          <small>${names.length} base(s): ${escapeHtml(names.slice(0,4).join(', '))}${names.length>4?'…':''}</small>
        </div>
        <div class="preset-actions">
          <button class="apply-preset" type="button">Aplicar</button>
          <button class="delete-preset danger" type="button">Excluir</button>
        </div>`;

      item.querySelector('.apply-preset').addEventListener('click',()=>{
        const activeIds=new Set(preset.baseIds||[]);
        bases.forEach(base=>base.active=activeIds.has(base.id));
        saveBases();
        renderBases();
        renderAllBasesAlphabetical(document.getElementById('catalogBaseSearch')?.value||'');
        renderAnalysisPresets();
        renderWms();
      });

      item.querySelector('.delete-preset').addEventListener('click',()=>{
        if(!confirm(`Excluir o preset "${preset.name}"?`)) return;
        saveAnalysisPresets(loadAnalysisPresets().filter(item=>item.id!==preset.id));
        renderAnalysisPresets();
      });

      list.appendChild(item);
    });
}

function bindSettingsModalEvents(modal){
  modal.querySelector('#btnCloseSettings')?.addEventListener('click',closeSettingsModal);

  [
    ['#btnToggleAllBases','#allBasesContent','#allBasesSection'],
    ['#btnToggleCategoryBases','#categoryBasesContent','#categoryBasesSection'],
    ['#btnTogglePresets','#presetsContent','#presetsSection']
  ].forEach(([buttonSelector,contentSelector,sectionSelector])=>{
    const button=modal.querySelector(buttonSelector);
    button?.addEventListener('click',()=>{
      toggleSettingsSection(button,modal.querySelector(contentSelector),modal.querySelector(sectionSelector));
    });
  });

  const search=modal.querySelector('#catalogBaseSearch');
  search?.addEventListener('input',()=>renderAllBasesAlphabetical(search.value));
  modal.querySelector('#btnClearCatalogSearch')?.addEventListener('click',()=>{
    search.value='';
    renderAllBasesAlphabetical('');
    search.focus();
  });

  modal.querySelector('#btnSavePreset')?.addEventListener('click',()=>{
    const input=modal.querySelector('#presetName');
    const name=String(input.value||'').trim();
    if(!name){
      alert('Informe um nome para o preset.');
      input.focus();
      return;
    }
    const presets=loadAnalysisPresets();
    const normalized=name.toLowerCase();
    const existing=presets.find(item=>item.name.toLowerCase()===normalized);
    const preset={
      id:existing?.id||`preset_${Date.now()}`,
      name,
      baseIds:bases.filter(base=>base.active).map(base=>base.id),
      updatedAt:new Date().toISOString()
    };
    const updated=existing
      ? presets.map(item=>item.id===existing.id?preset:item)
      : [...presets,preset];
    saveAnalysisPresets(updated);
    input.value='';
    renderAnalysisPresets();
  });

  const refreshButton=modal.querySelector('#btnRefreshCatalog');
  refreshButton?.addEventListener('click',async()=>{
    const original=refreshButton.textContent;
    const status=modal.querySelector('#catalogStatus');
    refreshButton.disabled=true;
    refreshButton.textContent='Atualizando catálogo...';
    try{
      const updated=await fetchCatalogOnline();
      bases=updated.map(base=>({...base,active:false,visible:false}));
      saveBases();
      renderBases();
      renderAllBasesAlphabetical(search?.value||'');
      renderAnalysisPresets();
      renderWms();
      if(status) status.textContent=`Catálogo atualizado: ${bases.length} base(s), todas desligadas.`;
    }catch(error){
      if(status) status.textContent='Falha ao atualizar: '+(error.message||error);
      alert('Falha ao atualizar o catálogo: '+(error.message||error));
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
  renderAnalysisPresets();
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
  if(openButton&&!openButton.dataset.bound){
    openButton.dataset.bound='1';
    openButton.addEventListener('click',event=>{
      event.preventDefault();
      openSettingsModal();
    });
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById('settingsModal')?.classList.contains('open')){
      closeSettingsModal();
    }
  });
});
