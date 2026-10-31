// Test-mode checkout client. The browser sends only variant IDs and quantities; the server
// function (supabase/functions) sets the prices and creates the Stripe Checkout Session.
(function (root) {
  'use strict';

  // Set to https://<project-ref>.supabase.co/functions/v1 once the functions are deployed.
  const DEPLOYED_ENDPOINT = 'https://pryofarsgkhfbajmdeyy.supabase.co/functions/v1';
  const LOCAL_ENDPOINT = 'http://127.0.0.1:54321/functions/v1';
  // Publishable keys are meant for browser code; the secret key stays on the server.
  const PUBLISHABLE_KEY = 'pk_test_51UV6oT08I4fHZIAU06Q4oHlKKHUFIPXQnvhlZRi29QqXr76gY8JTBOGMjiBFCRpZRkBJNVxJNBemtDGQMSk80Uqe00OwAvcksL';
  const TIMEOUT_MS = 15000;

  function endpoint() {
    const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    return local ? LOCAL_ENDPOINT : DEPLOYED_ENDPOINT;
  }

  async function request(path, init) {
    const base = endpoint();
    if (!base) throw new Error('Checkout endpoint is not configured.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/${path}`, { ...init, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(`Checkout request failed (${response.status}).`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // Resolves to { clientSecret, lines: [{ variantId, quantity }] } in the order Stripe will charge them.
  async function start(lines) {
    const data = await request('create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: lines.map(({ variantId, quantity }) => ({ variantId, quantity })) })
    });
    const valid = typeof data.clientSecret === 'string'
      && /^cs_test_[A-Za-z0-9]+_secret_[A-Za-z0-9%_-]{1,400}$/.test(data.clientSecret)
      && Array.isArray(data.lines) && data.lines.length > 0;
    if (!valid) throw new Error('Unexpected checkout response.');
    return { clientSecret: data.clientSecret, lines: data.lines };
  }

  function status(sessionId) {
    return request(`checkout-status?session_id=${encodeURIComponent(sessionId)}`, { method: 'GET' });
  }

  function publishableKey() {
    return /^pk_test_/.test(PUBLISHABLE_KEY) ? PUBLISHABLE_KEY : '';
  }

  root.IntoTheBlueCheckout = Object.freeze({ endpoint, start, status, publishableKey });
})(self);
