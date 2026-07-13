
(function(){
  let mode=null;
  let points=[];
  let previewLine=null;
  let previewPolygon=null;
  let temporaryMarkers=[];
  const measurementLayer=L.layerGroup().addTo(map);

  const distanceButton=document.getElementById('btnMeasureDistance');
  const areaButton=document.getElementById('btnMeasureArea');
  const clearButton=document.getElementById('btnClearMeasurements');

  function formatDistance(meters){
    if(meters>=1000) return `${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} km`;
    return `${meters.toLocaleString('pt-BR',{maximumFractionDigits:2})} m`;
  }

  function formatArea(squareMeters){
    if(squareMeters>=10000){
      return `${(squareMeters/10000).toLocaleString('pt-BR',{maximumFractionDigits:4})} ha`;
    }
    return `${squareMeters.toLocaleString('pt-BR',{maximumFractionDigits:2})} m²`;
  }

  function totalDistance(latlngs){
    let total=0;
    for(let i=1;i<latlngs.length;i++){
      total+=map.distance(latlngs[i-1],latlngs[i]);
    }
    return total;
  }

  function polygonArea(latlngs){
    if(latlngs.length<3) return 0;
    const coordinates=latlngs.map(point=>[point.lng,point.lat]);
    coordinates.push(coordinates[0]);
    try{
      return turf.area(turf.polygon([coordinates]));
    }catch(error){
      return 0;
    }
  }

  function setButtons(){
    distanceButton?.classList.toggle('active-measure',mode==='distance');
    areaButton?.classList.toggle('active-measure',mode==='area');
    map.getContainer().classList.toggle('measurement-cursor',!!mode);
  }

  function clearPreview(){
    if(previewLine){
      map.removeLayer(previewLine);
      previewLine=null;
    }
    if(previewPolygon){
      map.removeLayer(previewPolygon);
      previewPolygon=null;
    }
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

  function addPointMarker(latlng,index){
    const marker=L.circleMarker(latlng,{
      radius:5,
      color:'#0f172a',
      weight:2,
      fillColor:'#f8fafc',
      fillOpacity:1
    }).addTo(map);
    marker.bindTooltip(index===0?'Início':String(index+1),{
      permanent:false,
      direction:'top'
    });
    temporaryMarkers.push(marker);
  }

  function updatePreview(cursorLatLng=null){
    const displayPoints=cursorLatLng?[...points,cursorLatLng]:points.slice();

    if(mode==='distance'){
      if(previewLine) map.removeLayer(previewLine);
      if(displayPoints.length>=2){
        previewLine=L.polyline(displayPoints,{
          color:'#dc2626',
          weight:3,
          dashArray:'8,6'
        }).addTo(map);
        previewLine.bindTooltip(formatDistance(totalDistance(displayPoints)),{
          permanent:false,
          sticky:true
        });
      }
    }

    if(mode==='area'){
      if(previewPolygon) map.removeLayer(previewPolygon);
      if(displayPoints.length>=2){
        previewPolygon=L.polygon(displayPoints,{
          color:'#7c3aed',
          weight:3,
          dashArray:'8,6',
          fillColor:'#a78bfa',
          fillOpacity:.18
        }).addTo(map);
        if(displayPoints.length>=3){
          previewPolygon.bindTooltip(formatArea(polygonArea(displayPoints)),{
            permanent:false,
            sticky:true
          });
        }
      }
    }
  }

  function finalizeDistance(){
    if(points.length<2) return;
    const total=totalDistance(points);
    const line=L.polyline(points,{
      color:'#dc2626',
      weight:4
    }).addTo(measurementLayer);

    const center=line.getBounds().getCenter();
    L.marker(center,{
      icon:L.divIcon({
        className:'measurement-label-wrapper',
        html:`<div class="measurement-label distance-label">${formatDistance(total)}</div>`,
        iconSize:null
      }),
      interactive:false
    }).addTo(measurementLayer);

    mode=null;
    clearPreview();
    setButtons();
  }

  function finalizeArea(){
    if(points.length<3) return;
    const area=polygonArea(points);
    const polygon=L.polygon(points,{
      color:'#7c3aed',
      weight:4,
      fillColor:'#a78bfa',
      fillOpacity:.20
    }).addTo(measurementLayer);

    const center=polygon.getBounds().getCenter();
    L.marker(center,{
      icon:L.divIcon({
        className:'measurement-label-wrapper',
        html:`<div class="measurement-label area-label">${formatArea(area)}</div>`,
        iconSize:null
      }),
      interactive:false
    }).addTo(measurementLayer);

    mode=null;
    clearPreview();
    setButtons();
  }

  map.on('click',event=>{
    if(!mode) return;
    L.DomEvent.stopPropagation(event);
    points.push(event.latlng);
    addPointMarker(event.latlng,points.length-1);
    updatePreview();
  });

  map.on('mousemove',event=>{
    if(!mode||!points.length) return;
    updatePreview(event.latlng);
  });

  map.on('dblclick',event=>{
    if(!mode) return;
    L.DomEvent.preventDefault(event);
    L.DomEvent.stopPropagation(event);
    if(mode==='distance') finalizeDistance();
    else finalizeArea();
  });

  distanceButton?.addEventListener('click',()=>beginMeasurement('distance'));
  areaButton?.addEventListener('click',()=>beginMeasurement('area'));

  clearButton?.addEventListener('click',()=>{
    cancelMeasurement();
    measurementLayer.clearLayers();
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&mode) cancelMeasurement();
    if(event.key==='Enter'&&mode){
      if(mode==='distance') finalizeDistance();
      else finalizeArea();
    }
  });

  map.doubleClickZoom.disable();
})();
