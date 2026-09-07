const APP = "https://route66.grok.me";
const STATES = { IL: "Illinois", MO: "Missouri", KS: "Kansas", OK: "Oklahoma", TX: "Texas", NM: "New Mexico", AZ: "Arizona", CA: "California" };

const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([35.5, -98], 5);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles © Esri",
  maxZoom: 16,
}).addTo(map);

const listEl = document.getElementById("list");
const qEl = document.getElementById("q");
const countEl = document.getElementById("count");
let stops = [];
const markers = new Map();

function driveUrl(stop) {
  const dest = `${stop.name}, ${stop.city}, ${STATES[stop.state] || stop.state}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

function pinColor(stop) {
  if (stop.gem >= 65) return "#37d6c4";
  if (stop.gem >= 35) return "#ede6d6";
  return "#8a8578";
}

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const shown = q
    ? stops.filter((s) => `${s.name} ${s.city} ${s.state} ${STATES[s.state] || ""}`.toLowerCase().includes(q))
    : stops;
  listEl.innerHTML = shown
    .map(
      (s) => `<button class="row" data-id="${s.id}" type="button">
        <b>${s.name}${s.gem >= 65 ? ' <span class="hidden">Hidden</span>' : ""}</b>
        <span>mi ${s.mile} · ${s.city}, ${STATES[s.state] || s.state}</span>
      </button>`,
    )
    .join("");
}

function focusStop(id) {
  const stop = stops.find((s) => s.id === id);
  const marker = markers.get(id);
  if (!stop || !marker) return;
  map.setView([stop.lat, stop.lon], 12, { animate: true });
  marker.openPopup();
}

listEl.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (row) focusStop(row.getAttribute("data-id"));
});
qEl.addEventListener("input", () => render(qEl.value));

fetch("./stops.json")
  .then((r) => r.json())
  .then((data) => {
    stops = data.stops || [];
    countEl.textContent = `${stops.length} stops · Chicago to Santa Monica`;
    const layer = L.layerGroup().addTo(map);
    for (const stop of stops) {
      const marker = L.circleMarker([stop.lat, stop.lon], {
        radius: stop.gem >= 65 ? 6 : 4,
        color: pinColor(stop),
        fillColor: pinColor(stop),
        fillOpacity: 0.9,
        weight: 1,
      }).addTo(layer);
      marker.bindPopup(
        `<strong>${stop.name}</strong><br>${stop.city}, ${STATES[stop.state] || stop.state}<br>
         <small>${stop.blurb}</small><br>
         <a href="${driveUrl(stop)}" target="_blank" rel="noopener">Drive</a>
         · <a href="${APP}" target="_blank" rel="noopener">Full app</a>`,
      );
      markers.set(stop.id, marker);
    }
    if (stops.length) {
      map.fitBounds(
        L.latLngBounds(stops.map((s) => [s.lat, s.lon])),
        { padding: [24, 24] },
      );
    }
    render("");
  })
  .catch(() => {
    countEl.textContent = "Could not load stops";
  });
