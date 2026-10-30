// Product selectors and the demo bag drawer. Requires products.js and cart.js.
(() => {
  'use strict';
  const catalogue = window.IntoTheBlueCatalogue;
  const Cart = window.IntoTheBlueCart;
  const cart = Cart.createCartModel(catalogue);
  const money = catalogue.formatMoney;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  const purchaseDialog = $('#purchase-dialog');
  const winterDialog = $('#winter-dialog');
  const bagDialog = $('#bag-dialog');
  const managedDialogs = [purchaseDialog, winterDialog, bagDialog];
  const menuToggle = $('.mobile-menu-toggle');
  const mobileMenu = $('#mobile-menu');

  const ui = {
    lines: $('#bag-lines'),
    empty: $('#bag-empty'),
    summary: $('#bag-summary'),
    subtotal: $('#bag-subtotal'),
    headCount: $('#bag-head-count'),
    itemsView: $('#bag-items-view'),
    checkoutView: $('#bag-checkout-view'),
    checkoutNotice: $('#bag-checkout-notice'),
    checkoutButton: $('#bag-checkout'),
    storageNotice: $('#bag-storage-notice'),
    live: $('#bag-live')
  };

  // ---- State and persistence ----
  let storage = null;
  try { storage = window.localStorage; } catch (error) { storage = null; }
  const loaded = cart.load(storage);
  let lines = loaded.lines;
  let persistent = loaded.persistent;
  if (loaded.repaired) persistent = cart.save(storage, lines);

  function commit(nextLines) {
    lines = nextLines;
    persistent = cart.save(storage, lines);
    render();
  }

  addEventListener('storage', event => {
    if (event.key !== Cart.STORAGE_KEY) return;
    lines = cart.parse(event.newValue).lines;
    render();
  });

  // ---- Modal handling: one managed dialog at a time, scroll lock, focus return ----
  let returnTarget = null;
  let savedScrollStyles = null;

  function lockScroll() {
    if (savedScrollStyles) return;
    const root = document.documentElement;
    savedScrollStyles = { overflow: root.style.overflow, scrollbarGutter: root.style.scrollbarGutter };
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  }

  function unlockScroll() {
    if (!savedScrollStyles) return;
    Object.assign(document.documentElement.style, savedScrollStyles);
    savedScrollStyles = null;
  }

  function closeMobileMenu() {
    mobileMenu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  const isVisible = el => Boolean(el && el.isConnected && el.getClientRects().length && !el.closest('dialog:not([open]), [hidden], [inert]'));

  function fallbackFocusTarget() {
    return $$('[data-bag-open]').find(isVisible) || (isVisible(menuToggle) ? menuToggle : null);
  }

  // `trigger` is the page control to return focus to; omit it to keep the current one
  // (used when moving from a product selector straight into the bag).
  function openModal(dialog, trigger) {
    if (trigger !== undefined) returnTarget = trigger;
    closeMobileMenu();
    $$('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
    lockScroll();
    if (!dialog.open) dialog.showModal();
  }

  managedDialogs.forEach(dialog => dialog.addEventListener('close', () => {
    // Close events are queued, so a dialog opened in the same step is already open here.
    if (managedDialogs.some(other => other.open)) return;
    unlockScroll();
    const target = isVisible(returnTarget) ? returnTarget : fallbackFocusTarget();
    returnTarget = null;
    if (target) target.focus({ preventScroll: true });
  }));

  // ---- Announcements ----
  let announceTimer = 0;
  function announce(message) {
    clearTimeout(announceTimer);
    ui.live.textContent = '';
    announceTimer = setTimeout(() => { ui.live.textContent = message; }, 120);
  }

  const units = n => `${n} ${n === 1 ? 'item' : 'items'}`;

  // ---- Product selectors ----
  function renderSizeOptions(form, product) {
    const container = form.querySelector('[data-size-options]');
    container.replaceChildren(...product.variants.map(variant => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'variant';
      input.value = variant.id;
      const text = document.createElement('span');
      text.textContent = variant.size;
      label.append(input, text);
      return label;
    }));
  }

  function setSizeError(form, message) {
    const error = form.querySelector('.size-error');
    const fieldset = form.querySelector('fieldset');
    error.textContent = message;
    if (message) fieldset.setAttribute('aria-invalid', 'true');
    else fieldset.removeAttribute('aria-invalid');
  }

  function prepareSelector(form, product) {
    form.dataset.productId = product.id;
    form.querySelector('[data-product-price]').textContent = money(product.unitPriceMinor);
    renderSizeOptions(form, product);
    setSizeError(form, '');
  }

  function handleAdd(form) {
    const product = catalogue.getProduct(form.dataset.productId);
    const variantId = new FormData(form).get('variant');
    if (!product || !variantId) {
      setSizeError(form, 'Please choose a size before adding to your bag.');
      form.querySelector('input[name="variant"]')?.focus();
      return;
    }
    const result = cart.add(lines, product.id, variantId);
    const { variant } = cart.resolve(product.id, variantId) || {};
    if (result.status === 'invalid') {
      setSizeError(form, 'That size isn’t available in this demo. Please choose another.');
      return;
    }
    if (result.status === 'limit') {
      setSizeError(form, `You already have ${Cart.MAX_QUANTITY} in size ${variant.size} — the most this demo bag allows per size.`);
      return;
    }
    commit(result.lines);
    openBag();
    announce(result.quantity > 1
      ? `Added another ${product.name}, size ${variant.size}. Quantity is now ${result.quantity}. Bag has ${units(cart.totalUnits(lines))}.`
      : `Added ${product.name}, size ${variant.size}, to your bag. Bag has ${units(cart.totalUnits(lines))}.`);
  }

  [$('#purchase-form'), $('#winter-form')].forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      handleAdd(form);
    });
    form.addEventListener('change', () => setSizeError(form, ''));
  });

  const purchaseForm = $('#purchase-form');
  const featured = catalogue.getProduct(purchaseForm.dataset.productId);
  prepareSelector(purchaseForm, featured);

  $$('[data-buy]').forEach(button => button.addEventListener('click', () => {
    purchaseForm.reset();
    setSizeError(purchaseForm, '');
    openModal(purchaseDialog, button);
  }));

  const winterForm = $('#winter-form');
  const winterPhoto = $('#winter-dialog-photo');
  const winterThumbnails = $('#winter-thumbnails');

  function renderWinterGallery(product) {
    const photos = product.gallery || [{ src: product.image, alt: product.imageAlt, label: 'Product' }];
    const show = (photo, button) => {
      winterPhoto.src = photo.src;
      winterPhoto.alt = photo.alt;
      winterThumbnails.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    };
    winterThumbnails.replaceChildren(...photos.map(photo => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Show ${photo.label.toLowerCase()} view`);
      const thumb = document.createElement('img');
      thumb.src = photo.src;
      thumb.alt = '';
      button.append(thumb);
      button.addEventListener('click', () => show(photo, button));
      return button;
    }));
    winterThumbnails.hidden = photos.length < 2;
    winterPhoto.parentElement.querySelectorAll('.gallery-arrow').forEach(arrow => { arrow.hidden = photos.length < 2; });
    show(photos[0], winterThumbnails.querySelector('button'));
  }

  // Arrows and swipes step through the thumbnails, so each gallery keeps its own selection logic.
  function stepGallery(gallery, step) {
    const thumbs = Array.from(gallery.querySelectorAll('.purchase-thumbnails [aria-pressed]'));
    if (thumbs.length < 2) return;
    const current = Math.max(0, thumbs.findIndex(button => button.getAttribute('aria-pressed') === 'true'));
    const next = thumbs[(current + step + thumbs.length) % thumbs.length];
    next.click();
    const strip = next.parentElement;
    const offset = next.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({
      left: strip.scrollLeft + offset - (strip.clientWidth - next.offsetWidth) / 2,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  $$('.gallery-stage').forEach(stage => {
    const gallery = stage.parentElement;
    stage.querySelectorAll('[data-gallery-step]').forEach(arrow => {
      arrow.addEventListener('click', () => stepGallery(gallery, Number(arrow.dataset.galleryStep)));
    });
    let startX = null;
    stage.addEventListener('touchstart', event => { startX = event.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', event => {
      if (startX === null) return;
      const dx = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) stepGallery(gallery, dx < 0 ? 1 : -1);
    }, { passive: true });
  });
  $$('[data-winter]').forEach(button => button.addEventListener('click', () => {
    const product = catalogue.getProduct(button.dataset.winter);
    if (!product) return;
    $('#winter-dialog-title').textContent = product.name;
    renderWinterGallery(product);
    $('#winter-dialog-description').textContent = product.description;
    prepareSelector(winterForm, product);
    openModal(winterDialog, button);
  }));
  // ---- Bag drawer ----
  function showView(view) {
    ui.itemsView.hidden = view !== 'items';
    ui.checkoutView.hidden = view !== 'checkout';
  }

  function openBag(trigger) {
    showView('items');
    openModal(bagDialog, trigger);
  }

  $$('[data-bag-open]').forEach(button => button.addEventListener('click', () => openBag(button)));
  $$('[data-bag-continue]').forEach(button => button.addEventListener('click', () => bagDialog.close()));
  ui.checkoutButton.addEventListener('click', () => {
    if (!lines.length) return;
    showView('checkout');
    ui.checkoutNotice.focus();
  });
  $('#bag-back').addEventListener('click', () => {
    showView('items');
    ui.checkoutButton.focus();
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function hiddenLabel(text) {
    return el('span', 'visually-hidden', text);
  }

  function renderLine(line) {
    const label = `${line.name}, size ${line.size}`;
    const item = el('li', 'bag-line');
    item.dataset.variantId = line.variantId;

    const image = el('img', 'bag-line-photo');
    image.src = line.image;
    image.alt = '';

    const info = el('div', 'bag-line-info');
    const name = el('h3', 'bag-line-name', line.name);
    const size = el('p', 'bag-line-meta', `Size ${line.size}`);
    const unit = el('p', 'bag-line-meta', `${money(line.unitPriceMinor)} each`);

    const qty = el('div', 'bag-qty');
    qty.setAttribute('role', 'group');
    qty.setAttribute('aria-label', `Quantity for ${label}`);
    const minus = el('button', 'bag-qty-button', '−');
    minus.type = 'button';
    minus.dataset.action = 'decrease';
    minus.setAttribute('aria-label', `Decrease quantity of ${label}`);
    minus.disabled = line.quantity <= Cart.MIN_QUANTITY;
    const value = el('span', 'bag-qty-value');
    value.append(hiddenLabel('Quantity '), document.createTextNode(String(line.quantity)));
    const plus = el('button', 'bag-qty-button', '+');
    plus.type = 'button';
    plus.dataset.action = 'increase';
    plus.setAttribute('aria-label', `Increase quantity of ${label}`);
    plus.disabled = line.quantity >= Cart.MAX_QUANTITY;
    qty.append(minus, value, plus);

    const remove = el('button', 'bag-remove', 'Remove');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.setAttribute('aria-label', `Remove ${label} from bag`);

    info.append(name, size, unit, qty);
    if (line.quantity >= Cart.MAX_QUANTITY) {
      info.append(el('p', 'bag-limit', `Demo limit: ${Cart.MAX_QUANTITY} per size. This is not a stock limit.`));
    }
    info.append(remove);

    const total = el('p', 'bag-line-total');
    total.append(hiddenLabel('Line total '), document.createTextNode(money(line.lineTotalMinor)));

    item.append(image, info, total);
    return item;
  }

  function render() {
    const described = cart.describe(lines);
    const count = cart.totalUnits(lines);

    $$('[data-bag-count]').forEach(badge => { badge.textContent = String(count); });
    $$('[data-bag-open]').forEach(button => button.setAttribute('aria-label', `Bag, ${units(count)}`));
    ui.headCount.textContent = units(count);

    ui.lines.replaceChildren(...described.map(renderLine));
    ui.lines.hidden = !described.length;
    ui.empty.hidden = described.length > 0;
    ui.summary.hidden = !described.length;
    ui.checkoutButton.disabled = !described.length;
    ui.subtotal.textContent = described.length ? money(cart.subtotalMinor(lines)) : '';
    ui.storageNotice.hidden = persistent;
    if (!described.length && !ui.checkoutView.hidden) showView('items');
  }

  function restoreFocus(variantId, action) {
    const item = ui.lines.querySelector(`[data-variant-id="${CSS.escape(variantId)}"]`);
    const preferred = item && [
      item.querySelector(`[data-action="${action}"]`),
      item.querySelector('[data-action="decrease"]'),
      item.querySelector('[data-action="increase"]')
    ].find(button => button && !button.disabled);
    if (preferred) { preferred.focus(); return; }
    const next = ui.lines.querySelector('[data-action="remove"]');
    (next || ui.empty.querySelector('[data-bag-continue]')).focus();
  }

  ui.lines.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const variantId = button.closest('.bag-line').dataset.variantId;
    const line = lines.find(l => l.variantId === variantId);
    if (!line) return;
    const { product, variant } = cart.resolve(line.productId, line.variantId);
    const label = `${product.name}, size ${variant.size}`;
    const action = button.dataset.action;

    if (action === 'remove') {
      commit(cart.remove(lines, variantId).lines);
      announce(lines.length
        ? `Removed ${label}. Bag has ${units(cart.totalUnits(lines))}, subtotal ${money(cart.subtotalMinor(lines))}.`
        : `Removed ${label}. Your bag is empty.`);
    } else {
      const quantity = line.quantity + (action === 'increase' ? 1 : -1);
      const result = cart.setQuantity(lines, variantId, quantity);
      if (result.status !== 'updated') return;
      commit(result.lines);
      const limitNote = quantity >= Cart.MAX_QUANTITY ? ' Demo limit reached.' : '';
      announce(`${label}: quantity ${quantity}.${limitNote} Subtotal ${money(cart.subtotalMinor(lines))}.`);
    }
    restoreFocus(variantId, action);
  });

  render();
})();
