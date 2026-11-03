// Staff admin for Into the Blue. Uses the publishable key and a staff Auth session.
// Customer sessions without app_metadata.role = "staff" are refused.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pryofarsgkhfbajmdeyy.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_bL1u8hzI8CY6qFqwBtJWMA_fP4VulzL';
  const ASSET_BASE = new URL('../', location.href).href;
  const ORDER_SELECT = 'id,reference,status,fulfillment_status,cancel_reason,cancel_note,amount_total_minor,currency,customer_email,card_brand,card_last4,created_at,paid_at,receipt_sent_at,user_id,updated_at,'
    + 'order_items(product_name,size,quantity,unit_price_minor,line_total_minor,variant_id,variants(products(image,image_alt)))';
  const PRODUCT_SELECT = 'id,name,description,unit_price_minor,currency,image,image_alt,active,sort_order,variants(id,size,active,sort_order)';
  const CANCEL_REASONS = [
    { value: 'customer_request', label: 'Customer request' },
    { value: 'out_of_stock', label: 'Out of stock' },
    { value: 'duplicate', label: 'Duplicate order' },
    { value: 'other', label: 'Other' }
  ];
  const cancelReasonLabel = (value, note) => {
    if (value === 'other') {
      const text = String(note || '').trim();
      return text || 'Other';
    }
    const found = CANCEL_REASONS.find(row => row.value === value);
    return found ? found.label : '';
  };
  const CUSTOMER_TAGS = [
    { value: 'vip', label: 'VIP' },
    { value: 'winter', label: 'Winter edit' },
    { value: 'press', label: 'Press' },
    { value: 'return_risk', label: 'Return risk' }
  ];
  const customerTagLabel = value => {
    const found = CUSTOMER_TAGS.find(row => row.value === value);
    return found ? found.label : '';
  };
  const normalizeCustomerTags = tags => {
    const allowed = new Set(CUSTOMER_TAGS.map(row => row.value));
    const list = Array.isArray(tags) ? tags : [];
    return [...new Set(list.map(tag => String(tag || '').trim().toLowerCase()).filter(tag => allowed.has(tag)))];
  };
  const formatCustomerTags = tags => {
    const labels = normalizeCustomerTags(tags).map(customerTagLabel).filter(Boolean);
    return labels.length ? labels.join(' · ') : '—';
  };

  const money = minor => 'HK$' + (Number(minor || 0) / 100).toLocaleString('en-HK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const dateOf = iso => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-HK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
    } catch (error) {
      return '—';
    }
  };
  const cardOf = (brand, last4) => {
    if (!last4) return '—';
    const names = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };
    return (names[brand] || 'Card') + ' ending ' + last4;
  };
  const escape = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isStaffUser = user => (user && user.app_metadata && user.app_metadata.role) === 'staff';
  const imageUrl = path => path && /^assets\/[A-Za-z0-9._-]+$/.test(path) ? ASSET_BASE + path : '';
  const initialsFromEmail = email => {
    const local = String(email || '').split('@')[0].trim();
    if (!local) return '?';
    const parts = local.split(/[._+\-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  if (!window.supabase) {
    document.body.innerHTML = '<p style="padding:40px">Admin could not load.</p>';
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'into-the-blue:staff-auth'
    }
  });

  const PAGE_SIZE = 10;
  let user = null;
  let currentView = 'signin';
  let selectedOrderId = null;
  let selectedEmail = null;
  let selectedProductId = null;
  let productsCache = [];
  let orderFilter = { payment: '', fulfillment: '', q: '' };
  let orderPage = 1;
  let filteredOrders = [];
  let customerFilter = { account: '', tags: '', q: '' };
  let customersCache = { customers: [], profiles: {} };
  let productFilter = { status: '', q: '' };
  let auditFilter = { action: '' };
  let auditPage = 1;
  let filteredAudit = [];

  const statusEl = $('[data-status]');
  const errorEl = $('[data-error]');
  const nav = $('[data-staff-nav]');

  function filterIsActive(state) {
    return Object.values(state).some(value => String(value || '').trim() !== '');
  }

  function filterFieldLabel(form, key) {
    const el = form.elements[key];
    if (!el) return key;
    const wrap = el.closest('label');
    if (!wrap) return key;
    const first = [...wrap.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
    return first ? first.textContent.trim() : key;
  }

  function filterSummaryText(form, state) {
    const parts = [];
    Object.keys(state).forEach(key => {
      const value = String(state[key] || '').trim();
      if (!value) return;
      const el = form.elements[key];
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find(option => option.value === value);
        parts.push(filterFieldLabel(form, key) + ': ' + (opt ? opt.textContent.trim() : value));
      } else {
        parts.push('Search: “' + value + '”');
      }
    });
    return parts.length ? ('Filtered · ' + parts.join(' · ')) : '';
  }

  function syncFilterChrome(form, state) {
    if (!form) return;
    const active = filterIsActive(state);
    form.classList.toggle('is-filtered', active);
    const apply = form.querySelector('button[type="submit"]');
    const clear = form.querySelector('[data-filter-clear]');
    const summary = form.querySelector('[data-filter-summary]');
    if (apply) {
      apply.classList.toggle('dark', active);
      apply.textContent = active ? 'Filtered' : 'Filter';
    }
    if (clear) clear.hidden = !active;
    if (summary) {
      summary.hidden = !active;
      summary.textContent = active ? filterSummaryText(form, state) : '';
    }
  }

  function fillFilterForm(form, state) {
    if (!form) return;
    Object.keys(state).forEach(key => {
      if (form.elements[key] != null) form.elements[key].value = state[key] || '';
    });
    syncFilterChrome(form, state);
  }

  function setMessage(status, error) {
    statusEl.textContent = status || '';
    statusEl.classList.toggle('is-ok', Boolean(status));
    errorEl.textContent = error || '';
  }

  function updateStaffChip() {
    const avatar = $('[data-staff-avatar]');
    if (!avatar) return;
    if (!user || !user.email) {
      avatar.hidden = true;
      avatar.textContent = '';
      avatar.removeAttribute('title');
      return;
    }
    avatar.hidden = false;
    avatar.textContent = initialsFromEmail(user.email);
    avatar.title = user.email;
  }

  function show(view) {
    currentView = view;
    $$('[data-view]').forEach(el => { el.hidden = el.dataset.view !== view; });
    $$('[data-go]').forEach(btn => btn.classList.toggle('is-current', btn.dataset.go === view));
    const staff = view !== 'signin';
    nav.hidden = !staff;
    document.body.classList.toggle('is-staff', staff);
    updateStaffChip();
    if (view !== 'orders') closeOrderDialog();
    if (view !== 'customers') closeCustomerDialog();
    if (view !== 'products') closeProductDialog();
  }

  async function requireStaff() {
    const { data } = await client.auth.getSession();
    user = data.session ? data.session.user : null;
    if (!isStaffUser(user)) {
      if (data.session) await client.auth.signOut({ scope: 'local' });
      user = null;
      show('signin');
      return false;
    }
    return true;
  }

  function dayKey(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function lastSevenDays() {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().slice(0, 10));
    }
    return days;
  }

  function dayLabel(key) {
    const date = new Date(key + 'T12:00:00');
    return new Intl.DateTimeFormat('en-HK', { day: 'numeric', month: 'short' }).format(date);
  }

  function niceMaxMinor(value) {
    if (value <= 0) return 10000;
    const padded = value * 1.15;
    const exp = Math.pow(10, Math.floor(Math.log10(padded)));
    const n = padded / exp;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * exp;
  }

  function moneyAxis(minor) {
    const hkd = Number(minor || 0) / 100;
    if (hkd === 0) return 'HK$0';
    if (hkd >= 1000) {
      const k = hkd / 1000;
      return 'HK$' + k.toLocaleString('en-HK', {
        minimumFractionDigits: Number.isInteger(k) ? 0 : 1,
        maximumFractionDigits: 1
      }) + 'k';
    }
    return 'HK$' + Math.round(hkd).toLocaleString('en-HK');
  }

  function moneyBar(minor) {
    const hkd = Number(minor || 0) / 100;
    if (hkd === 0) return '0';
    if (hkd >= 1000) {
      return 'HK$' + (hkd / 1000).toLocaleString('en-HK', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      }) + 'k';
    }
    return 'HK$' + Math.round(hkd).toLocaleString('en-HK');
  }

  function renderRevenueChart(orders) {
    const days = lastSevenDays();
    const totals = Object.fromEntries(days.map(day => [day, 0]));
    orders.forEach(order => {
      const key = dayKey(order.paid_at || order.created_at);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] += order.amount_total_minor || 0;
      }
    });
    const values = days.map(day => totals[day]);
    const max = niceMaxMinor(Math.max(...values, 0));
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const avgPct = Math.min(100, Math.max(0, (average / max) * 100));
    const ticks = [max, max / 2, 0];

    $('[data-revenue-chart]').innerHTML = `
      <div class="rev-chart" role="img" aria-label="Revenue by day for the last 7 days. Average ${escape(money(Math.round(average)))}.">
        <div class="rev-y" aria-hidden="true">${ticks.map(tick => `<span>${escape(moneyAxis(tick))}</span>`).join('')}</div>
        <div class="rev-plot">
          <div class="rev-grid" aria-hidden="true">${ticks.map(() => '<i></i>').join('')}</div>
          <div class="rev-avg" style="bottom:${avgPct}%" title="Average ${escape(money(Math.round(average)))}">
            <span>Avg ${escape(moneyBar(Math.round(average)))}</span>
          </div>
          <div class="rev-bars">${days.map((day, index) => {
            const value = totals[day];
            const height = value > 0 ? Math.max(3, (value / max) * 100) : 0;
            return `<div class="rev-col" title="${escape(dayLabel(day) + ': ' + money(value))}">
              <div class="rev-fill" style="height:${height}%;animation-delay:${index * 30}ms">
                <span class="rev-val">${escape(moneyBar(value))}</span>
              </div>
            </div>`;
          }).join('')}</div>
        </div>
        <div class="rev-x" aria-hidden="true">${days.map(day => `<span>${escape(dayLabel(day))}</span>`).join('')}</div>
      </div>
      <p class="rev-note">Dotted line is the 7-day average (${escape(money(Math.round(average)))}).</p>`;
  }

  function renderOpenToPack(orders) {
    const open = orders
      .filter(order => (order.fulfillment_status || 'unfulfilled') === 'unfulfilled')
      .slice(0, 5);
    if (!open.length) {
      $('[data-open-pack]').innerHTML = '<p class="empty">Nothing waiting to pack.</p>';
      return;
    }
    $('[data-open-pack]').innerHTML = open.map(order => `
      <button type="button" class="pack-row" data-open-order="${escape(order.id)}">
        <div>
          <strong>${escape(order.reference || 'Order')}</strong>
          <p class="note">${escape(order.customer_email || '—')} · ${escape(dateOf(order.paid_at || order.created_at))}</p>
        </div>
        <span class="pack-total">${escape(money(order.amount_total_minor))}</span>
      </button>`).join('');
  }

  function renderTopSellers(orders) {
    const sellers = new Map();
    orders.forEach(order => (order.order_items || []).forEach(item => {
      const key = item.product_name || 'Product';
      const product = item.variants && item.variants.products;
      const row = sellers.get(key) || {
        name: key,
        quantity: 0,
        image: product && product.image,
        imageAlt: (product && product.image_alt) || key
      };
      row.quantity += item.quantity || 0;
      if (!row.image && product && product.image) {
        row.image = product.image;
        row.imageAlt = product.image_alt || key;
      }
      sellers.set(key, row);
    }));
    const top = [...sellers.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 3);
    if (!top.length) {
      $('[data-top-sellers]').innerHTML = '<p class="empty">No paid items yet.</p>';
      return;
    }
    $('[data-top-sellers]').innerHTML = top.map(row => {
      const src = imageUrl(row.image);
      const photo = src
        ? `<img src="${escape(src)}" alt="${escape(row.imageAlt)}">`
        : '<span></span>';
      return `<div class="seller">${photo}<div><strong>${escape(row.name)}</strong><p class="note">${escape(row.quantity)} sold</p></div><strong>${escape(row.quantity)}</strong></div>`;
    }).join('');
  }

  async function loadDashboard() {
    const { data, error } = await client.from('orders').select(ORDER_SELECT)
      .eq('status', 'paid').order('paid_at', { ascending: false });
    if (error) throw error;
    const orders = data || [];
    const revenue = orders.reduce((sum, row) => sum + (row.amount_total_minor || 0), 0);
    const average = orders.length ? Math.round(revenue / orders.length) : 0;
    const openToPack = orders.filter(order => (order.fulfillment_status || 'unfulfilled') === 'unfulfilled').length;

    $('[data-stats]').innerHTML = [
      ['Test revenue', money(revenue)],
      ['Average order', money(average)],
      ['Open to pack', String(openToPack)]
    ].map(([label, value]) => `<div class="stat"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join('');

    renderRevenueChart(orders);
    renderOpenToPack(orders);
    renderTopSellers(orders);
    $('[data-recent-orders]').innerHTML = ordersTable(orders.slice(0, 10), true);
  }

  function ordersTable(orders, clickable) {
    if (!orders.length) return '<p class="empty">No orders match.</p>';
    const body = orders.map(order => {
      const ref = escape(order.reference || 'Order');
      const rowAttrs = clickable
        ? ` class="is-clickable" data-open-order="${escape(order.id)}" tabindex="0" role="button" aria-label="Open order ${ref}"`
        : '';
      return `<tr${rowAttrs}>
        <td><strong class="order-ref">${ref}</strong></td>
        <td>${escape(dateOf(order.paid_at || order.created_at))}</td>
        <td>${escape(order.customer_email || '—')}</td>
        <td>${escape(money(order.amount_total_minor))}</td>
        <td><span class="pill ${escape(order.status)}">${escape(order.status)}</span></td>
        <td><span class="pill ${escape(order.fulfillment_status || '')}">${escape(order.fulfillment_status || '—')}</span></td>
      </tr>`;
    }).join('');
    return `<table><thead><tr><th>Reference</th><th>Date</th><th>Email</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  function pagerRangeLabel(page, total, noun, filterState) {
    const start = total ? ((page - 1) * PAGE_SIZE) + 1 : 0;
    const end = Math.min(page * PAGE_SIZE, total);
    const scope = filterIsActive(filterState) ? `matching ${noun}` : noun;
    return `Showing ${start}–${end} of ${total} ${scope}`;
  }

  function renderOrdersPager() {
    const pager = $('[data-orders-pager]');
    const total = filteredOrders.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (orderPage > pages) orderPage = pages;
    if (total <= PAGE_SIZE) {
      pager.hidden = true;
      pager.innerHTML = '';
      return;
    }
    pager.hidden = false;
    pager.innerHTML = `
      <button type="button" class="button small" data-page-prev ${orderPage <= 1 ? 'disabled' : ''} aria-label="Previous page">← Previous</button>
      <span>${pagerRangeLabel(orderPage, total, 'orders', orderFilter)}</span>
      <button type="button" class="button small" data-page-next ${orderPage >= pages ? 'disabled' : ''} aria-label="Next page">Next →</button>`;
  }

  function renderOrdersPage() {
    const start = (orderPage - 1) * PAGE_SIZE;
    const pageRows = filteredOrders.slice(start, start + PAGE_SIZE);
    $('[data-orders-table]').innerHTML = ordersTable(pageRows, true);
    renderOrdersPager();
  }

  async function loadOrders() {
    let query = client.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(500);
    if (orderFilter.payment) query = query.eq('status', orderFilter.payment);
    if (orderFilter.fulfillment) query = query.eq('fulfillment_status', orderFilter.fulfillment);
    const { data, error } = await query;
    if (error) throw error;
    let orders = data || [];
    const q = orderFilter.q.trim().toLowerCase();
    if (q) {
      orders = orders.filter(order =>
        String(order.reference || '').toLowerCase().includes(q)
        || String(order.customer_email || '').toLowerCase().includes(q)
      );
    }
    filteredOrders = orders;
    renderOrdersPage();
  }

  function orderDialog() {
    return $('[data-order-dialog]');
  }

  function closeOrderDialog() {
    const dialog = orderDialog();
    if (dialog && dialog.open) dialog.close();
  }

  function openOrderDialog(order) {
    const dialog = orderDialog();
    const detail = $('[data-order-detail]');
    if (!dialog || !detail || !order) {
      closeOrderDialog();
      return;
    }
    const lines = (order.order_items || []).map(item => {
      const product = item.variants && item.variants.products;
      const src = imageUrl(product && product.image);
      const photo = src
        ? `<img src="${escape(src)}" alt="${escape((product && product.image_alt) || item.product_name)}">`
        : '<span class="line-thumb-empty" aria-hidden="true"></span>';
      return `<div class="line">${photo}<div class="line-copy"><strong>${escape(item.product_name)}</strong><span class="note">Size ${escape(item.size)} · Qty ${escape(item.quantity)}</span></div><div class="line-price">${escape(money(item.line_total_minor))}</div></div>`;
    }).join('');
    const paid = order.status === 'paid';
    const fulfillLabels = {
      unfulfilled: 'Unfulfilled',
      packed: 'Packed',
      shipped: 'Shipped',
      cancelled: 'Cancelled'
    };
    const fulfillmentButtons = paid
      ? ['unfulfilled', 'packed', 'shipped'].map(status =>
        `<button type="button" class="fulfill-btn ${order.fulfillment_status === status ? 'is-active' : ''}" data-fulfill="${escape(status)}">${escape(fulfillLabels[status])}</button>`
      ).join('')
        + `<button type="button" class="fulfill-btn ${order.fulfillment_status === 'cancelled' ? 'is-active' : ''}" data-fulfill-ask-cancel>${escape(fulfillLabels.cancelled)}</button>`
      : '<p class="note">Fulfilment is only for paid orders.</p>';
    const reasonText = cancelReasonLabel(order.cancel_reason, order.cancel_note);
    const reasonRow = order.fulfillment_status === 'cancelled'
      ? `<div><dt>Reason</dt><dd>${escape(reasonText || '—')}</dd></div>`
      : '';
    const reasonChoices = CANCEL_REASONS.map((row, index) =>
      `<label class="cancel-reason"><input type="radio" name="cancel-reason" value="${escape(row.value)}"${index === 0 ? ' checked' : ''}> ${escape(row.label)}</label>`
    ).join('');

    const title = $('#order-dialog-title');
    if (title) title.textContent = order.reference || 'Order';
    detail.dataset.orderId = order.id;
    detail.innerHTML = `
      <div class="order-sheet">
        <section class="order-lines" aria-label="Line items">
          ${lines || '<p class="note">No lines.</p>'}
          <div class="order-total">
            <div class="order-total-row">
              <span>Total</span>
              <strong>${escape(money(order.amount_total_minor))}</strong>
            </div>
            <p class="note">${escape(cardOf(order.card_brand, order.card_last4))}</p>
          </div>
        </section>
        <aside class="order-aside" aria-label="Order details">
          <dl class="order-meta">
            <div><dt>Payment</dt><dd><span class="pill ${escape(order.status)}">${escape(order.status)}</span></dd></div>
            <div><dt>Fulfilment</dt><dd><span class="pill ${escape(order.fulfillment_status || '')}">${escape(order.fulfillment_status || '—')}</span></dd></div>
            ${reasonRow}
            <div><dt>Email</dt><dd>${escape(order.customer_email || '—')}</dd></div>
            <div><dt>Paid</dt><dd>${escape(dateOf(order.paid_at))}</dd></div>
            <div><dt>Receipt</dt><dd>${order.receipt_sent_at ? 'Sent ' + escape(dateOf(order.receipt_sent_at)) : 'Not sent'}</dd></div>
            <div><dt>Account</dt><dd>${order.user_id ? 'Signed in' : 'Guest'}</dd></div>
          </dl>
          <div class="order-fulfill" data-fulfill-panel>
            <p class="order-fulfill-label">Set fulfilment</p>
            <div class="fulfill-grid" data-fulfill-actions>${fulfillmentButtons}</div>
            <p class="note">Cancelling fulfilment does not refund Stripe. This is a demo.</p>
          </div>
          <div class="cancel-panel" data-cancel-panel hidden>
            <p class="order-fulfill-label">Why cancel?</p>
            <div class="cancel-reasons" role="radiogroup" aria-label="Cancel reason">${reasonChoices}</div>
            <label class="cancel-note-field" data-cancel-note-field hidden>
              <span class="order-fulfill-label">Details</span>
              <textarea name="cancel-note" data-cancel-note maxlength="200" rows="3" placeholder="Short reason"></textarea>
            </label>
            <div class="cancel-actions">
              <button type="button" class="button small dark" data-cancel-confirm>Confirm cancel</button>
              <button type="button" class="button small" data-cancel-back>Back</button>
            </div>
            <p class="note">Payment stays paid. This does not refund Stripe.</p>
          </div>
        </aside>
      </div>`;
    if (!dialog.open) dialog.showModal();
  }

  function syncCancelNoteField(root) {
    const panel = root && root.querySelector('[data-cancel-panel]');
    if (!panel || panel.hidden) return;
    const picked = panel.querySelector('input[name="cancel-reason"]:checked');
    const field = panel.querySelector('[data-cancel-note-field]');
    const note = panel.querySelector('[data-cancel-note]');
    const show = picked && picked.value === 'other';
    if (field) field.hidden = !show;
    if (show && note) note.focus();
  }

  async function setFulfillment(orderId, status, reason, note) {
    setMessage('Updating fulfilment…', '');
    const payload = { p_order_id: orderId, p_status: status };
    if (status === 'cancelled') {
      payload.p_reason = reason;
      if (reason === 'other') payload.p_note = note;
    }
    const { error } = await client.rpc('staff_set_fulfillment', payload);
    if (error) {
      setMessage('', error.message || 'Fulfilment could not be updated.');
      return false;
    }
    selectedOrderId = orderId;
    setMessage(status === 'cancelled' ? 'Order cancelled.' : 'Fulfilment updated.', '');
    await loadOrders();
    const { data } = await client.from('orders').select(ORDER_SELECT).eq('id', orderId).single();
    if (data) openOrderDialog(data);
    return true;
  }

  function renderCustomersTable() {
    const { customers, profiles } = customersCache;
    const q = customerFilter.q.trim().toLowerCase();
    const filtered = customers.filter(row => {
      const profile = profiles[row.email] || {};
      const tags = normalizeCustomerTags(profile.tags);
      if (customerFilter.account === 'account' && !row.hasAccount) return false;
      if (customerFilter.account === 'guest' && row.hasAccount) return false;
      if (customerFilter.tags === 'untagged' && tags.length) return false;
      if (customerFilter.tags && customerFilter.tags !== 'untagged' && !tags.includes(customerFilter.tags)) return false;
      if (q) {
        const inEmail = row.email.includes(q);
        const inTags = tags.some(tag => {
          const label = customerTagLabel(tag).toLowerCase();
          return tag.includes(q) || label.includes(q);
        });
        if (!inEmail && !inTags) return false;
      }
      return true;
    });

    if (!customers.length) {
      $('[data-customers-table]').innerHTML = '<p class="empty">No paid customers yet.</p>';
      return;
    }
    if (!filtered.length) {
      $('[data-customers-table]').innerHTML = '<p class="empty">No customers match these filters.</p>';
      return;
    }
    $('[data-customers-table]').innerHTML = `<table><thead><tr><th>Email</th><th>Orders</th><th>Total</th><th>Last order</th><th>Tags</th></tr></thead><tbody>${
      filtered.map(row => {
        const profile = profiles[row.email] || {};
        const email = escape(row.email);
        return `<tr class="is-clickable" data-open-customer="${email}" tabindex="0" role="button" aria-label="Open customer ${email}">
          <td><strong class="order-ref">${email}</strong></td>
          <td>${row.orders.length}</td>
          <td>${escape(money(row.total))}</td>
          <td>${escape(dateOf(row.last))}</td>
          <td>${escape(formatCustomerTags(profile.tags))}</td>
        </tr>`;
      }).join('')
    }</tbody></table>`;
  }

  async function loadCustomers() {
    const { data, error } = await client.from('orders').select(ORDER_SELECT)
      .eq('status', 'paid').order('paid_at', { ascending: false });
    if (error) throw error;
    const byEmail = new Map();
    (data || []).forEach(order => {
      const email = (order.customer_email || '').trim().toLowerCase();
      if (!email) return;
      const row = byEmail.get(email) || { email, orders: [], total: 0, last: null, hasAccount: false };
      row.orders.push(order);
      row.total += order.amount_total_minor || 0;
      row.last = row.last || order.paid_at || order.created_at;
      if (order.user_id) row.hasAccount = true;
      byEmail.set(email, row);
    });
    const customers = [...byEmail.values()].sort((a, b) => String(b.last).localeCompare(String(a.last)));
    const emails = customers.map(row => row.email);
    const profiles = {};
    if (emails.length) {
      const { data: profileRows } = await client.from('customer_profiles').select('email,note,tags').in('email', emails);
      (profileRows || []).forEach(row => { profiles[row.email.toLowerCase()] = row; });
    }

    customersCache = { customers, profiles };
    window.__adminCustomers = customersCache;
    renderCustomersTable();
    if (selectedEmail && byEmail.has(selectedEmail)) {
      openCustomerDialog(byEmail.get(selectedEmail), profiles[selectedEmail] || {});
    } else if (selectedEmail) {
      closeCustomerDialog();
      selectedEmail = null;
    }
  }

  function customerDialog() {
    return $('[data-customer-dialog]');
  }

  function closeCustomerDialog() {
    const dialog = customerDialog();
    if (dialog && dialog.open) dialog.close();
  }

  function openCustomerDialog(customer, profile) {
    const dialog = customerDialog();
    const detail = $('[data-customer-detail]');
    if (!dialog || !detail || !customer) {
      closeCustomerDialog();
      return;
    }
    const selected = new Set(normalizeCustomerTags(profile.tags));
    const tagChoices = CUSTOMER_TAGS.map(row =>
      `<label class="tag-chip"><input type="checkbox" name="tag" value="${escape(row.value)}"${selected.has(row.value) ? ' checked' : ''}> ${escape(row.label)}</label>`
    ).join('');
    const title = $('#customer-dialog-title');
    if (title) title.textContent = customer.email;
    detail.dataset.email = customer.email;
    detail.innerHTML = `
      <div class="customer-sheet">
        <p class="customer-summary">${customer.hasAccount ? 'Has an account' : 'Guest checkout'} · ${customer.orders.length} paid orders · ${escape(money(customer.total))}</p>
        <form class="customer-form" data-customer-form>
          <label><span>Note</span><textarea name="note" maxlength="2000" rows="4" placeholder="Staff note">${escape(profile.note || '')}</textarea></label>
          <fieldset class="tag-fieldset">
            <legend>Tags</legend>
            <div class="tag-grid" role="group" aria-label="Customer tags">${tagChoices}</div>
          </fieldset>
          <div class="customer-form-actions">
            <button class="button dark small" type="submit">Save profile</button>
            <p class="customer-flash" data-customer-flash role="status"${profile._saved ? '' : ' hidden'}>${profile._saved ? 'Saved.' : ''}</p>
          </div>
        </form>
        <div class="customer-orders">
          <p class="order-fulfill-label">Orders</p>
          ${ordersTable(customer.orders, true)}
        </div>
      </div>`;
    if (!dialog.open) dialog.showModal();
  }

  function sizeSummary(product) {
    const variants = (product.variants || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!variants.length) return 'No sizes';
    const active = variants.filter(variant => variant.active).map(variant => variant.size);
    if (!active.length) return 'All sizes off';
    return active.join(' · ');
  }

  function renderProductList() {
    if (!productsCache.length) {
      $('[data-products]').innerHTML = '<p class="empty">No products.</p>';
      return;
    }
    const q = productFilter.q.trim().toLowerCase();
    const filtered = productsCache.filter(product => {
      if (productFilter.status === 'active' && !product.active) return false;
      if (productFilter.status === 'hidden' && product.active) return false;
      if (q && !String(product.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (!filtered.length) {
      $('[data-products]').innerHTML = '<p class="empty">No products match these filters.</p>';
      return;
    }
    $('[data-products]').innerHTML = filtered.map(product => {
      const src = imageUrl(product.image);
      const photo = src
        ? `<img src="${escape(src)}" alt="${escape(product.image_alt || product.name)}">`
        : '<span class="product-thumb-empty" aria-hidden="true"></span>';
      const current = product.id === selectedProductId ? ' is-current' : '';
      return `<button type="button" class="product-row${current}" data-open-product="${escape(product.id)}">
        ${photo}
        <span class="product-row-copy">
          <strong>${escape(product.name)}</strong>
          <span class="note">${escape(sizeSummary(product))}</span>
        </span>
        <span class="product-row-meta">
          <strong>${escape(money(product.unit_price_minor))}</strong>
          <span class="pill ${product.active ? 'paid' : 'expired'}">${product.active ? 'active' : 'hidden'}</span>
        </span>
      </button>`;
    }).join('');
  }

  function productDialog() {
    return $('[data-product-dialog]');
  }

  function closeProductDialog() {
    const dialog = productDialog();
    if (dialog && dialog.open) dialog.close();
  }

  function openProductDialog(product) {
    const dialog = productDialog();
    const detail = $('[data-product-detail]');
    if (!dialog || !detail) return;
    if (!product) {
      closeProductDialog();
      return;
    }
    const src = imageUrl(product.image);
    const variants = (product.variants || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(variant => `<label><input type="checkbox" name="variant-${escape(variant.id)}" ${variant.active ? 'checked' : ''}> ${escape(variant.size)}</label>`)
      .join('');
    const title = $('#product-dialog-title');
    if (title) title.textContent = product.name || 'Edit product';
    detail.innerHTML = `
      <div class="product-edit">
        ${src ? `<img src="${escape(src)}" alt="${escape(product.image_alt || product.name)}">` : '<span></span>'}
        <form data-product-form="${escape(product.id)}">
          <label>Name<input name="name" value="${escape(product.name)}" maxlength="80" required></label>
          <label>Description<textarea name="description" maxlength="1000">${escape(product.description || '')}</textarea></label>
          <label>Price (HK$)<input name="price" type="number" min="1" step="0.01" value="${escape((product.unit_price_minor / 100).toFixed(2))}" required></label>
          <label>Sort order<input name="sort_order" type="number" value="${escape(product.sort_order || 0)}"></label>
          <label class="check-row"><input type="checkbox" name="active" ${product.active ? 'checked' : ''}> Active in the shop</label>
          <p class="note">Sizes</p>
          <div class="variants">${variants}</div>
          <div class="actions">
            <button class="button dark small" type="submit">Save product</button>
            <button class="button small" type="button" data-product-close>Cancel</button>
          </div>
        </form>
      </div>`;
    if (!dialog.open) dialog.showModal();
  }

  async function loadProducts() {
    const { data, error } = await client.from('products').select(PRODUCT_SELECT).order('sort_order');
    if (error) throw error;
    productsCache = data || [];
    renderProductList();
    if (selectedProductId) {
      const found = productsCache.find(product => product.id === selectedProductId);
      if (found) openProductDialog(found);
      else {
        selectedProductId = null;
        closeProductDialog();
      }
    }
  }

  const AUDIT_ACTIONS = [
    { value: 'fulfillment_set', label: 'Fulfilment' },
    { value: 'profile_saved', label: 'Customer profile' },
    { value: 'product_saved', label: 'Product' }
  ];
  const auditActionLabel = value => {
    const found = AUDIT_ACTIONS.find(row => row.value === value);
    return found ? found.label : (value || '—');
  };

  function renderAuditPager() {
    const pager = $('[data-audit-pager]');
    const total = filteredAudit.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (auditPage > pages) auditPage = pages;
    if (total <= PAGE_SIZE) {
      pager.hidden = true;
      pager.innerHTML = '';
      return;
    }
    pager.hidden = false;
    pager.innerHTML = `
      <button type="button" class="button small" data-audit-page-prev ${auditPage <= 1 ? 'disabled' : ''} aria-label="Previous page">← Previous</button>
      <span>${pagerRangeLabel(auditPage, total, 'changes', auditFilter)}</span>
      <button type="button" class="button small" data-audit-page-next ${auditPage >= pages ? 'disabled' : ''} aria-label="Next page">Next →</button>`;
  }

  function renderAuditPage() {
    const table = $('[data-audit-table]');
    if (!filteredAudit.length) {
      table.innerHTML = auditFilter.action
        ? '<p class="empty">No changes match this filter.</p>'
        : '<p class="empty">No staff changes yet. Pack an order, edit a product, or save a customer note — those writes show up here.</p>';
      renderAuditPager();
      return;
    }
    const start = (auditPage - 1) * PAGE_SIZE;
    const pageRows = filteredAudit.slice(start, start + PAGE_SIZE);
    table.innerHTML = `<table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>${
      pageRows.map(row => `<tr>
        <td>${escape(dateOf(row.at))}</td>
        <td>${escape(auditActionLabel(row.action))}</td>
        <td>${escape(row.entity)} ${escape(row.entity_id)}</td>
        <td>${escape(JSON.stringify(row.detail || {}))}</td>
      </tr>`).join('')
    }</tbody></table>`;
    renderAuditPager();
  }

  async function loadAudit() {
    let query = client.from('audit_log').select('at,action,entity,entity_id,detail,actor')
      .order('at', { ascending: false }).limit(500);
    if (auditFilter.action) query = query.eq('action', auditFilter.action);
    const { data, error } = await query;
    if (error) throw error;
    filteredAudit = data || [];
    renderAuditPage();
  }

  async function openView(view) {
    if (!(await requireStaff())) {
      setMessage('', 'Sign in with a staff account.');
      return;
    }
    show(view);
    setMessage('', '');
    try {
      if (view === 'dashboard') await loadDashboard();
      if (view === 'orders') {
        fillFilterForm($('[data-order-filters]'), orderFilter);
        await loadOrders();
      }
      if (view === 'customers') {
        fillFilterForm($('[data-customer-filters]'), customerFilter);
        await loadCustomers();
      }
      if (view === 'products') {
        fillFilterForm($('[data-product-filters]'), productFilter);
        await loadProducts();
      }
      if (view === 'audit') {
        fillFilterForm($('[data-audit-filters]'), auditFilter);
        await loadAudit();
      }
    } catch (error) {
      setMessage('', error.message || 'Could not load this page.');
    }
  }

  $('[data-signin]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;
    setMessage('Signing in…', '');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage('', 'Email or password is incorrect.');
      return;
    }
    if (!isStaffUser(data.user)) {
      await client.auth.signOut({ scope: 'local' });
      setMessage('', 'That account is not staff.');
      return;
    }
    user = data.user;
    setMessage('Signed in.', '');
    await openView('dashboard');
  });

  $('[data-signout]').addEventListener('click', async () => {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      /* Still return to the staff sign-in screen. */
    }
    user = null;
    selectedOrderId = null;
    selectedEmail = null;
    selectedProductId = null;
    closeProductDialog();
    closeOrderDialog();
    closeCustomerDialog();
    show('signin');
    setMessage('Signed out.', '');
  });

  nav.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) openView(go.dataset.go);
  });

  $('[data-order-filters]').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    orderFilter = {
      payment: form.payment.value,
      fulfillment: form.fulfillment.value,
      q: form.q.value
    };
    orderPage = 1;
    syncFilterChrome(form, orderFilter);
    openView('orders');
  });

  $('[data-audit-filters]').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    auditFilter = { action: form.action.value };
    auditPage = 1;
    syncFilterChrome(form, auditFilter);
    openView('audit');
  });

  $('[data-customer-filters]').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    customerFilter = {
      account: form.account.value,
      tags: form.tags.value,
      q: form.q.value
    };
    syncFilterChrome(form, customerFilter);
    renderCustomersTable();
    if (selectedEmail) {
      const pack = customersCache;
      const customer = pack.customers.find(row => row.email === selectedEmail);
      if (customer) openCustomerDialog(customer, pack.profiles[selectedEmail] || {});
      else {
        closeCustomerDialog();
        selectedEmail = null;
      }
    }
  });

  $('[data-product-filters]').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    productFilter = {
      status: form.status.value,
      q: form.q.value
    };
    syncFilterChrome(form, productFilter);
    renderProductList();
  });

  document.addEventListener('change', event => {
    if (!event.target.matches('input[name="cancel-reason"]')) return;
    syncCancelNoteField(event.target.closest('[data-order-detail]'));
  });

  document.addEventListener('click', async event => {
    const clearFilter = event.target.closest('[data-filter-clear]');
    if (clearFilter) {
      const form = clearFilter.closest('form.filters');
      if (!form) return;
      if (form.matches('[data-order-filters]')) {
        orderFilter = { payment: '', fulfillment: '', q: '' };
        orderPage = 1;
        fillFilterForm(form, orderFilter);
        openView('orders');
      } else if (form.matches('[data-customer-filters]')) {
        customerFilter = { account: '', tags: '', q: '' };
        fillFilterForm(form, customerFilter);
        renderCustomersTable();
      } else if (form.matches('[data-product-filters]')) {
        productFilter = { status: '', q: '' };
        fillFilterForm(form, productFilter);
        renderProductList();
      } else if (form.matches('[data-audit-filters]')) {
        auditFilter = { action: '' };
        auditPage = 1;
        fillFilterForm(form, auditFilter);
        openView('audit');
      }
      return;
    }

    if (event.target.closest('[data-page-prev]')) {
      if (orderPage > 1) {
        orderPage -= 1;
        renderOrdersPage();
      }
      return;
    }
    if (event.target.closest('[data-page-next]')) {
      const pages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
      if (orderPage < pages) {
        orderPage += 1;
        renderOrdersPage();
      }
      return;
    }
    if (event.target.closest('[data-audit-page-prev]')) {
      if (auditPage > 1) {
        auditPage -= 1;
        renderAuditPage();
      }
      return;
    }
    if (event.target.closest('[data-audit-page-next]')) {
      const pages = Math.max(1, Math.ceil(filteredAudit.length / PAGE_SIZE));
      if (auditPage < pages) {
        auditPage += 1;
        renderAuditPage();
      }
      return;
    }

    if (event.target.closest('[data-order-close]')) {
      selectedOrderId = null;
      closeOrderDialog();
      return;
    }

    const orderBtn = event.target.closest('[data-open-order]');
    if (orderBtn) {
      selectedOrderId = orderBtn.dataset.openOrder;
      if (currentView !== 'orders') show('orders');
      try {
        const { data, error } = await client.from('orders').select(ORDER_SELECT).eq('id', selectedOrderId).single();
        if (error) throw error;
        openOrderDialog(data);
      } catch (error) {
        setMessage('', error.message || 'Order could not be opened.');
      }
      return;
    }

    if (event.target.closest('[data-customer-close]')) {
      selectedEmail = null;
      closeCustomerDialog();
      return;
    }

    const customerBtn = event.target.closest('[data-open-customer]');
    if (customerBtn) {
      selectedEmail = customerBtn.dataset.openCustomer.toLowerCase();
      if (currentView !== 'customers') await openView('customers');
      const pack = window.__adminCustomers || customersCache;
      const customer = pack.customers.find(row => row.email === selectedEmail);
      if (customer) openCustomerDialog(customer, pack.profiles[selectedEmail] || {});
      else setMessage('', 'Customer could not be opened.');
      return;
    }

    if (event.target.closest('[data-product-close]')) {
      selectedProductId = null;
      renderProductList();
      closeProductDialog();
      return;
    }

    const productBtn = event.target.closest('[data-open-product]');
    if (productBtn) {
      selectedProductId = productBtn.dataset.openProduct;
      show('products');
      renderProductList();
      const found = productsCache.find(product => product.id === selectedProductId);
      openProductDialog(found || null);
      return;
    }

    const askCancel = event.target.closest('[data-fulfill-ask-cancel]');
    if (askCancel) {
      const detail = askCancel.closest('[data-order-detail]');
      if (!detail) return;
      const fulfillPanel = detail.querySelector('[data-fulfill-panel]');
      const cancelPanel = detail.querySelector('[data-cancel-panel]');
      if (fulfillPanel) fulfillPanel.hidden = true;
      if (cancelPanel) cancelPanel.hidden = false;
      syncCancelNoteField(detail);
      return;
    }

    if (event.target.closest('[data-cancel-back]')) {
      const detail = event.target.closest('[data-order-detail]');
      if (!detail) return;
      const fulfillPanel = detail.querySelector('[data-fulfill-panel]');
      const cancelPanel = detail.querySelector('[data-cancel-panel]');
      if (cancelPanel) cancelPanel.hidden = true;
      if (fulfillPanel) fulfillPanel.hidden = false;
      return;
    }

    const cancelConfirm = event.target.closest('[data-cancel-confirm]');
    if (cancelConfirm) {
      const detail = cancelConfirm.closest('[data-order-detail]');
      const orderId = detail && detail.dataset.orderId;
      if (!orderId) return;
      const picked = detail.querySelector('input[name="cancel-reason"]:checked');
      if (!picked) {
        setMessage('', 'Pick a cancel reason.');
        return;
      }
      const noteEl = detail.querySelector('[data-cancel-note]');
      const note = noteEl ? noteEl.value.trim().slice(0, 200) : '';
      if (picked.value === 'other' && !note) {
        setMessage('', 'Write a short reason for Other.');
        if (noteEl) noteEl.focus();
        return;
      }
      await setFulfillment(orderId, 'cancelled', picked.value, note);
      return;
    }

    const fulfill = event.target.closest('[data-fulfill]');
    if (fulfill) {
      const detail = fulfill.closest('[data-order-detail]');
      const orderId = detail && detail.dataset.orderId;
      if (!orderId) return;
      await setFulfillment(orderId, fulfill.dataset.fulfill);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-open-order], tr[data-open-customer]');
    if (!row || event.target !== row) return;
    event.preventDefault();
    row.click();
  });

  document.addEventListener('submit', async event => {
    const customerForm = event.target.closest('[data-customer-form]');
    if (customerForm) {
      event.preventDefault();
      const detail = customerForm.closest('[data-customer-detail]');
      const email = String((detail && detail.dataset.email) || '').trim().toLowerCase();
      if (!email) return;
      const note = customerForm.note.value.slice(0, 2000);
      const tags = normalizeCustomerTags(
        [...customerForm.querySelectorAll('input[name="tag"]:checked')].map(input => input.value)
      );
      const { error } = await client.from('customer_profiles').upsert({
        email,
        note,
        tags,
        updated_by: user.id
      });
      if (error) {
        setMessage('', error.message || 'Profile could not be saved.');
        return;
      }
      await client.rpc('write_audit', {
        p_action: 'profile_saved',
        p_entity: 'customer_profiles',
        p_entity_id: email,
        p_detail: { tags }
      });
      setMessage('Customer profile saved.', '');
      selectedEmail = email;
      await loadCustomers();
      const pack = customersCache;
      const customer = pack.customers.find(row => row.email === email);
      if (customer) {
        openCustomerDialog(customer, { ...(pack.profiles[email] || {}), _saved: true });
        const flash = $('[data-customer-flash]');
        if (flash) {
          flash.hidden = false;
          flash.textContent = 'Saved.';
        }
      }
      return;
    }

    const productForm = event.target.closest('[data-product-form]');
    if (productForm) {
      event.preventDefault();
      const id = productForm.dataset.productForm;
      const price = Math.round(Number(productForm.price.value) * 100);
      if (!Number.isInteger(price) || price < 100) {
        setMessage('', 'Enter a price of at least HK$1.00.');
        return;
      }
      const patch = {
        name: productForm.name.value.trim().slice(0, 80),
        description: productForm.description.value.slice(0, 1000),
        unit_price_minor: price,
        active: productForm.active.checked,
        sort_order: Number(productForm.sort_order.value) || 0
      };
      const { error } = await client.from('products').update(patch).eq('id', id);
      if (error) {
        setMessage('', error.message || 'Product could not be saved.');
        return;
      }
      const variantBoxes = [...productForm.querySelectorAll('input[type="checkbox"][name^="variant-"]')];
      for (const box of variantBoxes) {
        const variantId = box.name.slice('variant-'.length);
        const { error: variantError } = await client.from('variants').update({ active: box.checked }).eq('id', variantId);
        if (variantError) {
          setMessage('', variantError.message || 'A size could not be saved.');
          return;
        }
      }
      await client.rpc('write_audit', {
        p_action: 'product_saved',
        p_entity: 'products',
        p_entity_id: id,
        p_detail: { unit_price_minor: price, active: patch.active }
      });
      setMessage('Product saved. Refresh the shop to see it.', '');
      selectedProductId = null;
      closeProductDialog();
      await openView('products');
    }
  });

  function wireDialogBackdrop(dialog, onClose) {
    if (!dialog) return;
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
        dialog.close();
      }
    });
    dialog.addEventListener('close', onClose);
  }

  wireDialogBackdrop(productDialog(), () => {
    if (selectedProductId) {
      selectedProductId = null;
      renderProductList();
    }
    $('[data-product-detail]').innerHTML = '';
  });

  wireDialogBackdrop(orderDialog(), () => {
    selectedOrderId = null;
    $('[data-order-detail]').innerHTML = '';
  });

  wireDialogBackdrop(customerDialog(), () => {
    selectedEmail = null;
    $('[data-customer-detail]').innerHTML = '';
  });

  (async () => {
    if (await requireStaff()) await openView('dashboard');
    else show('signin');
  })();
})();
