/**
 * Catálogo dos kits Envy Skin — mesmos valores da landing (`envy-skin-clone`).
 * O bridge PIX (`fruitfyBridge`) encaminha `amount` em centavos vindo do checkout;
 * este arquivo documenta os preços base esperados por kit.
 */

export type KitCatalogEntry = {
  id: number;
  name: string;
  treatmentLabel: string;
  /** Preço à vista / principal (R$). */
  priceBRL: number;
  image: string;
  popular: boolean;
};

export const KIT_CATALOG: readonly KitCatalogEntry[] = [
  {
    id: 1,
    name: "1 Unidade",
    treatmentLabel: "Tratamento 1 Mês",
    priceBRL: 39.9,
    image: "https://i.ibb.co/m5Gtd1wC/image.png",
    popular: false,
  },
  {
    id: 2,
    name: "2 Unidades",
    treatmentLabel: "Tratamento 2 Meses",
    priceBRL: 69.9,
    image: "https://i.ibb.co/tMkhqVGJ/image.png",
    popular: true,
  },
  {
    id: 3,
    name: "3 Unidades",
    treatmentLabel: "Tratamento 3 Meses",
    priceBRL: 99.9,
    image: "https://i.ibb.co/60S1K1KV/image.png",
    popular: false,
  },
];

/** Preço “de” (riscado) = 2× o preço promocional, como na UI. */
export function listPriceBRLFromKit(priceBRL: number): number {
  return Math.round(priceBRL * 2 * 100) / 100;
}

export function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Parcela 12× a partir do total do kit. */
export function installment12Label(priceBRL: number): string {
  return formatBRL(Math.round((priceBRL / 12) * 100) / 100);
}
