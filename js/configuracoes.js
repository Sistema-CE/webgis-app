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
        <section class="settings-section">
          <h3>2. Bases disponíveis para análise</h3>
          <p class="small">Ligue ou desligue cada base. Somente as bases ligadas serão usadas na análise e no relatório.</p>
          <div id="catalogBaseList" class="catalog-base-list"></div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(modal);
  bindSettingsModalEvents(modal);
  return modal;
}

function bindSettingsModalEvents(modal){
  const closeButton=modal.querySelector('#btnCloseSettings');
  const refreshButton=modal.querySelector('#btnRefreshCatalog');

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


