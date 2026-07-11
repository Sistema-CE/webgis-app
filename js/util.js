function uid(){return Math.random().toString(36).slice(2,10)}
function log(el,msg){document.getElementById(el).textContent=msg}
function fmt(n,d=4){return (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})}
function areaHa(gj){try{return turf.area(gj)/10000}catch(e){return 0}}
function boundsOf(gj){return turf.bbox(gj)}
function normalizeFeature(gj){ if(!gj) return null; if(gj.type==='FeatureCollection'){ if(gj.features.length===1) return gj.features[0]; return turf.combine(gj).features[0]; } if(gj.type==='Feature') return gj; return {type:'Feature',properties:{},geometry:gj}; }
function getParam(url,k){try{return new URL(url).searchParams.get(k)||new URL(url).searchParams.get(k.toUpperCase())||new URL(url).searchParams.get(k.toLowerCase())}catch(e){return ''}}
function stripToEndpoint(url){
  let u=new URL(url); let path=u.origin+u.pathname;
  // GeoServer geralmente aceita /ows para WMS e WFS. Se a URL veio de GetMap (/wms), troca para /ows.
  if(path.toLowerCase().endsWith('/wms')) path=path.slice(0,-4)+'/ows';
  return path;
}
function guessLayer(url){return getParam(url,'layers')||getParam(url,'typeName')||getParam(url,'typename')||getParam(url,'typeNames')||getParam(url,'layer')||''}
function wmsTileUrl(url){return stripToEndpoint(url).replace('/ows','/wms')}
function workspaceFromEndpoint(url){
  try{ const parts=new URL(stripToEndpoint(url)).pathname.split('/').filter(Boolean); const i=parts.findIndex(p=>p.toLowerCase()==='geoserver'); if(i>=0 && parts[i+1] && !['ows','wms','wfs'].includes(parts[i+1].toLowerCase())) return parts[i+1]; }catch(e){}
  return '';
}
function vectorLayerName(base){
  let layer=base.wfsLayer||base.layer||guessLayer(base.url)||'';
  if(!layer) return '';
  // Se o servidor GeoServer usa workspace na URL (/geoserver/inde/ows) e a layer veio sem prefixo, aplica o namespace automaticamente.
  const ws=workspaceFromEndpoint(base.url);
  if(ws && !layer.includes(':')) layer=ws+':'+layer;
  return layer;
}
function buildWfsUrl(base,bbox,opts={}){
  const layer=vectorLayerName(base); const ep=stripToEndpoint(base.url);
  if(!layer) throw new Error('Base sem camada vetorial configurada. Informe o typeName/layer WFS.');
  const version=opts.version||'1.0.0'; const typeKey=version==='2.0.0'?'typeNames':'typeName';
  const p=new URLSearchParams({service:'WFS',version,request:'GetFeature',outputFormat:opts.outputFormat||'application/json',srsName:'EPSG:4326'});
  p.set(typeKey,layer);
  // Consulta apenas a extensão da área de interesse; a interseção exata continua sendo calculada no Turf.js.
  if(bbox) p.set('bbox',bbox.join(',')+',EPSG:4326');
  return ep+'?'+p.toString();
}
function wfsCandidates(base,bbox){
  return [
    buildWfsUrl(base,bbox,{version:'1.0.0',outputFormat:'application/json'}),
    buildWfsUrl(base,bbox,{version:'1.1.0',outputFormat:'application/json'}),
    buildWfsUrl(base,bbox,{version:'2.0.0',outputFormat:'application/json'}),
    buildWfsUrl(base,bbox,{version:'1.0.0',outputFormat:'json'}),
    buildWfsUrl(base,bbox,{version:'1.1.0',outputFormat:'json'})
  ];
}
function buildCapabilitiesUrl(url,service='WFS'){ const ep=stripToEndpoint(url); return ep+'?service='+service+'&request=GetCapabilities'; }
function proxyUrls(url){
  // HTML local sofre bloqueio CORS em alguns GeoServers. Tentamos direto e depois proxies públicos configuráveis.
  return [url,'https://api.allorigins.win/raw?url='+encodeURIComponent(url),'https://corsproxy.io/?'+encodeURIComponent(url)];
}
async function fetchTextSmart(url,timeout=18000){
  let lastErr=null;
  for(const u of proxyUrls(url)){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeout);
      const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(t);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.text();
    }catch(e){ lastErr=e; }
  }
  throw new Error((lastErr&&lastErr.message)||'Falha de acesso/CORS');
}
async function fetchJsonSmart(url,timeout=25000){
  const txt=await fetchTextSmart(url,timeout);
  try{return JSON.parse(txt)}catch(e){
    const cut=txt.slice(0,220).replace(/\s+/g,' ');
    throw new Error('Resposta não veio em GeoJSON/JSON: '+cut);
  }
}


