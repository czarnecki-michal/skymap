import { LitElement, css, html, nothing, svg } from "lit";
import { STATE_LABELS, moonPath } from "./body-render";
import { applyDrag, applyRoll, applyZoom } from "./calibration";
import { polygonToSky, skyToPolygon, type Poly } from "./obstructions";
import type { WindowGeometry } from "./projection";
import { buildScene, type CardData } from "./scene";
import { bodiesAt, rangeTimes, sliderIndex, type SkyReply } from "./sky-data";

export interface CardConfig {
  type?: string;
  photo: string;
  photo_opacity?: number;
  entry_id?: string;
}

const W = 1000;

export class MapaNiebaCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _data: { state: true },
    _sky: { state: true },
    _offset: { state: true },
    _geo: { state: true },
    _polys: { state: true },
    _draw: { state: true },
    _calibrating: { state: true },
    _hover: { state: true },
    _error: { state: true },
    _saveError: { state: true },
    _imgAspect: { state: true },
  };
  hass: any;
  _config?: CardConfig;
  _data?: CardData;
  _sky?: SkyReply;
  _skyBase = new Date();
  _offset = 0; // minutes from now
  _geo?: WindowGeometry; // draft geometry while calibrating
  _polys: Poly[] = []; // draft obstruction polygons in image coordinates
  _draw: Poly | null = null;
  _calibrating = false;
  _hover: any = null;
  _error = "";
  _saveError = "";
  _imgAspect = 0;
  _loading = false;
  _timer?: number;
  _drag?: { x: number; y: number };

  static styles = css`
    ha-card { padding: 8px; }
    svg { width: 100%; display: block; background: #060a18; touch-action: none; }
    .bar { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
    .bar input[type="range"] { flex: 1; min-width: 120px; }
    .tip { position: absolute; background: var(--card-background-color, #222); color: var(--primary-text-color, #fff);
           padding: 4px 8px; border-radius: 6px; font-size: 12px; pointer-events: none; box-shadow: 0 1px 4px #0008; }
    .wrap { position: relative; }
    .err { color: var(--error-color, red); padding: 8px; }
    button { cursor: pointer; }
  `;

  setConfig(config: Partial<CardConfig>) {
    if (!config || !config.photo) {
      throw new Error("mapa-nieba-card: brakuje wymaganej opcji 'photo'");
    }
    this._config = { photo_opacity: 0.5, ...config } as CardConfig;
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    super.connectedCallback();
    this._timer = window.setInterval(() => void this._loadSky().catch(() => undefined), 10 * 60000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timer) clearInterval(this._timer);
  }

  shouldUpdate(changed: Map<string, unknown>) {
    // state changes elsewhere in HA must not rebuild the whole sky once the card is loaded
    if (this._data && changed.size === 1 && changed.has("hass")) return false;
    return true;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("hass") && this.hass && !this._data && !this._loading) void this._load();
  }

  async _load() {
    this._loading = true;
    try {
      this._data = await this.hass.callWS({ type: "mapa_nieba/config" });
      await this._loadSky();
      this._error = "";
    } catch (e: any) {
      this._error = e?.message || "Nie udało się pobrać danych z integracji Mapa nieba";
    } finally {
      this._loading = false;
    }
  }

  async _loadSky() {
    if (!this.hass || !this._data) return;
    this._skyBase = new Date();
    this._sky = await this.hass.callWS({ type: "mapa_nieba/sky", times: rangeTimes(this._skyBase) });
  }

  get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  get _geometry(): WindowGeometry | undefined {
    return this._calibrating && this._geo ? this._geo : this._data?.geometry;
  }

  _startCalibration() {
    if (!this._data) return;
    this._geo = { ...this._data.geometry };
    if (this._imgAspect > 0) this._geo.aspect = this._imgAspect;
    this._saveError = "";
    this._polys = this._data.obstructions.map((p) => skyToPolygon(this._data!.geometry, p));
    this._calibrating = true;
  }

  async _save() {
    if (!this._geo) return;
    // vertices only (subdivide = 1): re-saving must never multiply the vertex count
    const obstructions = this._polys.filter((p) => p.length >= 3).map((p) => polygonToSky(this._geo!, p, 1));
    try {
      await this.hass.callWS({ type: "mapa_nieba/save_geometry", geometry: this._geo, obstructions });
    } catch (e: any) {
      this._saveError = e?.message || "Zapis nie powiódł się";
      return;
    }
    this._saveError = "";
    this._data = { ...this._data!, geometry: this._geo, obstructions };
    this._calibrating = false;
    this._draw = null;
  }

  _svgPoint(e: PointerEvent | MouseEvent): [number, number] {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  _down(e: PointerEvent) {
    if (!this._calibrating) return;
    if (this._draw) {
      this._draw = [...this._draw, this._svgPoint(e)];
      return;
    }
    this._drag = { x: e.clientX, y: e.clientY };
  }

  _move(e: PointerEvent) {
    if (!this._drag || !this._geo) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    this._geo = applyDrag(this._geo, e.clientX - this._drag.x, e.clientY - this._drag.y, r.width / this._geo.hfov);
    this._drag = { x: e.clientX, y: e.clientY };
  }

  _wheel(e: WheelEvent) {
    if (!this._calibrating || !this._geo) return;
    e.preventDefault();
    this._geo = applyZoom(this._geo, e.deltaY > 0 ? 1.04 : 0.96);
  }

  _closePoly() {
    if (this._draw && this._draw.length >= 3) this._polys = [...this._polys, this._draw];
    this._draw = null;
  }

  _photoLoaded(e: Event) {
    const img = e.target as unknown as { naturalWidth?: number; naturalHeight?: number };
    if (img.naturalWidth && img.naturalHeight) this._imgAspect = img.naturalWidth / img.naturalHeight;
  }

  _openInfo(entityId: string | null) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  render() {
    if (this._error) return html`<ha-card><div class="err">${this._error}</div></ha-card>`;
    const g = this._geometry;
    if (!this._config || !this._data || !g) return html`<ha-card header="Mapa nieba">Ładowanie…</ha-card>`;
    const H = W / g.aspect;
    const idx = sliderIndex(this._offset);
    const date = new Date(this._skyBase.getTime() + this._offset * 60000);
    const sky = this._sky;
    const scene = buildScene({ ...this._data, geometry: g }, sky ? bodiesAt(sky, idx) : {}, date, W, H, sky?.sun_alt?.[idx]);
    const obsShown: Poly[] = this._calibrating
      ? this._polys
      : this._data.obstructions.map((p) => skyToPolygon(g, p));
    const toPts = (p: Poly) => p.map(([x, y]) => `${x * W},${y * H}`).join(" ");
    const moon = sky && sky.moon.illumination[idx] !== undefined
      ? { ill: sky.moon.illumination[idx], phase: sky.moon.phase[idx] }
      : null;

    return html`<ha-card>
      <div class="wrap">
        <svg viewBox="0 0 ${W} ${H}" @pointerdown=${this._down} @pointermove=${this._move}
             @pointerup=${() => (this._drag = undefined)} @wheel=${this._wheel}>
          <image href=${this._config.photo} width=${W} height=${H} preserveAspectRatio="none"
                 opacity=${this._config.photo_opacity ?? 0.5}
                 @load=${(e: Event) => this._photoLoaded(e)}></image>
          ${scene.lines.map((l) => svg`<line x1=${l.x1} y1=${l.y1} x2=${l.x2} y2=${l.y2} stroke="#6f8fff" stroke-width="0.6" opacity="0.5"/>`)}
          ${scene.stars.map((s) => svg`<circle cx=${s.x} cy=${s.y} r=${s.r} fill="#fff" opacity="0.9"/>`)}
          <path d=${scene.horizon} stroke="#3c9" fill="none" stroke-width="1" opacity="0.6"/>
          ${obsShown.map((p) => svg`<polygon points=${toPts(p)} fill="#000" opacity="0.6" stroke="#f55" stroke-width="1"/>`)}
          ${this._draw ? svg`<polyline points=${toPts(this._draw)} fill="none" stroke="#fd0" stroke-width="2"/>` : nothing}
          ${scene.bodies.map((b) => {
            const known = !!b.entity_id;
            const isMoon = b.kind === "moon" && moon;
            return svg`<g @mouseenter=${() => (this._hover = b)} @mouseleave=${() => (this._hover = null)}
                          @click=${() => this._openInfo(b.entity_id)} style="cursor:${known ? "pointer" : "default"}">
              ${isMoon
                ? svg`<g transform="translate(${b.x},${b.y}) scale(10)"><circle r="1" fill="#334"/><path d=${moonPath(moon!.ill, moon!.phase)} fill="#fff"/></g>`
                : svg`<circle cx=${b.x} cy=${b.y} r=${b.kind === "sun" ? 9 : 5} fill=${b.kind === "sun" ? "#fd0" : "#fc8"}
                       stroke=${known ? "#fff" : "none"} stroke-width="1.5"/>`}
              <text x=${b.x + 12} y=${b.y + 4} fill="#fff" font-size="13">${b.name}</text></g>`;
          })}
        </svg>
        ${this._hover ? this._tooltip(this._hover, W, H) : nothing}
      </div>
      <div class="bar">
        <input type="range" min="-720" max="720" step="10" .value=${String(this._offset)}
               @input=${(e: Event) => (this._offset = Number((e.target as HTMLInputElement).value))}/>
        <span>${this._offset === 0 ? "teraz" : `${this._offset > 0 ? "+" : ""}${(this._offset / 60).toFixed(1)} h`}</span>
        <button @click=${() => (this._offset = 0)}>Teraz</button>
        ${this._isAdmin && !this._calibrating ? html`<button @click=${() => this._startCalibration()}>Kalibruj</button>` : nothing}
      </div>
      ${this._calibrating ? this._calibrationBar() : nothing}
    </ha-card>`;
  }

  _tooltip(b: any, w: number, h: number) {
    const st = b.entity_id && this._offset === 0 ? this.hass?.states?.[b.entity_id]?.state : undefined;
    return html`<div class="tip" style="left:${(b.x / w) * 100}%;top:${(b.y / h) * 100}%">
      <b>${b.name}</b><br/>wys. ${b.alt.toFixed(1)}°, azym. ${b.az.toFixed(1)}°
      ${st ? html`<br/>${STATE_LABELS[st] ?? st}` : nothing}</div>`;
  }

  _calibrationBar() {
    const g = this._geo!;
    return html`<div class="bar">
      <span>Przeciągnij mapę, kółkiem zmień zoom.</span>
      <label>Obrót <input type="range" min="-30" max="30" step="0.5" .value=${String(g.roll)}
        @input=${(e: Event) => (this._geo = applyRoll(g, Number((e.target as HTMLInputElement).value)))}/></label>
      <span>az ${g.az_center.toFixed(1)}° alt ${g.alt_center.toFixed(1)}° fov ${g.hfov.toFixed(1)}°</span>
      ${this._draw
        ? html`<button @click=${() => this._closePoly()}>Zamknij kształt</button>`
        : html`<button @click=${() => (this._draw = [])}>Dodaj przeszkodę</button>
               <button @click=${() => (this._polys = this._polys.slice(0, -1))}>Cofnij przeszkodę</button>`}
      <button @click=${() => this._save()}>Zapisz</button>
      ${this._saveError ? html`<span class="err">${this._saveError}</span>` : nothing}
      <button @click=${() => ((this._calibrating = false), (this._draw = null))}>Anuluj</button>
    </div>`;
  }
}

customElements.define("mapa-nieba-card", MapaNiebaCard);
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "mapa-nieba-card",
  name: "Mapa nieba",
  description: "Niebo z balkonu: planety, gwiazdy i Księżyc na zdjęciu okna.",
});
