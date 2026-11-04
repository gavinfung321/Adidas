// Live catalogue from Supabase. Requires products.js, whose built-in copy is used if the database
// can't be reached in time. Sets window.IntoTheBlueCatalogueReady, a promise for the catalogue.
(function (root) {
  'use strict';

  const SUPABASE_URL = 'https://pryofarsgkhfbajmdeyy.supabase.co';
  // Publishable keys are meant for browser code; row-level security limits it to reading the catalogue.
  const PUBLISHABLE_KEY = 'sb_publishable_bL1u8hzI8CY6qFqwBtJWMA_fP4VulzL';
  const SELECT = 'id,name,description,unit_price_minor,currency,image,image_alt,active,sort_order,'
    + 'product_images(position,src,label,alt),variants(id,size,active,sort_order,stock)';
  const TIMEOUT_MS = 3000;

  const fallback = root.IntoTheBlueCatalogue;
  const ASSET = /^assets\/[A-Za-z0-9._-]+$/;
  const ID = /^[a-z0-9-]{1,48}$/;
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  const bySortOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

  // Rows that don't look right are skipped rather than shown.
  function toProduct(row) {
    if (!row || !ID.test(row.id) || typeof row.name !== 'string' || !ASSET.test(row.image)) return null;
    if (!Number.isInteger(row.unit_price_minor) || row.unit_price_minor < 100 || row.currency !== 'hkd') return null;
    const variants = (Array.isArray(row.variants) ? row.variants : [])
      .filter(v => v && ID.test(v.id) && typeof v.size === 'string')
      .sort(bySortOrder)
      .map(v => {
        const stock = Number.isInteger(v.stock) && v.stock >= 0 ? v.stock : 0;
        return {
          id: v.id,
          size: text(v.size, 8),
          stock,
          available: v.active === true && stock > 0
        };
      });
    if (!variants.length) return null;
    const photos = (Array.isArray(row.product_images) ? row.product_images : [])
      .filter(photo => photo && ASSET.test(photo.src))
      .sort((a, b) => a.position - b.position)
      .map(photo => Object.freeze({ src: photo.src, label: text(photo.label, 40) || 'Photo', alt: text(photo.alt, 300) }));
    return fallback.product(row.id, {
      name: text(row.name, 80),
      description: text(row.description, 1000),
      image: row.image,
      imageAlt: text(row.image_alt, 300),
      unitPriceMinor: row.unit_price_minor,
      available: row.active === true,
      variants,
      ...(photos.length ? { gallery: Object.freeze(photos) } : {})
    });
  }

  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=${SELECT}&order=sort_order`, {
        headers: { apikey: PUBLISHABLE_KEY },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Catalogue request failed (${response.status}).`);
      const rows = await response.json();
      const products = (Array.isArray(rows) ? rows : []).sort(bySortOrder).map(toProduct).filter(Boolean);
      if (!products.length) throw new Error('Catalogue is empty.');
      return fallback.createCatalogue(products, 'database');
    } catch (error) {
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  root.IntoTheBlueSupabase = Object.freeze({ url: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY });
  root.IntoTheBlueCatalogueReady = load();
})(self);
