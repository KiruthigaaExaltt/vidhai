const CORE_PRODUCT_NAMES = new Set([
  "mushroom",
  "grow bag",
  "grow bags",
  "manure",
]);

export const isCoreProductMasterItem = (name: unknown) =>
  CORE_PRODUCT_NAMES.has(
    String(name ?? "")
      .trim()
      .toLowerCase(),
  );
