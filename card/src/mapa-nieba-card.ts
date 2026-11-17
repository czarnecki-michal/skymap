import { LitElement, css, html, nothing } from "lit";
import { STATE_LABELS } from "./body-render";
import { photoTransform } from "./homography";
import { drawOverlay, drawSky, hitTest } from "./renderer";
import { buildScene, type CardData, type Scene } from "./scene";
import { HALF_RANGE, STEP_MIN, bodiesAt, rangeTimes, sliderIndex, type SkyReply } from "./sky-data";
import { fromWindow, panView, skyColors, zoomView, type View } from "./view";

export interface CardConfig {
  type?: string;
  photo?: string;
  photo_opacity?: number;
}

const RANGE_MIN = HALF_RANGE * STEP_MIN; // 720
const PLAY_MS = 20000; // whole range in ~20 s
const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function compassLabel(az: number): string {
  return `${DIRS[Math.round(az / 22.5) % 16]} · ${Math.round(az)}°`;
}

export class MapaNiebaCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _data: { state: true },
    _sky: { state: true },
    _offset: { state: true },
    _view: { state: true },
    _playing: { state: true },
    _hover: { state: true },
    _error: { state: true },
    _photoSrc: { state: true },
    _wizardOpen: { state: true },
    _size: { state: true },
  };
  hass: any;
  _config: CardConfig = {};
  _data?: CardData;
  _sky?: SkyReply;
  _skyBase = new Date();
  _offset = 0;
  _view: View = { az: 135, alt: 15, hfov: 67 };
  _playing = false;
  _hover: string | null = null;
  _error = "";
  _photoSrc = "";
  _wizardOpen = false;
  _size = { w: 0, h: 0 };
  _loading = false;
  _timer?: number;
  _raf = 0;
  _lastTick = 0;
  _scene?: Scene;
  _ro?: ResizeObserver;
  _pointers = new Map<number, { x: number; y: number }>();
  _moved = false;
  _pinch = 0;

  static getStubConfig() {
    return {};
  }

  static styles = css`
    ha-card { overflow: hidden; padding: 0; }
    .stage { position: relative; width: 100%; overflow: hidden; background: #050816; touch-action: none;
             user-select: none; max-height: 85vh; }
    canvas, img.photo { position: absolute; left: 0; top: 0; }
    img.photo { transform-origin: 0 0; pointer-events: none; }
    canvas.overlay { cursor: grab; }
    canvas.overlay:active { cursor: grabbing; }
    .glass { background: rgba(10, 14, 30, 0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
             color: #fff; border: 1px solid rgba(255, 255, 255, 0.08); }
    .compass { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); border-radius: 999px;
               padding: 3px 12px; font-size: 12px; letter-spacing: 1.5px; pointer-events: none; }
    .fab { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%;
           font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .bar { position: absolute; left: 10px; right: 10px; bottom: 10px; border-radius: 12px; padding: 6px 10px;
           display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .bar button { background: rgba(255, 255, 255, 0.12); border: 0; color: #fff; border-radius: 999px;
                  min-width: 32px; height: 28px; cursor: pointer; font-size: 14px; }
    .bar input { flex: 1; accent-color: #8fb3ff; min-width: 60px; }
    .time { font-variant-numeric: tabular-nums; min-width: 92px; text-align: center; opacity: .9; }
    .tip { position: absolute; transform: translate(14px, -50%); border-radius: 8px; padding: 6px 10px;
           font-size: 12px; pointer-events: none; white-space: nowrap; }
    .err { color: var(--error-color, #f66); padding: 12px; }
  `;

  setConfig(config: CardConfig) {
    if (!config) throw new Error("mapa-nieba-card: brak konfiguracji");
    this._config = { ...config };
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
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this._ro = undefined;
  }

  shouldUpdate(changed: Map<string, unknown>) {
    if (this._data && changed.size === 1 && changed.has("hass")) return false;
    return true;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("hass") && this.hass && !this._data && !this._loading && !this._error) void this._load();
    const stage = this.renderRoot.querySelector(".stage") as HTMLElement | null;
    if (stage && !this._ro && typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        this._size = { w: stage.clientWidth, h: stage.clientHeight };
      });
      this._ro.observe(stage);
    }
    this._draw();
  }

  async _load() {
    this._loading = true;
    try {
      this._data = await this.hass.callWS({ type: "mapa_nieba/config" });
      this._view = fromWindow(this._data!.geometry);
      await this._resolvePhoto();
      await this._loadSky();
      this._error = "";
    } catch (e: any) {
      this._error = e?.message || "Nie udało się pobrać danych z integracji Mapa nieba";
    } finally {
      this._loading = false;
    }
  }

  async _resolvePhoto() {
    if (this._config.photo) {
      this._photoSrc = this._config.photo;
      return;
    }
    const p = this._data?.photo;
    if (!p) {
      this._photoSrc = "";
      return;
    }
    const signed = await this.hass.callWS({ type: "auth/sign_path", path: `${p.url}?v=${p.version}` });
    this._photoSrc = signed.path;
  }

  async _loadSky() {
    if (!this.hass || !this._data) return;
    this._skyBase = new Date();
    this._sky = await this.hass.callWS({ type: "mapa_nieba/sky", times: rangeTimes(this._skyBase) });
  }

  // ---- interaction -------------------------------------------------------
  _pan(dx: number, dy: number, pxPerDeg: number) {
    this._view = panView(this._view, dx, dy, pxPerDeg);
  }

  _recenter() {
    if (this._data) this._view = fromWindow(this._data.geometry);
  }

  _togglePlay() {
    this._playing = !this._playing;
    if (this._playing) {
      if (this._offset >= RANGE_MIN) this._offset = -RANGE_MIN;
      this._lastTick = performance.now();
      const step = (t: number) => {
        if (!this._playing) return;
        this._advance(t - this._lastTick);
        this._lastTick = t;
        if (this._playing) this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }
  }

  _advance(ms: number) {
    const next = this._offset + (ms / PLAY_MS) * 2 * RANGE_MIN;
    if (next >= RANGE_MIN) {
      this._offset = RANGE_MIN;
      this._playing = false;
    } else {
      this._offset = next;
    }
  }

  _local(e: PointerEvent | WheelEvent): [number, number] {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._moved = false;
    this._pinch = 0;
  }

  _move(e: PointerEvent) {
    const prev = this._pointers.get(e.pointerId);
    if (!prev) {
      const [x, y] = this._local(e);
      const id = this._scene ? hitTest(this._scene, x, y) : null;
      if (id !== this._hover) this._hover = id;
      return;
    }
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch) this._view = zoomView(this._view, this._pinch / d);
      this._pinch = d;
      this._moved = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      this._moved = true;
      this._pan(dx, dy, this._size.w / this._view.hfov || 10);
    }
  }

  _up(e: PointerEvent) {
    this._pointers.delete(e.pointerId);
    if (!this._moved && this._scene) {
      const [x, y] = this._local(e);
      const id = hitTest(this._scene, x, y);
      const ent = id ? this._data?.objects.find((o) => o.id === id)?.entity_id : null;
      if (ent) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: ent }, bubbles: true, composed: true }));
      }
    }
  }

  _wheel(e: WheelEvent) {
    e.preventDefault();
    this._view = zoomView(this._view, e.deltaY > 0 ? 1.08 : 0.92);
  }

  // ---- drawing -----------------------------------------------------------
  get _date(): Date {
    return new Date(this._skyBase.getTime() + this._offset * 60000);
  }

  _draw() {
    const { w, h } = this._size;
    if (!this._data || !w || !h) return;
    const idx = sliderIndex(this._offset);
    const sunAlt = this._sky?.sun_alt?.[idx];
    const scene = buildScene(this._data, this._sky ? bodiesAt(this._sky, idx) : {}, this._date, this._view, w, h, sunAlt);
    this._scene = scene;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const cls of ["sky", "overlay"]) {
      const c = this.renderRoot.querySelector(`canvas.${cls}`) as HTMLCanvasElement | null;
      if (!c) continue;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cls === "sky") {
        drawSky(ctx, scene, skyColors(sunAlt ?? -30), w, h);
      } else {
        const ill = this._sky?.moon.illumination[idx];
        const moon = ill !== undefined ? { ill, phase: this._sky!.moon.phase[idx] } : null;
        const highlight = new Set(this._data.objects.filter((o) => o.entity_id).map((o) => o.id));
        drawOverlay(ctx, scene, highlight, this._hover, moon, w, h);
      }
    }
  }

  render() {
    if (this._error) return html`<ha-card><div class="err">${this._error}</div></ha-card>`;
    if (!this._data) return html`<ha-card><div class="err" style="color:inherit">Ładowanie mapy nieba…</div></ha-card>`;
    const { w, h } = this._size;
    const g = this._data.geometry;
    const transform = this._photoSrc && w ? photoTransform(g, this._view, w, h) : null;
    const opacity = this._config.photo_opacity ?? this._data.photo_opacity ?? 0.6;
    const time = this._date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const isAdmin = !!this.hass?.user?.is_admin;
    return html`<ha-card>
      <div class="stage" style="aspect-ratio:${g.aspect}">
        <canvas class="sky"></canvas>
        ${this._photoSrc
          ? html`<img class="photo" src=${this._photoSrc} alt=""
                 style="width:${w}px;height:${h}px;opacity:${opacity};display:${transform ? "block" : "none"};transform:${transform ?? "none"}"/>`
          : nothing}
        <canvas class="overlay" @pointerdown=${this._down} @pointermove=${this._move} @pointerup=${this._up}
                @pointercancel=${this._up} @pointerleave=${() => (this._hover = null)} @wheel=${this._wheel}></canvas>
        <div class="compass glass">${compassLabel(this._view.az)}</div>
        <button class="fab recenter glass" title="Wróć do okna" @click=${() => this._recenter()}>⌖</button>
        ${this._hover ? this._tooltip() : nothing}
        <div class="bar glass">
          <button title=${this._playing ? "Pauza" : "Odtwórz noc"} @click=${() => this._togglePlay()}>${this._playing ? "⏸" : "▶"}</button>
          <input type="range" min=${-RANGE_MIN} max=${RANGE_MIN} step="1" .value=${String(Math.round(this._offset))}
                 @input=${(e: Event) => { this._playing = false; this._offset = Number((e.target as HTMLInputElement).value); }}/>
          <span class="time">${time}${this._offset === 0 ? " · teraz" : ""}</span>
          <button title="Teraz" @click=${() => { this._playing = false; this._offset = 0; }}>●</button>
          ${isAdmin ? html`<button class="wizard-btn" title="Kreator" @click=${() => (this._wizardOpen = true)}>⚙</button>` : nothing}
        </div>
      </div>
    </ha-card>`;
  }

  _tooltip() {
    const b = this._scene?.bodies.find((x) => x.id === this._hover);
    if (!b) return nothing;
    const st = b.entity_id && this._offset === 0 ? this.hass?.states?.[b.entity_id]?.state : undefined;
    return html`<div class="tip glass" style="left:${b.x}px;top:${b.y}px">
      <b>${b.name}</b><br/>wys. ${b.alt.toFixed(1)}° · azym. ${b.az.toFixed(1)}°
      ${st ? html`<br/>${STATE_LABELS[st] ?? st}` : nothing}</div>`;
  }
}

if (!customElements.get("mapa-nieba-card")) customElements.define("mapa-nieba-card", MapaNiebaCard);
(window as any).customCards = (window as any).customCards || [];
if (!(window as any).customCards.some((c: any) => c.type === "mapa-nieba-card")) {
  (window as any).customCards.push({
    type: "mapa-nieba-card",
    name: "Mapa nieba",
    description: "Niebo z balkonu w stylu planetarium: planety, gwiazdy, konstelacje i Księżyc.",
    preview: true,
  });
}
