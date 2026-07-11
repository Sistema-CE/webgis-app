
(function(global){
  const engines=new Map();

  const context={
    territorial:null,
    municipios:[],
    anm:[]
  };

  function normalizeKey(value){
    return String(value||'generico').trim().toLowerCase();
  }

  function register(engine){
    if(!engine||!engine.id) throw new Error('Motor de análise sem identificador.');
    engines.set(normalizeKey(engine.id),engine);
    (engine.aliases||[]).forEach(alias=>engines.set(normalizeKey(alias),engine));
  }

  function resolve(base){
    const analysisType=normalizeKey(base?.analysisType||base?.tipoAnalise);
    const role=normalizeKey(base?.role||base?.papel);
    return engines.get(analysisType)||engines.get(role)||engines.get('generico');
  }

  function execute(base,features,aoiArea){
    const engine=resolve(base);
    if(!engine||typeof engine.analyze!=='function') return {};
    const output=engine.analyze({base,features,aoiArea})||{};
    return {
      engineId:engine.id,
      ...output
    };
  }

  function updateContext(result){
    const engine=engines.get(normalizeKey(result?.engineId))||resolve(result);
    if(engine&&typeof engine.updateContext==='function'){
      engine.updateContext({result,context});
    }
  }

  function rebuildContext(results){
    context.territorial=null;
    context.municipios=[];
    context.anm=[];
    (results||[]).forEach(updateContext);
    return context;
  }

  function dashboardBody(result){
    const engine=engines.get(normalizeKey(result?.engineId))||resolve(result);
    if(!engine||typeof engine.dashboard!=='function') return '';
    return engine.dashboard({result,context})||'';
  }

  function buildReportSections(results){
    const rendered=new Set();
    const sections=[];
    for(const result of (results||[])){
      const engine=engines.get(normalizeKey(result?.engineId))||resolve(result);
      if(!engine||rendered.has(engine.id)||typeof engine.report!=='function') continue;
      const html=engine.report({results,context});
      if(html) sections.push(html);
      rendered.add(engine.id);
    }
    return sections.join('');
  }

  global.WEBGIS_ANALYSIS={
    register,
    resolve,
    execute,
    updateContext,
    rebuildContext,
    dashboardBody,
    buildReportSections,
    getContext:()=>context,
    getTerritorialContext:()=>context.territorial,
    getMunicipios:()=>context.municipios,
    getAnm:()=>context.anm,
    listEngines:()=>[...new Set([...engines.values()])].map(engine=>engine.id)
  };

  global.WEBGIS=global.WEBGIS||{};
  global.WEBGIS.getTerritorialContext=()=>context.territorial;
  global.WEBGIS.getMunicipios=()=>context.municipios;
  global.WEBGIS.getAnm=()=>context.anm;
  global.WEBGIS.getAnalysisContext=()=>context;
})(window);
