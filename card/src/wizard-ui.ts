import { LitElement, css, html, nothing, svg } from "lit";
import { readExifDate } from "./exif";
import { project } from "./projection";
import { drawOverlay, drawSky } from "./renderer";
import { NAMED, SOLAR, buildScene, starName, type BodyPoints, type CardData } from "./scene";
import { localSiderealTime, precess, raDecToAltAz } from "./sky-math";
import { bodiesAt, type SkyReply } from "./sky-data";
import { skyColors, type View } from "./view";
import {
  addMatch, altToHorizon, back, canNext, chooseMethod, clearMatches, hasPhoto, horizonToAlt, initWizard, next,
  formatLocalInput, parseLocalInput, savePayload, setPhoto, setPhotoTime, skipPhoto, validatePhotoFile,
  type Step, type WizardState,
} from "./wizard";

const STEPS: [Step, string][] = [
  ["photo", "Zdjęcie"],
  ["method", "Metoda"],
  ["stars", "Gwiazdy"],
  ["compass", "Kompas"],
  ["obstructions", "Przeszkody"],
  ["preview", "Podgląd"],
];

interface Candidate {
  id: string;
  name: string;
  az: number;
  alt: number;
}


export class MapaNiebaWizard extends LitElement {
  static properties = {
    hass: { attribute: false },
    data: { attribute: false },
    photoUrl: { attribute: false },
    rises: { attribute: false },
    state: { state: true },
    _at: { state: true },
    _selected: { state: true },
    _draft: { state: true },
    _saving: { state: true },
    _msg: { state: true },
    _previewMin: { state: true },
    _preview: { state: true },
  };
  hass: any;
  data!: CardData;
  photoUrl = "";
  rises: SkyReply["rises"] | undefined;
  state!: WizardState;
  _at?: { time: Date; bodies: BodyPoints; sunAlt: number };
  _selected: string | null = null;
  _draft: [number, number][] | null = null;
  _saving = false;
  _msg = "";
  _previewMin = 180;
  _preview?: { base: Date; sky: SkyReply };
  _dragHorizon = false;

  connectedCallback() {
    super.connectedCallback();
    if (!this.state && this.data) this.state = initWizard(this.data, this.photoUrl);
  }

  // ---------------------------------------------------------------- actions
  get _tz(): string {
    return this.hass?.config?.time_zone || "UTC";
  }

  _close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  async _onFile(file: File) {
    const bad = validatePhotoFile(file);
    if (bad) {
      this._msg = bad;
      return;
    }
    this._msg = "";
    const buf = await file.arrayBuffer();
    const exif = readExifDate(buf);
    const blobUrl = URL.createObjectURL(file);
    const aspect = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 4 / 3);
      img.onerror = () => resolve(4 / 3);
      img.src = blobUrl;
    });
    this.state = setPhoto(this.state, {
      blob: file, blobUrl, aspect, exif, timeZone: this.hass?.config?.time_zone || "UTC",
    });
  }

  async _goNext() {
    this.state = next(this.state);
    await this._enter();
  }

  async _choose(method: "stars" | "compass") {
    this.state = chooseMethod(this.state, method);
    await this._enter();
  }

  async _enter() {
    const s = this.state;
    try {
      if (s.step === "stars" && s.photo.time) {
        const r: SkyReply = await this.hass.callWS({ type: "mapa_nieba/sky", times: [s.photo.time.toISOString()] });
        this._at = { time: s.photo.time, bodies: bodiesAt(r, 0), sunAlt: r.sun_alt[0] };
      }
      if (s.step === "preview" && !this._preview) {
        const base = new Date();
        base.setHours(18, 0, 0, 0);
        const times = Array.from({ length: 73 }, (_, i) => new Date(base.getTime() + i * 600000).toISOString());
        this._preview = { base, sky: await this.hass.callWS({ type: "mapa_nieba/sky", times }) };
      }
    } catch (e: any) {
      this._msg = e?.message || "Nie udało się pobrać pozycji obiektów";
    }
  }

  _candidates(): Candidate[] {
    if (!this._at) return [];
    const { lat, lon } = this.data.observer;
    const lst = localSiderealTime(this._at.time, lon);
    const out: Candidate[] = [];
    for (const [id, aa] of Object.entries(this._at.bodies)) {
      if (aa && aa[0] > 0 && SOLAR[id]) out.push({ id, name: SOLAR[id].name, alt: aa[0], az: aa[1] });
    }
    for (const [id, [ra, dec]] of Object.entries(NAMED)) {
      const [r2, d2] = precess(ra, dec, this._at.time);
      const { alt, az } = raDecToAltAz(r2, d2, lat, lst);
      if (alt > 0) out.push({ id, name: starName(id), alt, az });
    }
    return out.sort((a, b) => b.alt - a.alt);
  }

  _framePoint(e: PointerEvent | MouseEvent): [number, number] {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  _clickStars(e: MouseEvent) {
    const c = this._candidates().find((x) => x.id === this._selected);
    if (!c) {
      this._msg = "Najpierw wybierz obiekt z listy, potem kliknij go na zdjęciu.";
      return;
    }
    const [x, y] = this._framePoint(e);
    this.state = addMatch(this.state, { az: c.az, alt: c.alt, x, y });
    this._selected = null;
    this._msg = "";
  }

  _clickObstruction(e: MouseEvent) {
    if (!this._draft) return;
    this._draft = [...this._draft, this._framePoint(e)];
  }

  _closeDraft() {
    if (this._draft && this._draft.length >= 3) this.state = { ...this.state, polys: [...this.state.polys, this._draft] };
    this._draft = null;
  }

  _setGeo(patch: Partial<WizardState["geometry"]>) {
    this.state = { ...this.state, geometry: { ...this.state.geometry, ...patch } };
  }

  _dial(e: PointerEvent) {
    if (e.type === "pointermove" && !(e.buttons & 1)) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    this._setGeo({ az_center: Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) });
  }

  _horizon(e: PointerEvent) {
    if (e.type === "pointerdown") {
      this._dragHorizon = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (e.type === "pointerup") this._dragHorizon = false;
    if (!this._dragHorizon) return;
    const [, y] = this._framePoint(e);
    this._setGeo({ alt_center: Math.max(-10, Math.min(60, horizonToAlt(this.state.geometry, y))) });
  }

  async _save() {
    this._saving = true;
    this._msg = "";
    try {
      const s = this.state;
      if (s.photo.blob && !s.photo.deleted) {
        const init = { method: "POST", body: s.photo.blob, headers: { "Content-Type": s.photo.blob.type || "image/jpeg" } };
        const resp = this.hass.fetchWithAuth
          ? await this.hass.fetchWithAuth("/api/mapa_nieba/photo", init)
          : await fetch("/api/mapa_nieba/photo", {
              ...init,
              headers: { ...init.headers, Authorization: `Bearer ${this.hass.auth?.data?.access_token}` },
            });
        if (!resp.ok) throw new Error((await resp.text?.()) || "Nie udało się wgrać zdjęcia");
      }
      await this.hass.callWS({
        type: "mapa_nieba/save_geometry",
        ...savePayload(s),
        ...(s.photo.deleted ? { delete_photo: true } : {}),
      });
      this.dispatchEvent(new CustomEvent("saved"));
    } catch (e: any) {
      this._msg = e?.message || "Zapis nie powiódł się";
    } finally {
      this._saving = false;
    }
  }

  // ---------------------------------------------------------------- drawing
  updated() {
    const c = this.renderRoot.querySelector("canvas.wz") as HTMLCanvasElement | null;
    if (!c) return;
    const frame = c.parentElement!;
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = this.state.geometry;
    const view: View = { az: g.az_center, alt: g.alt_center, hfov: g.hfov, roll: g.roll };
    const data = { ...this.data, geometry: g, obstructions: [] };
    if (this.state.step === "stars" && this._at) {
      const scene = buildScene(data, this._at.bodies, this._at.time, view, w, h, -30);
      ctx.clearRect(0, 0, w, h);
      for (const st of scene.stars) {
        ctx.fillStyle = "rgba(120,200,255,0.75)";
        ctx.beginPath();
        ctx.arc(st.x, st.y, Math.max(1.2, st.r * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "12px system-ui, sans-serif";
      for (const cnd of this._candidates()) {
        const p = project(g, cnd.az, cnd.alt);
        if (!p) continue;
        const sel = cnd.id === this._selected;
        ctx.strokeStyle = sel ? "#ffd166" : "rgba(255,255,255,0.8)";
        ctx.lineWidth = sel ? 2 : 1;
        ctx.beginPath();
        ctx.arc(p[0] * w, p[1] * h, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.fillText(cnd.name, p[0] * w + 12, p[1] * h + 4);
      }
      for (const m of this.state.matches) {
        ctx.strokeStyle = "#7CFC9A";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(m.x * w - 10, m.y * h);
        ctx.lineTo(m.x * w + 10, m.y * h);
        ctx.moveTo(m.x * w, m.y * h - 10);
        ctx.lineTo(m.x * w, m.y * h + 10);
        ctx.stroke();
      }
    } else if (this.state.step === "preview" && this._preview) {
      const idx = Math.round(this._previewMin / 10);
      const sky = this._preview.sky;
      const date = new Date(this._preview.base.getTime() + this._previewMin * 60000);
      const sunAlt = sky.sun_alt[idx];
      const scene = buildScene(data, bodiesAt(sky, idx), date, view, w, h, sunAlt);
      drawSky(ctx, scene, skyColors(sunAlt), w, h);
      const over = this.renderRoot.querySelector("canvas.wz-over") as HTMLCanvasElement | null;
      const octx = over?.getContext("2d");
      if (over && octx) {
        over.width = w * dpr;
        over.height = h * dpr;
        over.style.width = `${w}px`;
        over.style.height = `${h}px`;
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawOverlay(octx, scene, new Set(), null, null, w, h);
      }
    }
  }

  // ---------------------------------------------------------------- render
  static styles = css`
    .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 999; display: flex;
                align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; }
    .panel { background: #0d1226; color: #e8ecff; border-radius: 16px; width: min(920px, 100%); max-height: 100%;
             overflow: auto; padding: 16px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); font: 14px system-ui, sans-serif; }
    header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    header h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 600; }
    .chip { padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); font-size: 12px; }
    .chip.on { background: #4f7cff; color: #fff; }
    button { background: rgba(255, 255, 255, 0.1); color: #fff; border: 0; border-radius: 8px; padding: 7px 14px;
             cursor: pointer; font: inherit; }
    button.primary { background: #4f7cff; }
    button:disabled { opacity: 0.4; cursor: default; }
    .x { background: transparent; font-size: 20px; padding: 0 6px; }
    footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; align-items: center; }
    .msg { color: #ffb4a8; font-size: 13px; }
    .hint { color: #aab3d9; font-size: 13px; margin: 6px 0; }
    .frame { position: relative; margin: 0 auto; border-radius: 10px; overflow: hidden;
             background: linear-gradient(#0b1430, #1b2550 70%, #121318 70%); cursor: crosshair; }
    .frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
    .frame canvas, .frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .drop { border: 2px dashed rgba(255, 255, 255, 0.25); border-radius: 12px; padding: 28px; text-align: center; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
    .grow { flex: 1; min-width: 260px; }
    .cands { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .cands button { padding: 4px 10px; font-size: 12px; border-radius: 999px; }
    .cands button.sel { background: #ffd166; color: #222; }
    .methods { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .methods button { text-align: left; padding: 16px; border-radius: 12px; }
    .methods b { display: block; font-size: 15px; margin-bottom: 4px; }
    .dial { width: 170px; height: 170px; touch-action: none; cursor: pointer; }
    label { display: block; margin: 8px 0 4px; font-size: 13px; color: #c8d0f5; }
    input[type="range"] { width: 100%; accent-color: #8fb3ff; }
    input[type="number"], input[type="datetime-local"] { background: #1a2140; color: #fff; border: 1px solid #333c66;
             border-radius: 6px; padding: 5px 8px; font: inherit; }
    .polys { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  `;

  render() {
    const s = this.state;
    if (!s) return nothing;
    const shown = STEPS.filter(([id]) => !(id === "method" && !hasPhoto(s)) && !(id === "stars" && s.method === "compass") && !(id === "compass" && s.method === "stars"));
    return html`<div class="backdrop" @click=${(e: Event) => e.target === e.currentTarget && this._close()}>
      <div class="panel">
        <header>
          <h2>Kreator widoku</h2>
          ${shown.map(([id, label]) => html`<span class="chip ${id === s.step ? "on" : ""}">${label}</span>`)}
          <button class="x" title="Zamknij" @click=${() => this._close()}>×</button>
        </header>
        ${this._step()}
        ${s.error || this._msg ? html`<div class="msg">${s.error || this._msg}</div>` : nothing}
        <footer>
          <button ?disabled=${s.step === "photo"} @click=${() => { this.state = back(s); this._draft = null; }}>← Wstecz</button>
          ${s.step === "preview"
            ? html`<button class="primary" ?disabled=${this._saving} @click=${() => this._save()}>${this._saving ? "Zapisuję…" : "Zapisz"}</button>`
            : s.step === "method"
              ? nothing
              : html`<button class="primary" ?disabled=${!canNext(s)} @click=${() => this._goNext()}>Dalej →</button>`}
        </footer>
      </div>
    </div>`;
  }

  _frame(content: unknown, onClick?: (e: MouseEvent) => void, extra = "") {
    const s = this.state;
    const src = hasPhoto(s) ? s.photo.blobUrl : "";
    return html`<div class="frame" style="aspect-ratio:${s.geometry.aspect};width:min(100%, calc(60vh * ${s.geometry.aspect}));${extra}" @click=${onClick ?? (() => undefined)}>
      ${src ? html`<img src=${src} alt="" style="opacity:${s.step === "preview" ? s.opacity : 1}"/>` : nothing}
      ${content}
    </div>`;
  }

  _step() {
    const s = this.state;
    switch (s.step) {
      case "photo": return this._stepPhoto();
      case "method": return html`<p class="hint">Jak dopasować kierunek zdjęcia do nieba?</p>
        <div class="methods">
          <button @click=${() => this._choose("stars")}><b>⭐ Po gwiazdach</b>Zdjęcie nocne z jasną planetą lub gwiazdą. Klikasz 1–2 obiekty – najdokładniej.</button>
          <button @click=${() => this._choose("compass")}><b>🧭 Po kompasie</b>Zdjęcie dzienne. Ustawiasz kierunek, horyzont i kąt widzenia.</button>
        </div>`;
      case "stars": return this._stepStars();
      case "compass": return this._stepCompass();
      case "obstructions": return this._stepObstructions();
      case "preview": return this._stepPreview();
    }
  }

  _stepPhoto() {
    const s = this.state;
    return html`
      <p class="hint">Zdjęcie jest opcjonalne. Najlepiej nocne, zrobione z miejsca, z którego patrzysz.</p>
      ${hasPhoto(s)
        ? html`${this._frame(nothing, undefined, "cursor:default")}`
        : html`<label class="drop" @dragover=${(e: DragEvent) => e.preventDefault()}
                 @drop=${(e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) void this._onFile(f); }}>
                 Przeciągnij zdjęcie tutaj albo kliknij, aby wybrać<br/>
                 <input type="file" accept="image/*" style="margin-top:10px"
                   @change=${(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void this._onFile(f); }}/>
               </label>`}
      ${hasPhoto(s)
        ? html`<label>Kiedy zrobiono zdjęcie ${s.photo.time ? (s.photo.blob && !s.photo.needsTime ? "(odczytane z pliku)" : "") : html`<b>(potrzebne do kalibracji po gwiazdach – podaj)</b>`}</label>
               <input type="datetime-local" .value=${s.photo.time ? formatLocalInput(s.photo.time, this._tz) : ""}
                 @change=${(e: Event) => { const v = (e.target as HTMLInputElement).value; if (v) this.state = setPhotoTime(this.state, parseLocalInput(v, this._tz)); }}/>`
        : nothing}
      ${hasPhoto(s)
        ? html`<label>Przezroczystość zdjęcia na mapie: ${Math.round(s.opacity * 100)}%</label>
               <input type="range" min="0.1" max="1" step="0.05" .value=${String(s.opacity)}
                 @input=${(e: Event) => (this.state = { ...this.state, opacity: Number((e.target as HTMLInputElement).value) })}/>
               <div style="margin-top:8px;display:flex;gap:8px">
                 <label class="chip" style="cursor:pointer">Zmień zdjęcie
                   <input type="file" accept="image/*" hidden @change=${(e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void this._onFile(f); }}/></label>
                 <button @click=${() => (this.state = skipPhoto(this.state))}>Usuń zdjęcie</button>
               </div>`
        : html`<div style="margin-top:10px"><button @click=${() => { this.state = skipPhoto(this.state); void this._goNext(); }}>Bez zdjęcia →</button></div>`}`;
  }

  _stepStars() {
    const s = this.state;
    const cands = this._candidates();
    return html`
      <p class="hint">Wybierz obiekt z listy i kliknij, gdzie jest na zdjęciu. Drugi obiekt ustawi też zoom i przekrzywienie.
        Niebieskie kropki to gwiazdy z obliczeń – po dopasowaniu powinny leżeć na prawdziwych.</p>
      <div class="cands">${cands.length
        ? cands.slice(0, 16).map((c) => html`<button class=${c.id === this._selected ? "sel" : ""} @click=${() => (this._selected = c.id)}>${c.name}</button>`)
        : html`<span class="hint">Ładowanie pozycji obiektów…</span>`}
        ${s.matches.length ? html`<button @click=${() => (this.state = clearMatches(this.state))}>Wyczyść punkty</button>` : nothing}
      </div>
      ${this._frame(html`<canvas class="wz"></canvas>`, (e) => this._clickStars(e))}
      <p class="hint">Dopasowane punkty: ${s.matches.length}/2 · kierunek ${s.geometry.az_center.toFixed(1)}°, wysokość ${s.geometry.alt_center.toFixed(1)}°, kąt ${s.geometry.hfov.toFixed(1)}°</p>`;
  }

  _stepCompass() {
    const g = this.state.geometry;
    const rad = (d: number) => (d * Math.PI) / 180;
    const pt = (az: number, r: number) => [85 + r * Math.sin(rad(az)), 85 - r * Math.cos(rad(az))];
    const [nx, ny] = pt(g.az_center, 62);
    const marks = [
      ["Wschód Słońca", this.rises?.sun?.az, "#ffd166"],
      ["Wschód Księżyca", this.rises?.moon?.az, "#cfd8ff"],
    ].filter(([, az]) => az !== undefined && az !== null) as [string, number, string][];
    const hy = altToHorizon(g) * 100;
    return html`<div class="row">
      <div>
        <svg class="dial" viewBox="0 0 170 170" @pointerdown=${this._dial} @pointermove=${this._dial}>
          <circle cx="85" cy="85" r="80" fill="#121a38" stroke="rgba(255,255,255,.25)"/>
          ${["N", "E", "S", "W"].map((t, i) => { const [x, y] = pt(i * 90, 68); return svg`<text x=${x} y=${y + 4} fill="#aab3d9" font-size="12" text-anchor="middle">${t}</text>`; })}
          ${marks.map(([, az, col]) => { const [x, y] = pt(az, 78); return svg`<circle cx=${x} cy=${y} r="4" fill=${col}/>`; })}
          <line x1="85" y1="85" x2=${nx} y2=${ny} stroke="#ffb347" stroke-width="4" stroke-linecap="round"/>
          <circle cx="85" cy="85" r="5" fill="#ffb347"/>
        </svg>
        <label>Azymut środka kadru (°)</label>
        <input type="number" min="0" max="359" .value=${String(Math.round(g.az_center))}
          @change=${(e: Event) => this._setGeo({ az_center: ((Number((e.target as HTMLInputElement).value) % 360) + 360) % 360 })}/>
        ${marks.map(([n, az, col]) => html`<div class="hint"><span style="color:${col}">●</span> ${n}: ${Math.round(az)}°</div>`)}
      </div>
      <div class="grow">
        <p class="hint">Przeciągnij zieloną linię na horyzont widoczny na zdjęciu.</p>
        ${this._frame(svg`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="cursor:ns-resize"
            @pointerdown=${this._horizon} @pointermove=${this._horizon} @pointerup=${this._horizon}>
            <line x1="0" x2="100" y1=${hy} y2=${hy} stroke="#3ddc97" stroke-width="0.8" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke"/>
          </svg>`)}
        <label>Kąt widzenia (°)</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button @click=${() => this._setGeo({ hfov: 67 })}>Telefon · zwykły</button>
          <button @click=${() => this._setGeo({ hfov: 105 })}>Szeroki kąt</button>
          <input type="number" min="10" max="120" .value=${String(Math.round(g.hfov))}
            @change=${(e: Event) => this._setGeo({ hfov: Math.max(10, Math.min(120, Number((e.target as HTMLInputElement).value))) })}/>
        </div>
        <label>Przekrzywienie: ${g.roll.toFixed(1)}°</label>
        <input type="range" min="-30" max="30" step="0.5" .value=${String(g.roll)}
          @input=${(e: Event) => this._setGeo({ roll: Number((e.target as HTMLInputElement).value) })}/>
      </div>
    </div>`;
  }

  _stepObstructions() {
    const s = this.state;
    const pts = (p: [number, number][]) => p.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
    return html`
      <p class="hint">Zaznacz to, co zasłania niebo (słupek, budynek, drzewo): klikaj narożniki, potem „Zamknij kształt”. Krok można pominąć.</p>
      ${this._frame(svg`<svg viewBox="0 0 100 100" preserveAspectRatio="none">
          ${s.polys.map((p) => svg`<polygon points=${pts(p)} fill="rgba(0,0,0,.5)" stroke="#ff7b7b" stroke-width="0.4" vector-effect="non-scaling-stroke"/>`)}
          ${this._draft ? svg`<polyline points=${pts(this._draft)} fill="none" stroke="#ffd166" stroke-width="0.6" vector-effect="non-scaling-stroke"/>` : nothing}
        </svg>`, (e) => this._clickObstruction(e))}
      <div class="polys">
        ${this._draft
          ? html`<button class="primary" @click=${() => this._closeDraft()}>Zamknij kształt</button>
                 <button @click=${() => (this._draft = null)}>Anuluj</button>`
          : html`<button @click=${() => (this._draft = [])}>+ Dodaj przeszkodę</button>`}
        ${s.polys.map((_, i) => html`<button @click=${() => (this.state = { ...s, polys: s.polys.filter((__, j) => j !== i) })}>Przeszkoda ${i + 1} ×</button>`)}
      </div>`;
  }

  _stepPreview() {
    const t = this._preview ? new Date(this._preview.base.getTime() + this._previewMin * 60000) : null;
    return html`
      <p class="hint">Tak będzie wyglądać dzisiejsza noc w Twoim kadrze. Przesuń suwak, żeby zobaczyć ruch nieba.</p>
      <div class="frame" style="aspect-ratio:${this.state.geometry.aspect};width:min(100%, calc(60vh * ${this.state.geometry.aspect}));cursor:default">
        <canvas class="wz"></canvas>
        ${hasPhoto(this.state) ? html`<img src=${this.state.photo.blobUrl!} alt="" style="opacity:${this.state.opacity}"/>` : nothing}
        <canvas class="wz-over"></canvas>
      </div>
      <input type="range" min="0" max="720" step="10" .value=${String(this._previewMin)}
        @input=${(e: Event) => (this._previewMin = Number((e.target as HTMLInputElement).value))}/>
      <div class="hint">${t ? t.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Ładowanie…"}</div>`;
  }
}

if (!customElements.get("mapa-nieba-wizard")) customElements.define("mapa-nieba-wizard", MapaNiebaWizard);
