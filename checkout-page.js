// On-brand checkout page. Requires products.js, cart.js, checkout.js and Stripe.js (js.stripe.com).
// Stripe's Payment Element collects the card in its own iframe; this page never sees card details.
(() => {
  'use strict';
  const catalogue = window.IntoTheBlueCatalogue;
  const Cart = window.IntoTheBlueCart;
  const Checkout = window.IntoTheBlueCheckout;
  const cart = Cart.createCartModel(catalogue);
  const money = catalogue.formatMoney;
  const $ = selector => document.querySelector(selector);

  const TEST_CARD = '4242424242424242';
  // The demo ships nothing, so billing is fixed to Hong Kong, which has no postal codes.
  const BILLING_ADDRESS = { address: { country: 'HK' } };
  const STATES = ['co-checkout', 'co-empty', 'co-confirming', 'co-done', 'co-unconfirmed'];

  const ui = {
    summary: $('#co-summary'),
    summaryToggle: $('#co-summary-toggle'),
    lines: $('#co-lines'),
    subtotal: $('#co-subtotal'),
    totals: Array.from(document.querySelectorAll('[data-total]')),
    form: $('#co-form'),
    email: $('#co-email'),
    emailError: $('#co-email-error'),
    payment: $('#co-payment'),
    loading: $('#co-loading'),
    error: $('#co-error'),
    submit: $('#co-submit'),
    submitText: $('#co-submit-text'),
    copy: $('#co-copy'),
    back: $('[data-back]'),
    steps: $('#co-steps'),
    live: $('#co-live')
  };

  // Held in memory only, to show on the confirmation; never stored.
  let paidEmail = '';

  let storage = null;
  try { storage = window.localStorage; } catch (error) { storage = null; }

  const domReady = new Promise(resolve => {
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', resolve, { once: true });
    else resolve();
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let announceTimer = 0;
  function announce(message) {
    clearTimeout(announceTimer);
    ui.live.textContent = '';
    announceTimer = setTimeout(() => { ui.live.textContent = message; }, 120);
  }

  const STEP_FOR_STATE = { 'co-checkout': 'checkout', 'co-confirming': 'checkout', 'co-done': 'done' };

  function showState(id, focusSelector) {
    STATES.forEach(state => { $(`#${state}`).hidden = state !== id; });
    const step = STEP_FOR_STATE[id];
    ui.steps.hidden = !step;
    ui.steps.querySelectorAll('li').forEach(li => {
      if (li.dataset.step === step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    if (focusSelector) $(focusSelector).focus();
  }

  // ---- Order summary ----
  const variantIndex = new Map();
  catalogue.products.forEach(product => product.variants.forEach(variant => variantIndex.set(variant.id, { product, variant })));

  function lineItem({ image, name, meta, total }) {
    const item = el('li', 'co-line');
    const photo = el('img', 'co-line-photo');
    photo.src = image || '';
    photo.alt = '';
    if (!image) photo.hidden = true;
    const info = el('div', 'co-line-info');
    info.append(el('p', 'co-line-name', name), el('p', 'co-line-meta', meta));
    item.append(photo, info, el('p', 'co-line-total', total));
    return item;
  }

  function renderSummary(lines) {
    ui.lines.replaceChildren(...lines.map(line => lineItem({
      image: line.product.image,
      name: line.product.name,
      meta: `Size ${line.variant.size} · Qty ${line.quantity}`,
      total: money(line.product.unitPriceMinor * line.quantity)
    })));
    const subtotal = money(lines.reduce((sum, line) => sum + line.product.unitPriceMinor * line.quantity, 0));
    ui.subtotal.textContent = subtotal;
    ui.totals.forEach(node => { node.textContent = subtotal; });
  }

  // Stripe requires the page to show the session's own total, so totals are refreshed from it.
  function formatSessionAmount(minor, session) {
    const divisor = Number(session.minorUnitsAmountDivisor) || 100;
    return new Intl.NumberFormat('en-HK', { style: 'currency', currency: String(session.currency).toUpperCase() }).format(minor / divisor);
  }

  function applySession(session) {
    if (!session || !session.total) return;
    const total = formatSessionAmount(session.total.total.minorUnitsAmount, session);
    ui.subtotal.textContent = formatSessionAmount(session.total.subtotal.minorUnitsAmount, session);
    ui.totals.forEach(node => { node.textContent = total; });
    (session.lineItems || []).forEach((item, i) => {
      const cell = ui.lines.children[i] && ui.lines.children[i].querySelector('.co-line-total');
      if (cell && item.total) cell.textContent = formatSessionAmount(item.total.minorUnitsAmount, session);
    });
    if (!busy) ui.submitText.textContent = `Pay ${total}`;
  }

  ui.summaryToggle.addEventListener('click', () => {
    const open = ui.summaryToggle.getAttribute('aria-expanded') !== 'true';
    ui.summaryToggle.setAttribute('aria-expanded', String(open));
    ui.summary.classList.toggle('is-open', open);
    ui.summaryToggle.firstElementChild.textContent = open ? 'Hide order summary' : 'Show order summary';
  });

  // ---- Test card helper ----
  ui.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(TEST_CARD);
      ui.copy.textContent = 'Copied';
      announce('Test card number copied.');
      setTimeout(() => { ui.copy.textContent = 'Copy'; }, 2000);
    } catch (error) {
      getSelection().selectAllChildren($('#co-test-card'));
    }
  });

  // ---- Form states ----
  let busy = false;
  let actions = null;

  function setError(message, retry) {
    ui.error.replaceChildren();
    ui.error.hidden = !message;
    if (!message) return;
    ui.error.append(el('p', '', message));
    if (retry) {
      const button = el('button', 'co-retry', 'Try again');
      button.type = 'button';
      button.addEventListener('click', () => location.reload());
      ui.error.append(button);
    }
  }

  function setEmailError(message) {
    ui.emailError.textContent = message;
    if (message) ui.email.setAttribute('aria-invalid', 'true');
    else ui.email.removeAttribute('aria-invalid');
  }

  function setBusy(next) {
    busy = next;
    ui.submit.disabled = next || !actions;
    ui.submit.setAttribute('aria-busy', String(next));
    ui.email.readOnly = next;
    if (next) ui.submitText.textContent = 'Processing test payment…';
    else if (actions) applySession(actions.getSession());
  }

  function unavailable() {
    ui.loading.hidden = true;
    ui.submit.disabled = true;
    ui.submitText.textContent = 'Pay';
    setError('Checkout is unavailable right now. Your bag is saved — please try again shortly.', true);
  }

  ui.email.addEventListener('input', () => setEmailError(''));

  const appearance = {
    theme: 'stripe',
    variables: {
      fontFamily: '"DM Sans", Arial, sans-serif',
      fontSizeBase: '15px',
      colorPrimary: '#17222a',
      colorText: '#17222a',
      colorTextSecondary: '#5d6971',
      colorTextPlaceholder: '#8a949a',
      colorBackground: '#ffffff',
      colorDanger: '#a3261b',
      borderRadius: '0px',
      spacingUnit: '4px'
    },
    rules: {
      '.Input': { border: '1px solid #c6cdcf', boxShadow: 'none', padding: '13px 14px' },
      '.Input:focus': { border: '1px solid #17222a', boxShadow: '0 0 0 2px #2365c9' },
      '.Input--invalid': { border: '1px solid #a3261b', boxShadow: 'none' },
      '.Label': { fontSize: '13px', fontWeight: '600', marginBottom: '6px' },
      '.Tab': { border: '1px solid #c6cdcf', boxShadow: 'none' },
      '.Tab:focus': { boxShadow: '0 0 0 2px #2365c9' },
      '.Tab--selected': { border: '1px solid #17222a', boxShadow: '0 0 0 1px #17222a' },
      '.Error': { fontSize: '13px' }
    }
  };

  async function begin(bag) {
    let started;
    try {
      if (!Checkout.publishableKey()) throw new Error('Checkout is not configured.');
      started = await Checkout.start(bag);
      await domReady;
      if (typeof window.Stripe !== 'function') throw new Error('Stripe.js did not load.');
    } catch (error) {
      unavailable();
      return;
    }

    const charged = started.lines.map(line => ({ ...variantIndex.get(line.variantId), quantity: line.quantity }));
    if (charged.some(line => !line.product)) { unavailable(); return; }
    renderSummary(charged);

    const stripe = window.Stripe(Checkout.publishableKey(), { locale: 'en' });
    const checkout = stripe.initCheckoutElementsSdk({
      clientSecret: started.clientSecret,
      elementsOptions: {
        appearance,
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap' }]
      }
    });
    checkout.on('change', applySession);

    let loaded;
    try {
      loaded = await checkout.loadActions();
    } catch (error) {
      loaded = null;
    }
    if (!loaded || loaded.type !== 'success') { unavailable(); return; }
    actions = loaded.actions;

    // Country and postal code are supplied on confirm (see BILLING_ADDRESS), so the card form is
    // just number, expiry and CVC. With card as the only method, the tabs layout shows no
    // "Card" header. Link's sign-up box would ask for a second email and a phone.
    const paymentElement = checkout.createPaymentElement({
      layout: { type: 'tabs' },
      fields: { billingDetails: { address: { country: 'never', postalCode: 'never' } } },
      wallets: { link: 'never' }
    });
    paymentElement.on('ready', () => { ui.loading.hidden = true; });
    paymentElement.mount(ui.payment);
    applySession(actions.getSession());
    ui.submit.disabled = false;
  }

  ui.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !actions) return;
    const email = ui.email.value.trim();
    if (!email || !ui.email.checkValidity()) {
      setEmailError('Enter an email address, like name@example.com.');
      ui.email.focus();
      return;
    }
    setError('');
    setBusy(true);
    let result;
    try {
      result = await actions.confirm({ email, billingAddress: BILLING_ADDRESS, redirect: 'if_required' });
    } catch (error) {
      result = { type: 'error', error: {} };
    }
    if (result.type !== 'success') {
      setBusy(false);
      setError((result.error && result.error.message) || 'The test payment didn’t go through. Please check the details and try again.');
      announce('The test payment didn’t go through.');
      return;
    }
    const session = result.session || actions.getSession();
    paidEmail = email;
    await confirmPaid(session.id);
  });

  // ---- Confirmation ----
  function productForLine(name) {
    return catalogue.products.find(product => name.startsWith(`${product.name.replace(/\.$/, '')} — `)) || null;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const CARD_BRANDS = { amex: 'American Express', diners: 'Diners Club', discover: 'Discover', jcb: 'JCB', mastercard: 'Mastercard', unionpay: 'UnionPay', visa: 'Visa' };

  function showRow(rowSelector, valueSelector, text) {
    $(rowSelector).hidden = !text;
    $(valueSelector).textContent = text || '';
  }

  function renderPaymentDetails(summary) {
    const card = summary.card;
    showRow('#co-done-card-row', '#co-done-card', card ? `${CARD_BRANDS[card.brand] || 'Card'} ending ${card.last4}` : '');
    const date = summary.paidAt
      ? new Intl.DateTimeFormat('en-HK', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(summary.paidAt * 1000))
      : '';
    showRow('#co-done-date-row', '#co-done-date', date);
    // After a bank redirect the page no longer knows the address, so the generic line stays.
    if (paidEmail) {
      const line = $('#co-done-email');
      const address = el('strong', '', paidEmail);
      line.replaceChildren('Your receipt would go to ', address, '. Test payments don’t send emails.');
    }
    const bagStep = ui.steps.querySelector('[data-step="bag"]');
    bagStep.replaceChildren(el('span', '', 'Bag'));
  }

  // Only the server's view of the session can mark the order paid and empty the bag.
  async function confirmPaid(sessionId) {
    let summary = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        summary = await Checkout.status(sessionId);
      } catch (error) {
        summary = null;
      }
      if (summary && summary.paymentStatus === 'paid') break;
      await wait(1200);
    }
    if (!summary || summary.paymentStatus !== 'paid') {
      showState('co-unconfirmed', '#co-unconfirmed-title');
      announce('We couldn’t confirm that payment. Your bag hasn’t changed.');
      return;
    }
    cart.save(storage, []);
    const format = minor => (String(summary.currency).toLowerCase() === 'hkd'
      ? money(minor)
      : `${(minor / 100).toFixed(2)} ${String(summary.currency).toUpperCase()}`);
    $('#co-done-lines').replaceChildren(...summary.lines.map(line => {
      const product = productForLine(line.name);
      const [name, size] = line.name.split(' — size ');
      return lineItem({
        image: product && product.image,
        name: product ? product.name : name,
        meta: `${size ? `Size ${size} · ` : ''}Qty ${line.quantity}`,
        total: Number.isFinite(line.amountTotal) ? format(line.amountTotal) : ''
      });
    }));
    const total = format(summary.amountTotal);
    $('#co-done-total').textContent = total;
    $('#co-done-ref').textContent = `ITB-${sessionId.slice(-8).toUpperCase()}`;
    renderPaymentDetails(summary);
    ui.back.textContent = '← Back to shop';
    ui.back.href = './';
    showState('co-done', '#co-done-title');
    announce(`Test payment complete: ${total}. Your bag is now empty.`);
  }

  // ---- Start ----
  const params = new URLSearchParams(location.search);
  const returned = params.get('session_id');
  if (returned) {
    // Redirect-based payment methods come back here; the ID is checked by the server, not trusted.
    history.replaceState(null, '', location.pathname);
    showState('co-confirming');
    confirmPaid(returned);
    return;
  }

  const bag = cart.load(storage).lines;
  if (!bag.length) {
    showState('co-empty');
    return;
  }
  showState('co-checkout');
  renderSummary(bag.map(line => ({ ...variantIndex.get(line.variantId), quantity: line.quantity })));
  begin(bag);
})();
