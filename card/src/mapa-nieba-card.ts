import { LitElement, html } from "lit";

export interface CardConfig {
  type?: string;
  photo: string;
  photo_opacity?: number;
  entry_id?: string;
}

export class MapaNiebaCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };
  hass: any;
  _config?: CardConfig;

  setConfig(config: Partial<CardConfig>) {
    if (!config || !config.photo) {
      throw new Error("mapa-nieba-card: brakuje wymaganej opcji 'photo'");
    }
    this._config = { photo_opacity: 0.5, ...config } as CardConfig;
  }

  getCardSize() {
    return 6;
  }

  render() {
    return html`<ha-card header="Mapa nieba"></ha-card>`;
  }
}

customElements.define("mapa-nieba-card", MapaNiebaCard);
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: "mapa-nieba-card",
  name: "Mapa nieba",
  description: "Niebo z balkonu: planety, gwiazdy i Księżyc na zdjęciu okna.",
});
