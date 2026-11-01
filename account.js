// Customer accounts with Supabase Auth: the session, emails for confirmation and password reset,
// the bag saved to the account and the customer's own orders. Requires vendor/supabase-js and
// catalogue-remote.js. Sets window.IntoTheBlueAccount.
(function (root) {
  'use strict';

  const settings = root.IntoTheBlueSupabase;
  const ORDER_SELECT = 'id,reference,status,amount_total_minor,currency,card_brand,card_last4,created_at,paid_at,'
    + 'order_items(product_name,size,quantity,unit_price_minor,line_total_minor)';

  // Email links come back with the session (or an error) in the URL fragment.
  const fragment = new URLSearchParams(location.hash.slice(1));
  const arrival = fragment.get('error_code') || fragment.get('error')
    ? { kind: 'link-error', code: fragment.get('error_code') || fragment.get('error') }
    : fragment.get('access_token')
      ? { kind: fragment.get('type') === 'recovery' ? 'recovery' : 'confirmed' }
      : null;

  let client = null;
  try {
    if (root.supabase && settings) {
      client = root.supabase.createClient(settings.url, settings.publishableKey, {
        auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'into-the-blue:auth' }
      });
    }
  } catch (error) {
    client = null;
  }

  let user = null;
  let signingIn = false;
  let started = false;
  let signingOut = false;
  const listeners = new Set();
  // Listeners run after Supabase's own callback returns, so they may call the client again.
  const emit = (type, detail) => setTimeout(() => listeners.forEach(listener => listener(type, detail)), 0);

  // Where email links send people back to: the shop's home page on this site.
  const siteUrl = () => new URL('./', location.href).href.split(/[?#]/)[0];

  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (user && user.id);
      user = next;
      if (event === 'SIGNED_OUT') { if (started && !signingOut) emit('signed-out', { byUser: false }); }
      else if (event === 'PASSWORD_RECOVERY') emit('recovery');
      // Another tab signing in or out. Sign-ins on this page announce themselves as 'signed-in'.
      else if (changed && started && !signingIn) emit('user-changed');
    });
  }

  const ready = (async () => {
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      user = data.session ? data.session.user : null;
    } catch (error) {
      user = null;
    }
    if (arrival) history.replaceState(history.state, '', location.pathname + location.search);
    started = true;
    return user;
  })();

  // Plain error codes for the panel to turn into words.
  function codeOf(error) {
    if (!error) return null;
    if (error.code) return error.code;
    if (error.status === 0 || /fetch|network/i.test(error.message || '')) return 'network';
    if (/invalid login credentials/i.test(error.message || '')) return 'invalid_credentials';
    if (/email not confirmed/i.test(error.message || '')) return 'email_not_confirmed';
    if (error.code === 'same_password' || /same password|should be different from the old/i.test(error.message || '')) return 'same_password';
    return 'unknown';
  }

  const unavailable = { error: 'service_unavailable' };

  async function signUp(email, password) {
    if (!client) return unavailable;
    signingIn = true;
    try {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
      if (error) return { error: codeOf(error) };
      // With confirmation on there is no session yet. An email that already has an account gets the
      // same answer, so the form never reveals who is registered.
      if (!data.session) return { status: 'check-email' };
      user = data.session.user;
      emit('signed-in');
      return { status: 'signed-in' };
    } catch (error) {
      return { error: codeOf(error) };
    } finally {
      signingIn = false;
    }
  }

  async function signIn(email, password) {
    if (!client) return unavailable;
    signingIn = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { error: codeOf(error) };
      user = data.user;
      emit('signed-in');
      return { status: 'signed-in' };
    } catch (error) {
      return { error: codeOf(error) };
    } finally {
      signingIn = false;
    }
  }

  async function resendConfirmation(email) {
    if (!client) return unavailable;
    try {
      const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl() } });
      return error ? { error: codeOf(error) } : { status: 'sent' };
    } catch (error) {
      return { error: codeOf(error) };
    }
  }

  // Answers the same whether or not the email has an account.
  async function requestPasswordReset(email) {
    if (!client) return unavailable;
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
      const code = codeOf(error);
      return code && code !== 'user_not_found' ? { error: code } : { status: 'sent' };
    } catch (error) {
      return { error: codeOf(error) };
    }
  }

  async function setPassword(password) {
    if (!client) return unavailable;
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) return { error: codeOf(error) };
      user = data.user;
      return { status: 'updated' };
    } catch (error) {
      return { error: codeOf(error) };
    }
  }

  async function signOut() {
    if (!client) return;
    signingOut = true;
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      // The local session is removed even if the server can't be reached.
    } finally {
      signingOut = false;
    }
    user = null;
    emit('signed-out', { byUser: true });
  }

  async function accessToken() {
    if (!client || !user) return null;
    try {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : null;
    } catch (error) {
      return null;
    }
  }

  async function loadCart() {
    if (!client || !user) return [];
    const { data, error } = await client.from('carts').select('lines').eq('user_id', user.id).maybeSingle();
    if (error) throw new Error('Saved bag could not be loaded.');
    return data && Array.isArray(data.lines) ? data.lines : [];
  }

  async function saveCart(lines) {
    if (!client || !user) return;
    const rows = lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));
    const { error } = await client.from('carts').upsert({ user_id: user.id, lines: rows }, { onConflict: 'user_id' });
    if (error) throw new Error('Saved bag could not be updated.');
  }

  // Paid orders only, newest first.
  async function loadOrders() {
    if (!client || !user) return [];
    const { data, error } = await client.from('orders').select(ORDER_SELECT)
      .eq('status', 'paid').order('created_at', { ascending: false }).limit(20);
    if (error) throw new Error('Orders could not be loaded.');
    return Array.isArray(data) ? data : [];
  }

  root.IntoTheBlueAccount = Object.freeze({
    available: Boolean(client),
    ready,
    arrival,
    user: () => user,
    on: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    signUp, signIn, resendConfirmation, requestPasswordReset, setPassword, signOut,
    accessToken, loadCart, saveCart, loadOrders
  });
})(self);
