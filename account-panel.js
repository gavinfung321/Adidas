// Account drawer: sign in, create account, check email, forgot/reset password, and the account home.
// Profile, password, email and privacy open in a separate centered dialog.
// Requires account.js. Sets window.IntoTheBlueAccountPanel.
(function (root) {
  'use strict';

  const Account = root.IntoTheBlueAccount;
  const ERRORS = {
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Please confirm your email first.',
    weak_password: 'Password must be at least 8 characters.',
    same_password: 'That’s the same as your current password. Choose a different one.',
    current_password: 'Current password is incorrect.',
    email_exists: 'That email already has an account.',
    photo_type: 'Use a JPEG, PNG, or WebP photo.',
    photo_too_large: 'That photo is over 1 MB.',
    sign_in_required: 'Please sign in again.',
    delete_failed: 'The account could not be deleted. Please try again.',
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
    const editDialog = document.querySelector('#account-edit-dialog');
    const EDIT_TITLES = { details: 'Your details', password: 'Password', email: 'Email', privacy: 'Privacy' };
    let current = 'signin';
    let editReturn = null;
    let editNotice = null;
    let pendingEmail = '';
    let busy = false;
    let resendUntil = 0;
    let resendTimer = 0;

    function activeDialog() {
      return editDialog && editDialog.open ? editDialog : dialog;
    }

    function setBusy(next) {
      busy = next;
      const roots = next ? [activeDialog()] : [dialog, editDialog].filter(Boolean);
      roots.forEach(root => $$('button, input', root).forEach(el => {
        if (el.classList.contains('dialog-close') || el.hasAttribute('data-account-go')) return;
        if (el.tagName === 'INPUT') el.readOnly = next;
        else if (el.type === 'submit' || el.hasAttribute('data-account-resend') || el.hasAttribute('data-account-signout')) {
          el.disabled = next || (el.hasAttribute('data-account-resend') && Date.now() < resendUntil);
        }
      }));
    }

    function surfaceNodes(kind) {
      const edit = editDialog && editDialog.querySelector(kind === 'status' ? '[data-account-edit-status]' : '[data-account-edit-error]');
      return [kind === 'status' ? statusEl : errorEl, edit].filter(Boolean);
    }

    function setError(message) {
      const editing = Boolean(editDialog && editDialog.open);
      surfaceNodes('error').forEach(el => {
        const on = editing ? el.hasAttribute('data-account-edit-error') : el === errorEl;
        el.textContent = on ? (message || '') : '';
      });
    }

    function setStatus(message, tone) {
      const editing = Boolean(editDialog && editDialog.open);
      surfaceNodes('status').forEach(el => {
        const on = editing ? el.hasAttribute('data-account-edit-status') : el === statusEl;
        el.textContent = on ? (message || '') : '';
        el.classList.toggle('is-success', on && Boolean(message) && tone === 'success');
      });
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

    function isStaffUser(user) {
      return (user && user.app_metadata && user.app_metadata.role) === 'staff';
    }

    async function syncAdminEntry() {
      const wrap = $('[data-account-admin]');
      if (!wrap) return;
      const apply = () => {
        const staff = isStaffUser(Account.user());
        wrap.hidden = !staff;
        const orders = $('[data-account-orders-block]');
        if (orders) orders.hidden = staff;
      };
      apply();
      if (typeof Account.refreshUser === 'function') {
        try { await Account.refreshUser(); } catch (e) { /* keep current user */ }
      }
      apply();
    }

    function initialsFromName(name, email) {
      const source = String(name || '').trim();
      if (source) {
        const parts = source.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return source.slice(0, 2).toUpperCase();
      }
      const local = String(email || '').split('@')[0].trim();
      if (!local) return '?';
      const parts = local.split(/[._+\-]+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return local.slice(0, 2).toUpperCase();
    }

    function paintFace(el, initials, url) {
      if (!el) return;
      el.replaceChildren();
      el.classList.toggle('has-photo', Boolean(url));
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        el.append(img);
        return;
      }
      el.textContent = initials || '';
    }

    function updateAccountAvatar() {
      const user = Account.user();
      const signedIn = Boolean(user && user.email);
      document.querySelectorAll('[data-account-open]').forEach(button => {
        const avatar = button.querySelector('[data-account-avatar]');
        const dot = button.querySelector('[data-account-dot]');
        button.classList.toggle('is-signed-in', signedIn);
        if (avatar) {
          if (signedIn) {
            avatar.hidden = false;
            paintFace(avatar, initialsFromName(avatar.dataset.name, user.email), avatar.dataset.photo || '');
          } else {
            avatar.hidden = true;
            delete avatar.dataset.name;
            delete avatar.dataset.photo;
            paintFace(avatar, '', '');
          }
        }
        if (dot) dot.hidden = true;
        button.setAttribute('aria-label', signedIn ? `Account, signed in as ${user.email}` : 'Account');
        if (signedIn) button.title = user.email;
        else button.removeAttribute('title');
      });
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
      const heading = views[name] && (views[name].querySelector('[tabindex="-1"]') || views[name].querySelector('h3'));
      if (heading) {
        try { heading.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
      updateAccountAvatar();
      if (name === 'account') void syncAdminEntry();
      else {
        const wrap = $('[data-account-admin]');
        if (wrap) wrap.hidden = true;
      }
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

    async function showProfile(profile) {
      const form = document.querySelector('[data-account-form="profile"]');
      const removeButtons = document.querySelectorAll('[data-account-photo-remove]');
      const user = Account.user();
      const name = profile ? profile.display_name : '';
      if (form) {
        form.display_name.value = name || '';
        form.phone.value = profile ? profile.phone || '' : '';
        form.address_line.value = profile ? profile.address_line || '' : '';
        form.district.value = profile ? profile.district || '' : '';
      }
      let url = '';
      if (profile && profile.avatar_path && Account.avatarUrl) {
        try { url = await Account.avatarUrl(profile.avatar_path) || ''; } catch (e) { url = ''; }
      }
      const initials = initialsFromName(name, user && user.email);
      document.querySelectorAll('[data-account-photo]').forEach(el => paintFace(el, initials, url));
      const nameEl = document.querySelector('[data-account-name]');
      const emailLine = document.querySelector('.account-home-email');
      if (nameEl) nameEl.textContent = name || (user && user.email) || '';
      if (emailLine) emailLine.hidden = !name;
      removeButtons.forEach(remove => { remove.hidden = !url; });
      document.querySelectorAll('[data-account-avatar]').forEach(avatar => {
        avatar.dataset.name = name || '';
        avatar.dataset.photo = url;
      });
      updateAccountAvatar();
    }

    async function loadAccountView(notice) {
      const message = notice && typeof notice === 'object' ? notice.message : (notice || '');
      const tone = notice && typeof notice === 'object' ? notice.tone : '';
      const user = Account.user();
      fillUser(user && user.email);
      show('account', { status: message, tone, error: '' });
      await syncAdminEntry();
      if (Account.loadProfile) {
        const loaded = await Account.loadProfile();
        if (!loaded.error) await showProfile(loaded.profile);
      }
      const state = $('[data-account-orders-state]');
      const list = $('[data-account-orders]');
      if (isStaffUser(Account.user())) {
        if (state) state.textContent = '';
        if (list) list.replaceChildren();
        return;
      }
      state.textContent = 'Loading orders…';
      list.replaceChildren();
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

    function showEdit(name) {
      if (!editDialog) return;
      editDialog.querySelectorAll('[data-account-edit-view]').forEach(el => {
        el.hidden = el.dataset.accountEditView !== name;
      });
      const title = editDialog.querySelector('#account-edit-title');
      if (title) title.textContent = EDIT_TITLES[name] || 'Account';
      setError('');
      const editStatus = editDialog.querySelector('[data-account-edit-status]');
      if (editStatus) {
        editStatus.textContent = '';
        editStatus.classList.remove('is-success');
      }
    }

    function revealDrawer(next, notice) {
      if (next === 'account') openTo('account', notice || { status: '', error: '' });
      else if (next === 'signin') openTo('signin', notice || { status: '', error: '' });
    }

    function finishEdit(next, notice) {
      editReturn = next;
      editNotice = notice || null;
      if (editDialog && editDialog.open) editDialog.close();
      else revealDrawer(next, notice);
    }

    async function openEdit(name) {
      if (!editDialog || busy) return;
      if (name === 'details' && Account.loadProfile) {
        try {
          const loaded = await Account.loadProfile();
          if (!loaded.error) await showProfile(loaded.profile);
        } catch (e) { /* keep the fields already shown */ }
      }
      ['password', 'email', 'delete'].forEach(kind => {
        const form = editDialog.querySelector(`[data-account-form="${kind}"]`);
        if (form && (kind === name || (name === 'privacy' && kind === 'delete'))) form.reset();
      });
      showEdit(name);
      editReturn = 'account';
      editNotice = null;
      if (typeof open === 'function') open(editDialog);
      else if (!editDialog.open) editDialog.showModal();
      const title = editDialog.querySelector('#account-edit-title');
      if (title) {
        try { title.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    }

    if (editDialog) {
      editDialog.addEventListener('close', () => {
        if (document.querySelector('dialog[open]')) {
          editReturn = null;
          editNotice = null;
          return;
        }
        const next = editReturn;
        const notice = editNotice;
        editReturn = null;
        editNotice = null;
        if (next) revealDrawer(next, notice);
      });
    }

    async function onSubmit(event) {
      const form = event.target.closest('[data-account-form]');
      if (!form || !event.currentTarget.contains(form)) return;
      event.preventDefault();
      if (busy) return;
      const kind = form.dataset.accountForm;
      const { email, password } = readForm(form);
      setBusy(true);
      setError('');
      try {
        if (kind === 'profile') {
          const result = await Account.saveProfile({
            displayName: form.display_name.value,
            phone: form.phone.value,
            addressLine: form.address_line.value,
            district: form.district.value
          });
          if (result.error) { setError(messageFor(result.error)); return; }
          const loaded = await Account.loadProfile();
          if (!loaded.error) await showProfile(loaded.profile);
          finishEdit('account', { status: 'Details saved.', tone: 'success' });
        } else if (kind === 'password') {
          const result = await Account.changePassword(form.current.value, password);
          if (result.error) { setError(messageFor(result.error)); return; }
          form.reset();
          finishEdit('account', { status: 'Password updated.', tone: 'success' });
        } else if (kind === 'email') {
          const result = await Account.changeEmail(email);
          if (result.error) { setError(messageFor(result.error)); return; }
          form.reset();
          finishEdit('account', { status: 'Check both inboxes to confirm that email. This one still works until both links are opened.', tone: 'success' });
        } else if (kind === 'delete') {
          if (String(form.confirm.value || '').trim() !== 'delete') {
            setError('Type delete to remove this account.');
            return;
          }
          const result = await Account.deleteAccount();
          if (result.error) { setError(messageFor(result.error)); return; }
          finishEdit('signin', { status: 'Account deleted.', tone: 'success' });
        } else if (kind === 'signin') {
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
    }

    dialog.addEventListener('submit', onSubmit);
    dialog.addEventListener('change', onPhotoChange);
    if (editDialog) editDialog.addEventListener('submit', onSubmit);

    dialog.addEventListener('click', async event => {
      const editButton = event.target.closest('[data-account-edit]');
      if (editButton && dialog.contains(editButton)) {
        openEdit(editButton.dataset.accountEdit);
        return;
      }
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
      const photoRemove = event.target.closest('[data-account-photo-remove]');
      if (photoRemove && dialog.contains(photoRemove)) {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await Account.removeAvatar();
          if (result.error) { setError(messageFor(result.error)); return; }
          const loaded = await Account.loadProfile();
          if (!loaded.error) await showProfile(loaded.profile);
          setStatus('Photo removed.', 'success');
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

    async function onPhotoChange(event) {
      const input = event.target.closest('[data-account-photo-file]');
      if (!input || !event.currentTarget.contains(input) || busy) return;
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      setBusy(true);
      setError('');
      try {
        const result = await Account.uploadAvatar(file);
        if (result.error) { setError(messageFor(result.error)); return; }
        const loaded = await Account.loadProfile();
        if (!loaded.error) await showProfile(loaded.profile);
        setStatus('Photo saved.', 'success');
      } finally {
        setBusy(false);
      }
    }

    if (editDialog) {
      editDialog.addEventListener('click', async event => {
        const photoRemove = event.target.closest('[data-account-photo-remove]');
        if (!photoRemove || !editDialog.contains(photoRemove) || busy) return;
        setBusy(true);
        setError('');
        try {
          const result = await Account.removeAvatar();
          if (result.error) { setError(messageFor(result.error)); return; }
          const loaded = await Account.loadProfile();
          if (!loaded.error) await showProfile(loaded.profile);
          setStatus('Photo removed.', 'success');
        } finally {
          setBusy(false);
        }
      });
      editDialog.addEventListener('change', onPhotoChange);
    }

    Account.on((type) => {
      if (type === 'signed-in') {
        updateAccountAvatar();
        loadAccountView(dialog.open ? '' : undefined);
      } else if (type === 'signed-out') {
        updateAccountAvatar();
        if (dialog.open && current === 'account') show('signin');
      } else if (type === 'recovery') openTo('reset', { status: '', error: '' });
    });

    async function paintSignedInFace() {
      if (!Account.user() || !Account.loadProfile) return;
      try {
        const loaded = await Account.loadProfile();
        if (!loaded.error && loaded.profile) await showProfile(loaded.profile);
      } catch (e) { /* the header keeps email initials */ }
    }

    Account.ready.then(user => {
      updateAccountAvatar();
      if (user) void paintSignedInFace();
      const arrival = Account.arrival;
      if (arrival && arrival.kind === 'link-error') {
        openTo('expired');
        return;
      }
      if (arrival && arrival.kind === 'recovery') {
        openTo('reset');
        return;
      }
      if (arrival && arrival.kind === 'email-changed' && user) {
        openTo('account');
        loadAccountView({ message: 'Email updated.', tone: 'success' });
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
