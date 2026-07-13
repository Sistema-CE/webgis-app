
(function(){
  let mode=null;
  let points=[];
  let previewLine=null;
  let previewPolygon=null;
  let temporaryMarkers=[];
  const measurementLayer=L.layerGroup().addTo(map);

  const MeasurementControl=L.Control.extend({
    options:{position:'topleft'},
    onAdd(){
      const container=L.DomUtil.create('div','leaflet-bar measurement-control');
      container.innerHTML=`
        <button id="btnMeasureDistance" type="button" title="Medir distância" aria-label="Medir distância">📏</button>
        <button id="btnMeasureArea" type="button" title="Medir área" aria-label="Medir área">▰</button>
        <button id="btnClearMeasurements" type="button" title="Limpar medições" aria-label="Limpar medições">⌫</button>`;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      return container;
    }
  });
  map.addControl(new MeasurementControl());

  const distanceButton=document.getElementById('btnMeasureDistance');
  const areaButton=document.getElementById('btnMeasureArea');
  const clearButton=document.getElementById('btnClearMeasurements');

  function formatDistance(meters){
    return meters>=1000
      ? `${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} km`
      : `${meters.toLocaleString('pt-BR',{maximumFractionDigits:2})} m`;
  }

  function formatArea(squareMeters){
    return squareMeters>=10000
      ? `${(squareMeters/10000).toLocaleString('pt-BR',{maximumFractionDigits:4})} ha`
      : `${squareMeters.toLocaleString('pt-BR',{maximumFractionDigits:2})} m²`;
  }

  function totalDistance(latlngs){
    let total=0;
    for(let i=1;i<latlngs.length;i++) total+=map.distance(latlngs[i-1],latlngs[i]);
    return total;
  }

  function polygonArea(latlngs){
    if(latlngs.length<3) return 0;
    const coordinates=latlngs.map(point=>[point.lng,point.lat]);
    coordinates.push(coordinates[0]);
    try{return turf.area(turf.polygon([coordinates]));}
    catch(error){return 0;}
  }

  function setButtons(){
    distanceButton?.classList.toggle('active-measure',mode==='distance');
    areaButton?.classList.toggle('active-measure',mode==='area');
    map.getContainer().classList.toggle('measurement-cursor',!!mode);
  }

  function clearPreview(){
    if(previewLine){map.removeLayer(previewLine);previewLine=null;}
    if(previewPolygon){map.removeLayer(previewPolygon);previewPolygon=null;}
    temporaryMarkers.forEach(marker=>map.removeLayer(marker));
    temporaryMarkers=[];
    points=[];
  }

  function cancelMeasurement(){
    mode=null;
    clearPreview();
    setButtons();
  }

  function beginMeasurement(nextMode){
    clearPreview();
    mode=mode===nextMode?null:nextMode;
    setButtons();
  }

  function addPointMarker(latlng){
    temporaryMarkers.push(
      L.circleMarker(latlng,{
        radius:5,color:'#0f172a',weight:2,fillColor:'#fff',fillOpacity:1
      }).addTo(map)
    );
  }

  function updatePreview(cursor=null){
    const display=cursor?[...points,cursor]:points.slice();
    if(mode==='distance'){
      if(previewLine) map.removeLayer(previewLine);
      if(display.length>=2){
        previewLine=L.polyline(display,{color:'#dc2626',weight:3,dashArray:'8,6'}).addTo(map);
        previewLine.bindTooltip(formatDistance(totalDistance(display)),{sticky:true});
      }
    }else if(mode==='area'){
      if(previewPolygon) map.removeLayer(previewPolygon);
      if(display.length>=2){
        previewPolygon=L.polygon(display,{
          color:'#7c3aed',weight:3,dashArray:'8,6',fillColor:'#a78bfa',fillOpacity:.18
        }).addTo(map);
        if(display.length>=3) previewPolygon.bindTooltip(formatArea(polygonArea(display)),{sticky:true});
      }
    }
  }

  function addPermanentLabel(layer,text,type){
    const center=layer.getBounds().getCenter();
    L.marker(center,{
      icon:L.divIcon({
        className:'measurement-label-wrapper',
        html:`<div class="measurement-label ${type}-label">${text}</div>`,
        iconSize:null
      }),
      interactive:false
    }).addTo(measurementLayer);
  }

  function finalize(){
    if(mode==='distance'&&points.length>=2){
      const layer=L.polyline(points,{color:'#dc2626',weight:4}).addTo(measurementLayer);
      addPermanentLabel(layer,formatDistance(totalDistance(points)),'distance');
    }else if(mode==='area'&&points.length>=3){
      const layer=L.polygon(points,{
        color:'#7c3aed',weight:4,fillColor:'#a78bfa',fillOpacity:.20
      }).addTo(measurementLayer);
      addPermanentLabel(layer,formatArea(polygonArea(points)),'area');
    }else return;
    cancelMeasurement();
  }

  map.on('click',event=>{
    if(!mode) return;
    points.push(event.latlng);
    addPointMarker(event.latlng);
    updatePreview();
  });
  map.on('mousemove',event=>{
    if(mode&&points.length) updatePreview(event.latlng);
  });
  map.on('dblclick',event=>{
    if(!mode) return;
    L.DomEvent.preventDefault(event);
    finalize();
  });

  distanceButton?.addEventListener('click',()=>beginMeasurement('distance'));
  areaButton?.addEventListener('click',()=>beginMeasurement('area'));
  clearButton?.addEventListener('click',()=>{
    cancelMeasurement();
    measurementLayer.clearLayers();
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&mode) cancelMeasurement();
    if(event.key==='Enter'&&mode) finalize();
  });

  map.doubleClickZoom.disable();
})();
