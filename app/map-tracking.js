(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KanawaMaps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  let map = null;
  let markerLayer = null;
  let routeLayer = null;
  let watchId = null;

  function validateCoordinates(latitude, longitude) {
    const lat = Number(String(latitude == null ? '' : latitude).trim().replace(',', '.'));
    const lng = Number(String(longitude == null ? '' : longitude).trim().replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Coordenadas inválidas. Latitude: -90 a 90; longitude: -180 a 180.');
    }
    return { lat: lat, lng: lng };
  }

  function haversineKm(a, b) {
    const p1 = validateCoordinates(a.lat, a.lng);
    const p2 = validateCoordinates(b.lat, b.lng);
    const rad = Math.PI / 180;
    const dLat = (p2.lat - p1.lat) * rad;
    const dLng = (p2.lng - p1.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(p1.lat * rad) * Math.cos(p2.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  async function geocode(address) {
    const query = String(address || '').trim();
    if (query.length < 3) throw new Error('Introduza um endereço mais completo.');
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ao&q=' + encodeURIComponent(query);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Serviço de pesquisa de endereços indisponível (' + response.status + ').');
    const results = await response.json();
    if (!Array.isArray(results) || !results.length) throw new Error('Endereço não encontrado em Angola. Experimente indicar município e província.');
    return {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon),
      label: results[0].display_name || query
    };
  }

  async function calculateRoute(origin, destination) {
    const points = await Promise.all([geocode(origin), geocode(destination)]);
    const url = 'https://router.project-osrm.org/route/v1/driving/' +
      points[0].lng + ',' + points[0].lat + ';' + points[1].lng + ',' + points[1].lat +
      '?overview=full&geometries=geojson&steps=false';
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Serviço de rotas indisponível (' + response.status + ').');
    const payload = await response.json();
    if (!payload || payload.code !== 'Ok' || !payload.routes || !payload.routes.length) {
      throw new Error('Não foi possível calcular uma rota rodoviária entre estes pontos.');
    }
    const route = payload.routes[0];
    return {
      origin: points[0],
      destination: points[1],
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      geometry: route.geometry,
      provider: 'OSRM / OpenStreetMap'
    };
  }

  function requireLeaflet() {
    if (!root.L) throw new Error('Biblioteca de mapas não carregou. Verifique a ligação à Internet e atualize a página.');
  }

  function mountMap(containerId, records) {
    requireLeaflet();
    const element = root.document && root.document.getElementById(containerId);
    if (!element) return false;
    if (map) { map.remove(); map = null; }
    map = root.L.map(element, { scrollWheelZoom: false }).setView([-8.8383, 13.2344], 11);
    root.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    markerLayer = root.L.layerGroup().addTo(map);
    (Array.isArray(records) ? records : []).forEach(function (record) {
      if (record.coordinates_valid !== true) return;
      try {
        const point = validateCoordinates(record.lat, record.lng);
        const marker = root.L.marker([point.lat, point.lng]).bindPopup(
          String(record.veiculo || record.deviceLabel || 'Dispositivo') +
          '<br>' + String(record.status === 'active' ? 'Rastreamento ativo' : 'Última posição registada') +
          '<br>' + String(record.ultimaAtualizacao || '')
        );
        marker.addTo(markerLayer);
      } catch (e) { /* Ignora apenas coordenadas inválidas. */ }
    });
    root.setTimeout(function () { if (map) map.invalidateSize(); }, 100);
    return true;
  }

  function updateCurrentPosition(position, label) {
    if (!map || !root.L) return;
    const point = validateCoordinates(position.latitude, position.longitude);
    const marker = root.L.circleMarker([point.lat, point.lng], {
      radius: 9, color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1
    }).bindPopup(label || 'Este dispositivo');
    if (markerLayer) markerLayer.addLayer(marker);
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));
  }

  function showRoute(route) {
    requireLeaflet();
    if (!map) throw new Error('Abra primeiro o mapa de frota.');
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = root.L.geoJSON(route.geometry, { style: { color: '#2563eb', weight: 5, opacity: 0.85 } }).addTo(map);
    const bounds = routeLayer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    root.L.marker([route.origin.lat, route.origin.lng]).addTo(map).bindPopup('Origem: ' + route.origin.label);
    root.L.marker([route.destination.lat, route.destination.lng]).addTo(map).bindPopup('Destino: ' + route.destination.label);
  }

  function startWatch(onPosition, onError) {
    if (!root.navigator || !root.navigator.geolocation || !root.navigator.geolocation.watchPosition) {
      throw new Error('Este navegador não disponibiliza geolocalização.');
    }
    if (watchId !== null) root.navigator.geolocation.clearWatch(watchId);
    watchId = root.navigator.geolocation.watchPosition(function (position) {
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: new Date(position.timestamp || Date.now()).toISOString()
      };
      if (typeof onPosition === 'function') onPosition(coords);
    }, function (error) {
      if (typeof onError === 'function') onError(error);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    return watchId;
  }

  function stopWatch() {
    if (watchId !== null && root.navigator && root.navigator.geolocation) {
      root.navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
    return true;
  }

  function distanceBetween(a, b) { return haversineKm(a, b); }

  return {
    validateCoordinates: validateCoordinates,
    haversineKm: haversineKm,
    geocode: geocode,
    calculateRoute: calculateRoute,
    mountMap: mountMap,
    updateCurrentPosition: updateCurrentPosition,
    showRoute: showRoute,
    startWatch: startWatch,
    stopWatch: stopWatch,
    distanceBetween: distanceBetween
  };
});
