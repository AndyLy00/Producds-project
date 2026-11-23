// Linella's prices for the products of a list (api/prices.js). Prices change twice a month at
// most, so answers are kept for the whole time the app is open; without a connection the list
// simply shows no prices.
import { useEffect, useState } from "react";
import { api } from "../cloud-sync";
import { locale } from "../i18n";
import { units, type ShoppingItem } from "../model";

export type ShopPrice = { price: number; perKg?: number; step?: string; oldPrice?: number; name: string; url: string; matches: number };
type Answer = { store: string; updatedAt: string | null; prices: Record<string, ShopPrice | null> };

const known = new Map<string, ShopPrice | null>();
let updatedAt: string | null = null;

export function usePrices(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort();
  const key = unique.join("\n");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const missing = unique.filter((name) => !known.has(name));
    if (missing.length === 0) return;
    let cancelled = false;
    api<Answer>("/api/prices", { names: missing.slice(0, 100) }).then((answer) => {
      updatedAt = answer.updatedAt;
      for (const name of missing) known.set(name, answer.prices[name] ?? null);
      if (!cancelled) setVersion((version) => version + 1);
    }, () => undefined);
    return () => { cancelled = true; };
  }, [key]);

  return { prices: Object.fromEntries(unique.map((name) => [name, known.get(name) ?? null])), updatedAt };
}

// What an item of the list would cost, in bani. Weighed products use the price per kg when the
// item is in kg or g; otherwise one package is counted per piece, pack, kg or litre asked for.
export function itemCost(item: Pick<ShoppingItem, "quantity" | "unit">, price: ShopPrice | null | undefined) {
  if (!price) return undefined;
  const quantity = Number(item.quantity.replace(",", ".")) || 1;
  const [pieces, kg, grams, litres, , packs] = units;
  if (price.perKg && item.unit === kg) return Math.round(price.perKg * quantity);
  if (price.perKg && item.unit === grams) return Math.round((price.perKg * quantity) / 1000);
  // "Eggs 10 pcs" asked for, "Яйца С1 10шт" found: one package, not ten.
  if (item.unit === pieces && /\d+\s*(шт|buc|pcs)/i.test(price.name)) return price.price;
  if ([pieces, packs, kg, litres].includes(item.unit)) return Math.round(price.price * quantity);
  return price.price;
}

export function formatLei(bani: number) {
  return `${new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bani / 100)} lei`;
}
