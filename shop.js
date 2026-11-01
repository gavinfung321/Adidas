// Product selectors and the demo bag drawer. Requires products.js, catalogue-remote.js and cart.js.
window.IntoTheBlueCatalogueReady.then(catalogue => {
  'use strict';
  const Cart = window.IntoTheBlueCart;
  const Account = window.IntoTheBlueAccount;
  const AccountPanel = window.IntoTheBlueAccountPanel;
  const cart = Cart.createCartModel(catalogue);
  const money = catalogue.formatMoney;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  const purchaseDialog = $('#purchase-dialog');
  const winterDialog = $('#winter-dialog');
  const bagDialog = $('#bag-dialog');
  const accountDialog = $('#account-dialog');
  const managedDialogs = [purchaseDialog, winterDialog, bagDialog, accountDialog].filter(Boolean);
  const menuToggle = $('.mobile-menu-toggle');
  const mobileMenu = $('#mobile-menu');

  const ui = {
    lines: $('#bag-lines'),
    empty: $('#bag-empty'),
    summary: $('#bag-summary'),
    subtotal: $('#bag-subtotal'),
    headCount: $('#bag-head-count'),
    checkoutButton: $('#bag-checkout'),
    storageNotice: $('#bag-storage-notice'),
    syncNotice: $('#bag-sync-notice'),
    live: $('#bag-live')
  };

  // ---- State and persistence ----
  let storage = null;
  try { storage = window.localStorage; } catch (error) { storage = null; }
  const loaded = cart.load(storage);
  let lines = loaded.lines;
  let persistent = loaded.persistent;
  if (loaded.repaired) persistent = cart.save(storage, lines);
  let syncOk = true;
  let syncTimer = 0;
  let syncPending = false;

  function queueAccountSave(nextLines) {
    if (!Account || !Account.user()) return;
    syncPending = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await Account.saveCart(nextLines);
        syncOk = true;
      } catch (error) {
        syncOk = false;
      }
      syncPending = false;
      if (ui.syncNotice) ui.syncNotice.hidden = syncOk;
    }, 500);
  }

  function commit(nextLines, { sync = true } = {}) {
    lines = nextLines;
    persistent = cart.save(storage, lines);
    if (sync) queueAccountSave(lines);
    render();
  }

  async function pullAccountBag(mode) {
    if (!Account || !Account.user()) return;
    try {
      const remote = await Account.loadCart();
      const next = mode === 'merge' ? cart.merge(lines, remote) : cart.validate(remote).lines;
      lines = next;
      persistent = cart.save(storage, lines);
      if (mode === 'merge') await Account.saveCart(lines);
      syncOk = true;
    } catch (error) {
      syncOk = false;
    }
    render();
  }

  addEventListener('storage', event => {
    if (event.key !== Cart.STORAGE_KEY) return;
    lines = cart.parse(event.newValue).lines;
    render();
  });

  if (Account) {
    Account.on((type, detail) => {
      if (type === 'signed-in') pullAccountBag('merge');
      else if (type === 'signed-out' && detail && detail.byUser) commit([], { sync: false });
      else if (type === 'user-changed') {
        if (Account.user()) pullAccountBag('replace');
      }
    });
    Account.ready.then(user => {
      if (!user) return;
      const fromLink = Account.arrival && (Account.arrival.kind === 'confirmed' || Account.arrival.kind === 'recovery');
      pullAccountBag(fromLink ? 'merge' : 'replace');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !Account.user() || syncPending) return;
      pullAccountBag('replace');
    });
  }

  const accountPanel = accountDialog && AccountPanel
    ? AccountPanel.create({ dialog: accountDialog, open: dialog => openModal(dialog) })
    : null;

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
    return $$('[data-bag-open], [data-account-open]').find(isVisible) || (isVisible(menuToggle) ? menuToggle : null);
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
      input.disabled = variant.available === false;
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
    form.querySelector('button[type="submit"]').disabled = !product.available;
    if (!product.available) form.querySelector('.size-error').textContent = 'No longer available in this demo.';
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
    if (result.status === 'invalid' || result.status === 'unavailable') {
      setSizeError(form, 'That size isn’t available in this demo. Please choose another.');
      return;
    }
    if (result.status === 'limit') {
      setSizeError(form, `You already have ${Cart.MAX_QUANTITY} in size ${variant.size} — the most this demo bag allows per size.`);
      return;
    }
    commit(result.lines);
    openModal(bagDialog);
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
  if (featured) prepareSelector(purchaseForm, featured);
  else purchaseForm.querySelector('button[type="submit"]').disabled = true;

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
  // Products switched off in the database leave the Winter Edit; the count in the header follows.
  const COUNT_WORDS = ['', 'ONE MORE PERSPECTIVE.', 'TWO MORE PERSPECTIVES.', 'THREE MORE PERSPECTIVES.'];
  const winterButtons = $$('[data-winter]');
  winterButtons.forEach(button => {
    const product = catalogue.getProduct(button.dataset.winter);
    button.closest('.winter-card').hidden = !(product && product.available);
  });
  const shownWinter = $$('.winter-card').filter(card => !card.hidden).length;
  $('#winter-edit').hidden = shownWinter === 0;
  const countLabel = $('#winter-edit .section-top span:last-child');
  if (countLabel && COUNT_WORDS[shownWinter]) countLabel.textContent = COUNT_WORDS[shownWinter];

  winterButtons.forEach(button => button.addEventListener('click', () => {
    const product = catalogue.getProduct(button.dataset.winter);
    if (!product) return;
    $('#winter-dialog-title').textContent = product.name;
    renderWinterGallery(product);
    $('#winter-dialog-description').textContent = product.description;
    prepareSelector(winterForm, product);
    openModal(winterDialog, button);
  }));
  // ---- Bag drawer ----
  $$('[data-bag-open]').forEach(button => button.addEventListener('click', () => openModal(bagDialog, button)));
  $$('[data-account-open]').forEach(button => button.addEventListener('click', () => {
    openModal(accountDialog, button);
    if (accountPanel) accountPanel.open(Account && Account.user() ? 'account' : 'signin');
  }));
  $$('[data-bag-continue]').forEach(button => button.addEventListener('click', () => bagDialog.close()));

  // Payment happens on the checkout page (Stripe test mode).
  ui.checkoutButton.addEventListener('click', () => {
    if (cart.purchasable(lines).length) location.assign('checkout.html');
  });

  // "Back to bag" on the checkout page links to ?bag=open.
  function openBagFromLink() {
    const params = new URLSearchParams(location.search);
    if (params.get('bag') !== 'open') return;
    params.delete('bag');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
    openModal(bagDialog);
  }

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

    const remove = el('button', 'bag-remove', 'Remove');
    remove.type = 'button';
    remove.dataset.action = 'remove';
    remove.setAttribute('aria-label', `Remove ${label} from bag`);

    if (!line.available) {
      item.classList.add('is-unavailable');
      info.append(name, size, el('p', 'bag-unavailable', 'No longer available. It won’t be included at checkout.'), remove);
      item.append(image, info, el('p', 'bag-line-total'));
      return item;
    }

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
    ui.checkoutButton.disabled = !cart.purchasable(lines).length;
    ui.subtotal.textContent = described.length ? money(cart.subtotalMinor(lines)) : '';
    ui.storageNotice.hidden = persistent;
    if (ui.syncNotice) ui.syncNotice.hidden = syncOk;
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
  openBagFromLink();
});
