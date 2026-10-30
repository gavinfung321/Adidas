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

    function add(lines, productId, variantId) {
      const entry = resolve(productId, variantId);
      if (!entry) return { status: 'invalid', lines };
      const existing = findLine(lines, variantId);
      if (!existing) {
        return { status: 'added', quantity: 1, lines: [...lines, { productId, variantId, quantity: 1 }] };
      }
      if (existing.quantity >= MAX_QUANTITY) return { status: 'limit', quantity: existing.quantity, lines };
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
          unitPriceMinor: product.unitPriceMinor,
          lineTotalMinor: product.unitPriceMinor * line.quantity
        };
      });
    }

    function subtotalMinor(lines) {
      return describe(lines).reduce((sum, line) => sum + line.lineTotalMinor, 0);
    }

    // Returns only valid rows; duplicates merge and are capped at the limit.
    function validate(rows) {
      const result = [];
      let repaired = false;
      if (!Array.isArray(rows)) return { lines: result, repaired: true };
      rows.forEach(row => {
        if (!row || typeof row !== 'object' || !resolve(row.productId, row.variantId) || !isValidQuantity(row.quantity)) {
          repaired = true;
          return;
        }
        const existing = findLine(result, row.variantId);
        if (existing) {
          repaired = true;
          existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + row.quantity);
        } else {
          result.push({ productId: row.productId, variantId: row.variantId, quantity: row.quantity });
        }
      });
      return { lines: result, repaired };
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

    return { resolve, add, setQuantity, remove, totalUnits, subtotalMinor, describe, validate, parse, serialize, load, save };
  }

  return { STORAGE_KEY, SCHEMA_VERSION, MIN_QUANTITY, MAX_QUANTITY, isValidQuantity, createCartModel };
});
