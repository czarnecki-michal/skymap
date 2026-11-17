import { describe, expect, it } from "vitest";
import { MapaNiebaCard } from "../src/mapa-nieba-card";

describe("card config", () => {
  it("requires photo", () => {
    const el = new MapaNiebaCard();
    expect(() => el.setConfig({})).toThrow(/photo/);
  });
  it("defaults photo_opacity to 0.5", () => {
    const el = new MapaNiebaCard();
    el.setConfig({ photo: "/local/balkon.jpg" });
    expect(el._config?.photo_opacity).toBe(0.5);
  });
  it("registers in customCards", () => {
    expect((window as any).customCards.some((c: any) => c.type === "mapa-nieba-card")).toBe(true);
  });
});
