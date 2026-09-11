const APP = "https://pruthvirajg.github.io/visitbayarea/";
const REGIONS = {
  mrn: "Marin",
  sf: "San Francisco",
  scl: "San Jose",
  scz: "Santa Cruz",
  mty: "Monterey",
  bsr: "Big Sur",
};
const BUCKET_KEY = "gem-bucket:visitbayarea";

const map = L.map("map", { zoomControl: true, attributionControl: true }).setView([37.15, -122.05], 8);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles © Esri",
  maxZoom: 16,
}).addTo(map);

const listEl = document.getElementById("list");
const qEl = document.getElementById("q");
const countEl = document.getElementById("count");
const bucketBtn = document.getElementById("bucket-tab");
let stops = [];
let tripOnly = false;
const markers = new Map();

function readBucket() {
  try { return JSON.parse(localStorage.getItem(BUCKET_KEY) || "{}"); }
  catch { return {}; }
}
function writeBucket(obj) {
  localStorage.setItem(BUCKET_KEY, JSON.stringify(obj));
}
function isSaved(id) { return Boolean(readBucket()[id]); }
function toggleSave(id) {
  const b = readBucket();
  if (b[id]) delete b[id];
  else b[id] = { savedAt: Date.now() };
  writeBucket(b);
  render(qEl.value);
}

function driveUrl(stop) {
  const dest = `${stop.name}, ${stop.city}, California`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

function pinColor(stop) {
  if (stop.gem >= 65) return "#3db8a6";
  if (stop.gem >= 35) return "#ede6d6";
  return "#8a8578";
}

function regionOf(id) {
  return REGIONS[id.split("-")[0]] || "Bay Area";
}

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const bucket = readBucket();
  let shown = stops;
  if (tripOnly) shown = shown.filter((s) => bucket[s.id]);
  if (q) {
    shown = shown.filter((s) =>
      `${s.name} ${s.city} ${s.blurb} ${regionOf(s.id)}`.toLowerCase().includes(q)
    );
  }
  listEl.innerHTML = shown.length
    ? shown.map((s) => `<button class="row" data-id="${s.id}" type="button">
        <b>${s.name}${s.gem >= 65 ? ' <span class="hidden">Hidden</span>' : ""}${isSaved(s.id) ? ' <span class="hidden">Saved</span>' : ""}</b>
        <span>mi ${s.mile} · ${s.city} · ${regionOf(s.id)}</span>
      </button>`).join("")
    : `<p style="padding:16px;color:#8a8578">${tripOnly ? "Nothing saved yet. Open a pin and tap Save." : "No matches."}</p>`;
}

function focusStop(id) {
  const stop = stops.find((s) => s.id === id);
  const marker = markers.get(id);
  if (!stop || !marker) return;
  map.setView([stop.lat, stop.lon], 13, { animate: true });
  marker.openPopup();
}

listEl.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (row) focusStop(row.getAttribute("data-id"));
});
qEl.addEventListener("input", () => render(qEl.value));
bucketBtn.addEventListener("click", () => {
  tripOnly = !tripOnly;
  bucketBtn.textContent = tripOnly ? "The road" : "My trip";
  render(qEl.value);
});
document.body.addEventListener("click", (event) => {
  const save = event.target.closest("[data-save]");
  if (save) toggleSave(save.getAttribute("data-save"));
});

fetch("./stops.json")
  .then((r) => r.json())
  .then((data) => {
    stops = data.stops || [];
    countEl.textContent = `${stops.length} stops · SF to Big Sur`;
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
        `<strong>${stop.name}</strong><br>${stop.city}, CA · ${regionOf(stop.id)}<br>
         <small>${stop.blurb}</small><br>
         <a href="${driveUrl(stop)}" target="_blank" rel="noopener">Drive</a>
         · <button type="button" data-save="${stop.id}">${isSaved(stop.id) ? "Saved" : "Save"}</button>`,
      );
      markers.set(stop.id, marker);
    }
    if (stops.length) {
      map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lon])), { padding: [24, 24] });
    }
    render("");
  })
  .catch(() => {
    countEl.textContent = "Could not load stops";
  });
