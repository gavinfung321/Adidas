// Account drawer: sign in, create account, check email, forgot/reset password, My orders.
// Requires account.js. Sets window.IntoTheBlueAccountPanel.
(function (root) {
  'use strict';

  const Account = root.IntoTheBlueAccount;
  const ERRORS = {
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Please confirm your email first.',
    weak_password: 'Password must be at least 8 characters.',
    same_password: 'That’s the same as your current password. Choose a different one.',
    over_email_send_rate_limit: 'Too many emails just now. Please try again in a few minutes.',
    network: 'Can’t reach the account service. Check your connection and try again.',
    service_unavailable: 'Accounts aren’t available right now. Please try again shortly.',
    unknown: 'Something went wrong. Please try again.'
  };

  const CARD_BRANDS = { amex: 'American Express', diners: 'Diners Club', discover: 'Discover', jcb: 'JCB', mastercard: 'Mastercard', unionpay: 'UnionPay', visa: 'Visa' };

  function create({ dialog, open }) {
    if (!dialog || !Account) return null;

    const $ = (sel, rootEl = dialog) => rootEl.querySelector(sel);
    const $$ = (sel, rootEl = dialog) => Array.from(rootEl.querySelectorAll(sel));
    const views = Object.fromEntries($$('[data-account-view]').map(el => [el.dataset.accountView, el]));
    const statusEl = $('#account-status');
    const errorEl = $('#account-error');
    const titleEl = $('#account-title');
    let current = 'signin';
    let pendingEmail = '';
    let busy = false;
    let resendUntil = 0;
    let resendTimer = 0;

    function setBusy(next) {
      busy = next;
      $$('button, input', dialog).forEach(el => {
        if (el.classList.contains('dialog-close') || el.hasAttribute('data-account-go')) return;
        if (el.tagName === 'INPUT') el.readOnly = next;
        else if (el.type === 'submit' || el.hasAttribute('data-account-resend') || el.hasAttribute('data-account-signout')) {
          el.disabled = next || (el.hasAttribute('data-account-resend') && Date.now() < resendUntil);
        }
      });
    }

    function setError(message) {
      errorEl.textContent = message || '';
    }

    function setStatus(message, tone) {
      statusEl.textContent = message || '';
      statusEl.classList.toggle('is-success', Boolean(message) && tone === 'success');
    }

    function messageFor(code) {
      return ERRORS[code] || ERRORS.unknown;
    }

    function fillEmails(email) {
      $$('[data-account-email]').forEach(el => { el.textContent = email || ''; });
    }

    function fillUser(email) {
      $$('[data-account-user]').forEach(el => { el.textContent = email || ''; });
    }

    function show(name, { status, error, email, tone } = {}) {
      current = name;
      Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
      titleEl.textContent = 'Account';
      if (email !== undefined) {
        pendingEmail = email;
        fillEmails(email);
      }
      if (status !== undefined) setStatus(status, tone);
      if (error !== undefined) setError(error);
      else setError('');
      const heading = views[name] && views[name].querySelector('h3');
      if (heading) {
        try { heading.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
      $$('[data-account-dot]').forEach(dot => { dot.hidden = !Account.user(); });
    }

    function openTo(name, options) {
      show(name, options);
      if (typeof open === 'function') open(dialog);
      else if (!dialog.open) dialog.showModal();
    }

    function money(minor, currency) {
      if (String(currency || '').toLowerCase() === 'hkd' && root.IntoTheBlueCatalogue && root.IntoTheBlueCatalogue.formatMoney) {
        return root.IntoTheBlueCatalogue.formatMoney(minor);
      }
      const amount = (Number(minor) / 100).toFixed(2);
      return String(currency || 'HKD').toUpperCase() === 'HKD' ? `HK$${amount}` : `${amount} ${String(currency || '').toUpperCase()}`;
    }

    function formatDate(iso) {
      if (!iso) return '';
      try {
        return new Intl.DateTimeFormat('en-HK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
      } catch (e) {
        return '';
      }
    }

    function renderOrders(orders) {
      const list = $('[data-account-orders]');
      const state = $('[data-account-orders-state]');
      list.replaceChildren();
      if (!orders || !orders.length) {
        state.textContent = 'No test orders yet.';
        return;
      }
      state.textContent = '';
      orders.forEach(order => {
        const item = document.createElement('li');
        item.className = 'account-order';
        const head = document.createElement('div');
        head.className = 'account-order-head';
        const ref = document.createElement('strong');
        ref.textContent = order.reference || 'Order';
        const date = document.createElement('span');
        date.textContent = formatDate(order.paid_at || order.created_at);
        head.append(ref, date);

        const lines = document.createElement('ul');
        lines.className = 'account-order-lines';
        (order.order_items || []).forEach(row => {
          const li = document.createElement('li');
          li.className = 'account-order-line';
          const catalogue = root.IntoTheBlueCatalogue;
          const product = catalogue && catalogue.products.find(item => item.name === row.product_name);
          if (product && product.image) {
            const photo = document.createElement('img');
            photo.src = product.image;
            photo.alt = product.imageAlt || row.product_name;
            li.append(photo);
          }
          const text = document.createElement('span');
          text.textContent = `${row.product_name} · size ${row.size} · Qty ${row.quantity}`;
          li.append(text);
          lines.append(li);
        });

        const foot = document.createElement('p');
        foot.className = 'account-order-foot';
        const card = order.card_last4
          ? `${CARD_BRANDS[order.card_brand] || 'Card'} ending ${order.card_last4}`
          : '';
        foot.textContent = [money(order.amount_total_minor, order.currency), card].filter(Boolean).join(' · ');

        item.append(head, lines, foot);
        list.append(item);
      });
    }

    async function loadAccountView(notice) {
      const message = notice && typeof notice === 'object' ? notice.message : (notice || '');
      const tone = notice && typeof notice === 'object' ? notice.tone : '';
      const user = Account.user();
      fillUser(user && user.email);
      show('account', { status: message, tone, error: '' });
      const state = $('[data-account-orders-state]');
      state.textContent = 'Loading orders…';
      $('[data-account-orders]').replaceChildren();
      try {
        if (root.IntoTheBlueCatalogueReady) {
          try { await root.IntoTheBlueCatalogueReady; } catch (error) { /* the built-in catalogue still has the photos */ }
        }
        renderOrders(await Account.loadOrders());
      } catch (e) {
        state.textContent = 'Orders couldn’t be loaded just now.';
      }
    }

    function readForm(form) {
      const data = new FormData(form);
      return {
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || '')
      };
    }

    dialog.addEventListener('submit', async event => {
      const form = event.target.closest('[data-account-form]');
      if (!form || !dialog.contains(form)) return;
      event.preventDefault();
      if (busy) return;
      const kind = form.dataset.accountForm;
      const { email, password } = readForm(form);
      setBusy(true);
      setError('');
      try {
        if (kind === 'signin') {
          const result = await Account.signIn(email, password);
          if (result.error === 'email_not_confirmed') {
            show('check-email', { email, error: messageFor(result.error) });
            return;
          }
          if (result.error) { setError(messageFor(result.error)); return; }
          await loadAccountView();
        } else if (kind === 'signup') {
          const result = await Account.signUp(email, password);
          if (result.error) { setError(messageFor(result.error)); return; }
          if (result.status === 'check-email') show('check-email', { email, status: '' });
          else await loadAccountView();
        } else if (kind === 'forgot') {
          const result = await Account.requestPasswordReset(email);
          if (result.error) { setError(messageFor(result.error)); return; }
          show('forgot-sent', { email });
        } else if (kind === 'reset') {
          const result = await Account.setPassword(password);
          if (result.error) { setError(messageFor(result.error)); return; }
          await loadAccountView('Password updated.');
        }
      } finally {
        setBusy(false);
      }
    });

    dialog.addEventListener('click', async event => {
      const go = event.target.closest('[data-account-go]');
      if (go && dialog.contains(go)) {
        show(go.dataset.accountGo, { status: '', error: '' });
        return;
      }
      const resend = event.target.closest('[data-account-resend]');
      if (resend && dialog.contains(resend)) {
        if (busy || Date.now() < resendUntil || !pendingEmail) return;
        setBusy(true);
        setError('');
        try {
          const result = await Account.resendConfirmation(pendingEmail);
          if (result.error) { setError(messageFor(result.error)); return; }
          setStatus('Email sent again. Check your inbox.');
          resendUntil = Date.now() + 60000;
          clearInterval(resendTimer);
          const tick = () => {
            const left = Math.ceil((resendUntil - Date.now()) / 1000);
            if (left <= 0) {
              clearInterval(resendTimer);
              resend.textContent = 'Send the email again';
              resend.append(document.createTextNode(' '), Object.assign(document.createElement('span'), { textContent: '↗︎' }));
              resend.disabled = false;
              return;
            }
            resend.disabled = true;
            resend.textContent = `Send again in ${left}s`;
          };
          resendTimer = setInterval(tick, 1000);
          tick();
        } finally {
          setBusy(false);
        }
        return;
      }
      const signout = event.target.closest('[data-account-signout]');
      if (signout && dialog.contains(signout)) {
        if (busy) return;
        setBusy(true);
        try {
          await Account.signOut();
          show('signin', { status: '', error: '' });
        } finally {
          setBusy(false);
        }
      }
    });

    Account.on((type) => {
      if (type === 'signed-in') loadAccountView(dialog.open ? '' : undefined);
      else if (type === 'signed-out') {
        $$('[data-account-dot]').forEach(dot => { dot.hidden = true; });
        if (dialog.open && current === 'account') show('signin');
      } else if (type === 'recovery') openTo('reset', { status: '', error: '' });
    });

    Account.ready.then(user => {
      const arrival = Account.arrival;
      if (arrival && arrival.kind === 'link-error') {
        openTo('expired');
        return;
      }
      if (arrival && arrival.kind === 'recovery') {
        openTo('reset');
        return;
      }
      if (arrival && arrival.kind === 'confirmed' && user) {
        openTo('account');
        loadAccountView({ message: 'Email confirmed. You’re signed in.', tone: 'success' });
        return;
      }
      const params = new URLSearchParams(location.search);
      const want = params.get('account');
      if (want === 'orders' || want === 'signin') {
        history.replaceState(history.state, '', location.pathname + location.hash);
        if (user && want === 'orders') {
          openTo('account');
          loadAccountView();
        } else if (user) {
          openTo('account');
          loadAccountView();
        } else openTo('signin');
      }
    });

    return {
      open: (view, options) => {
        if (Account.user() && (!view || view === 'account' || view === 'orders')) {
          openTo('account', options);
          loadAccountView(options && options.status);
        } else openTo(view || 'signin', options);
      },
      show
    };
  }

  root.IntoTheBlueAccountPanel = Object.freeze({ create });
})(self);
