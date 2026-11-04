// Cart state: pure operations over lines of { productId, variantId, quantity }.
// Names, sizes, images and prices are always resolved from the catalogue, never from storage.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IntoTheBlueCart = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'into-the-blue:cart:v1';
  const SCHEMA_VERSION = 1;
  const MIN_QUANTITY = 1;
  // A demo UI guard, not a stock claim.
  const MAX_QUANTITY = 10;

  const isValidQuantity = q => Number.isInteger(q) && q >= MIN_QUANTITY && q <= MAX_QUANTITY;

  function createCartModel(catalogue) {
    const variantIndex = new Map();
    catalogue.products.forEach(product => product.variants.forEach(variant => {
      variantIndex.set(variant.id, { product, variant });
    }));

    function resolve(productId, variantId) {
      if (typeof productId !== 'string' || typeof variantId !== 'string') return null;
      const entry = variantIndex.get(variantId);
      return entry && entry.product.id === productId ? entry : null;
    }

    function findLine(lines, variantId) {
      return lines.find(line => line.variantId === variantId) || null;
    }

    // Products switched off or sold out stay resolvable but can't be bought.
    const isAvailable = entry => entry.variant.available !== false;
    const stockCap = entry => {
      const stock = Number.isInteger(entry.variant.stock) ? entry.variant.stock : MAX_QUANTITY;
      return Math.max(0, Math.min(MAX_QUANTITY, stock));
    };

    function add(lines, productId, variantId) {
      const entry = resolve(productId, variantId);
      if (!entry) return { status: 'invalid', lines };
      if (!isAvailable(entry) || stockCap(entry) < 1) return { status: 'unavailable', lines };
      const existing = findLine(lines, variantId);
      const cap = stockCap(entry);
      if (!existing) {
        return { status: 'added', quantity: 1, lines: [...lines, { productId, variantId, quantity: 1 }] };
      }
      if (existing.quantity >= cap) return { status: 'limit', quantity: existing.quantity, lines };
      const quantity = existing.quantity + 1;
      return {
        status: 'incremented',
        quantity,
        lines: lines.map(line => line === existing ? { ...line, quantity } : line)
      };
    }

    function setQuantity(lines, variantId, quantity) {
      const existing = findLine(lines, variantId);
      if (!existing || !isValidQuantity(quantity)) return { status: 'invalid', lines };
      const entry = resolve(existing.productId, variantId);
      if (!entry) return { status: 'invalid', lines };
      const cap = stockCap(entry);
      if (quantity > cap) return { status: 'limit', quantity: existing.quantity, lines };
      return {
        status: 'updated',
        quantity,
        lines: lines.map(line => line === existing ? { ...line, quantity } : line)
      };
    }

    function remove(lines, variantId) {
      const next = lines.filter(line => line.variantId !== variantId);
      return { status: next.length === lines.length ? 'invalid' : 'removed', lines: next };
    }

    function totalUnits(lines) {
      return lines.reduce((sum, line) => sum + line.quantity, 0);
    }

    function describe(lines) {
      return lines.map(line => {
        const { product, variant } = resolve(line.productId, line.variantId);
        return {
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          size: variant.size,
          image: product.image,
          imageAlt: product.imageAlt,
          quantity: line.quantity,
          available: isAvailable({ product, variant }),
          stock: Number.isInteger(variant.stock) ? variant.stock : MAX_QUANTITY,
          unitPriceMinor: product.unitPriceMinor,
          lineTotalMinor: product.unitPriceMinor * line.quantity
        };
      });
    }

    function maxPurchasable(productId, variantId) {
      const entry = resolve(productId, variantId);
      return entry ? stockCap(entry) : 0;
    }

    // Lines that can go to checkout.
    function purchasable(lines) {
      return lines.filter(line => isAvailable(resolve(line.productId, line.variantId)));
    }

    function subtotalMinor(lines) {
      return describe(purchasable(lines)).reduce((sum, line) => sum + line.lineTotalMinor, 0);
    }

    // Returns only valid rows; duplicates merge and are capped at the limit.
    function validate(rows) {
      const result = [];
      let repaired = false;
      if (!Array.isArray(rows)) return { lines: result, repaired: true };
      rows.forEach(row => {
        const entry = row && typeof row === 'object' ? resolve(row.productId, row.variantId) : null;
        if (!entry || !isValidQuantity(row.quantity)) {
          repaired = true;
          return;
        }
        const cap = stockCap(entry);
        const existing = findLine(result, row.variantId);
        if (existing) {
          repaired = true;
          existing.quantity = Math.min(cap, existing.quantity + row.quantity);
        } else {
          const quantity = Math.min(cap, row.quantity);
          if (quantity !== row.quantity) repaired = true;
          if (quantity >= MIN_QUANTITY) result.push({ productId: row.productId, variantId: row.variantId, quantity });
          else repaired = true;
        }
      });
      return { lines: result, repaired };
    }

    // Combines two bags (device and account): same items add up, capped at the limit.
    function merge(first, second) {
      return validate([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])]).lines;
    }

    function parse(json) {
      if (json === null || json === undefined || json === '') return { lines: [], repaired: false };
      let data;
      try {
        data = JSON.parse(json);
      } catch (error) {
        return { lines: [], repaired: true };
      }
      if (!data || typeof data !== 'object' || data.version !== SCHEMA_VERSION) return { lines: [], repaired: true };
      return validate(data.lines);
    }

    function serialize(lines) {
      return JSON.stringify({
        version: SCHEMA_VERSION,
        lines: lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }))
      });
    }

    function load(storage) {
      if (!storage) return { lines: [], repaired: false, persistent: false };
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (error) {
        return { lines: [], repaired: false, persistent: false };
      }
      return { ...parse(raw), persistent: true };
    }

    function save(storage, lines) {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, serialize(lines));
        return true;
      } catch (error) {
        return false;
      }
    }

    return { resolve, add, setQuantity, remove, totalUnits, subtotalMinor, describe, purchasable, maxPurchasable, validate, merge, parse, serialize, load, save };
  }

  return { STORAGE_KEY, SCHEMA_VERSION, MIN_QUANTITY, MAX_QUANTITY, isValidQuantity, createCartModel };
});
