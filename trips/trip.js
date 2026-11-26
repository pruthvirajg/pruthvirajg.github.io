/*
 * Trip page renderer. Each trip folder has an index.html and a trip.json.
 * To change a trip, edit only its trip.json:
 *   stops: id, name, kind (start | see | charge | sleep | end), lat, lon,
 *          q (what Google Maps should search for), note, optional
 *   days:  title, note, warn, stops (ids in order), route (ids and [lat, lon]
 *          shaping points, so the line follows the highway), leg miles per stop.
 * The line on the map is drawn through the shaping points; tap Drive on a stop
 * for real turn-by-turn directions.
 */
(function () {
  const DAY_COLORS = ["#37d6c4", "#f2b84b", "#f2568e", "#9fb6ff", "#c8e66b", "#ede6d6"];
  const GLYPH = {
    start: "A",
    end: "B",
    see: "",
    sleep: "",
    charge:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  };
  const KIND_LABEL = { start: "Start", end: "Finish", see: "See", charge: "Supercharger", sleep: "Overnight" };
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function driveUrl(stop) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.q || stop.name)}&travelmode=driving`;
  }

  function glyphHtml(stop, index) {
    const g = GLYPH[stop.kind];
    const inner = g === "" ? String(index) : g;
    return `<span class="glyph k-${stop.kind}">${inner}</span>`;
  }

  function loadJson(inlineName, url) {
    if (window[inlineName]) return Promise.resolve(window[inlineName]);
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
  }

  function start(trip) {
    const byId = new Map(trip.stops.map((s) => [s.id, s]));
    document.title = `${trip.title} · Route 66`;
    document.getElementById("title").textContent = trip.title;
    document.getElementById("subtitle").textContent = trip.subtitle;

    const totalMiles = trip.days.reduce((n, d) => n + d.stops.reduce((m, id, i) => m + (d.legs?.[i] || 0), 0), 0);
    const charges = trip.days.reduce((n, d) => n + d.stops.filter((id) => byId.get(id)?.kind === "charge").length, 0);
    document.getElementById("summary").innerHTML = `
      <div class="stats">
        <span><b>${trip.days.length}</b> day${trip.days.length > 1 ? "s" : ""}</span>
        <span>about <b>${totalMiles.toLocaleString("en-US")}</b> mi</span>
        <span><b>${charges}</b> charging stops</span>
      </div>
      ${trip.note ? `<p class="note">${esc(trip.note)}</p>` : ""}
      <div class="legend">
        <span>${glyphHtml({ kind: "see" }, 1)} See</span>
        <span>${glyphHtml({ kind: "charge" })} Supercharger</span>
        <span>${glyphHtml({ kind: "sleep" }, 1)} Overnight</span>
      </div>`;

    // Map
    const map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
    const tiles = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 16 },
    ).addTo(map);
    let outlined = false;
    tiles.on("tileerror", () => {
      if (outlined) return;
      outlined = true;
      loadJson("TRIP_OUTLINES", "../states-sw.json")
        .then((geo) =>
          L.geoJSON(geo, { style: { color: "#5a6070", weight: 1, fillColor: "#1e222b", fillOpacity: 1 } })
            .addTo(map)
            .bringToBack(),
        )
        .catch(() => {});
    });

    const dayLayers = trip.days.map((day, di) => {
      const color = DAY_COLORS[di % DAY_COLORS.length];
      const pts = (day.route || day.stops).map((p) => {
        if (Array.isArray(p)) return p;
        const s = byId.get(p);
        return [s.lat, s.lon];
      });
      const line = L.polyline(pts, { color, weight: 4, opacity: 0.9, lineJoin: "round" });
      return { line, color, bounds: line.getBounds() };
    });
    dayLayers.forEach((d) => d.line.addTo(map));

    // Markers: one per stop id. A stop used on several days (Kingman) gets one pin.
    const markers = new Map();
    const stopDays = new Map();
    trip.days.forEach((day, di) => day.stops.forEach((id) => stopDays.set(id, [...(stopDays.get(id) || []), di])));
    const seeNumber = new Map();
    trip.days.forEach((day) => {
      let n = 0;
      day.stops.forEach((id) => {
        const s = byId.get(id);
        if (s.kind === "see" || s.kind === "sleep") {
          n += 1;
          if (!seeNumber.has(id)) seeNumber.set(id, n);
        }
      });
    });
    for (const [id, days] of stopDays) {
      const s = byId.get(id);
      const icon = L.divIcon({ className: "pin", html: glyphHtml(s, seeNumber.get(id) || ""), iconSize: [24, 24], iconAnchor: [12, 12] });
      const m = L.marker([s.lat, s.lon], { icon, title: s.name, keyboard: false, zIndexOffset: s.kind === "charge" ? 0 : 100 }).addTo(map);
      m.bindPopup(
        `<strong>${esc(s.name)}</strong><br><small>${esc(KIND_LABEL[s.kind])} · Day ${days.map((d) => d + 1).join(", ")}</small>` +
          (s.note ? `<br>${esc(s.note)}` : "") +
          `<br><a href="${driveUrl(s)}" target="_blank" rel="noopener">Drive here</a>`,
      );
      markers.set(id, { marker: m, days });
    }

    const all = L.latLngBounds(dayLayers.flatMap((d) => [d.bounds.getSouthWest(), d.bounds.getNorthEast()]));
    map.fitBounds(all, { padding: [24, 24] });

    // Day chips + list
    const chipsEl = document.getElementById("chips");
    const listEl = document.getElementById("list");
    chipsEl.innerHTML =
      `<button class="chip" type="button" data-day="all" aria-pressed="true">All days</button>` +
      trip.days
        .map(
          (d, i) =>
            `<button class="chip" type="button" data-day="${i}" aria-pressed="false"><span class="sw" style="background:${dayLayers[i].color}"></span>Day ${i + 1}</button>`,
        )
        .join("");

    listEl.innerHTML = trip.days
      .map((day, di) => {
        const miles = day.stops.reduce((m, id, i) => m + (day.legs?.[i] || 0), 0);
        let n = 0;
        const rows = day.stops
          .map((id, i) => {
            const s = byId.get(id);
            if (s.kind === "see" || s.kind === "sleep") n += 1;
            const leg = day.legs?.[i] ? `+${day.legs[i]} mi` : i === 0 ? "Start of day" : "";
            const label = KIND_LABEL[s.kind];
            return `<button class="stop k-${s.kind}" type="button" data-id="${esc(id)}" data-day="${di}">
              ${glyphHtml(s, s.kind === "see" || s.kind === "sleep" ? n : "")}
              <span class="body">
                <b>${esc(s.name)}${s.optional ? '<span class="opt">Optional</span>' : ""}</b>
                <span class="sub">${esc(label)}${leg ? ` · ${leg}` : ""}${s.stay ? ` · ${esc(s.stay)}` : ""}</span>
                ${s.note ? `<span class="txt">${esc(s.note)}</span>` : ""}
                <a class="go" href="${driveUrl(s)}" target="_blank" rel="noopener">Drive here</a>
              </span>
            </button>`;
          })
          .join("");
        return `<section class="day" id="day-${di + 1}" data-day="${di}">
            <h2>Day ${di + 1} · ${esc(day.title)}</h2>
            <p class="meta">About ${miles} mi · ${esc(day.time || "")}</p>
            ${day.note ? `<p class="note" style="margin-top:6px">${esc(day.note)}</p>` : ""}
            ${day.warn ? `<p class="warn">${esc(day.warn)}</p>` : ""}
          </section>${rows}`;
      })
      .join("");

    function selectDay(which) {
      chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.day === which)));
      dayLayers.forEach((d, i) => {
        const on = which === "all" || String(i) === which;
        d.line.setStyle({ opacity: on ? 0.95 : 0.15, weight: on ? 5 : 3 });
        if (on) d.line.bringToFront();
      });
      for (const { marker, days } of markers.values()) {
        const on = which === "all" || days.includes(Number(which));
        marker.getElement()?.classList.toggle("dim", !on);
      }
      map.fitBounds(which === "all" ? all : dayLayers[Number(which)].bounds, { padding: [28, 28] });
      if (which !== "all" && !window.matchMedia("(max-width: 800px)").matches)
        document.getElementById(`day-${Number(which) + 1}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    chipsEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) selectDay(chip.dataset.day);
    });

    listEl.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const row = e.target.closest(".stop");
      if (!row) return;
      const hit = markers.get(row.dataset.id);
      if (!hit) return;
      if (window.matchMedia("(max-width: 800px)").matches) document.getElementById("map").scrollIntoView({ behavior: "smooth" });
      map.setView(hit.marker.getLatLng(), 11, { animate: true });
      hit.marker.openPopup();
    });
  }

  loadJson("TRIP", document.body.dataset.trip || "./trip.json")
    .then(start)
    .catch(() => {
      document.getElementById("subtitle").textContent = "Could not load this trip.";
    });
})();
