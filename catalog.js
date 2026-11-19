/*
 * Teshrij services list: every row is one tap.
 *   - <a data-wa="message">  opens WhatsApp with that message and a ref code (S...). The code ties the chat to the
 *                            TikTok ad click (?ttclid=...), exactly like lp.js does on the product pages.
 *   - <a data-page>          opens that service's own page and keeps ?ttclid=... and the utm values,
 *                            so the ad click is still tied to the order there.
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://kfgswynickhywzhneltu.supabase.co/functions/v1/lp_click';
  var WHATSAPP = '96176970994';
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0, 1, I, O
  var KEEP_DAYS = 7;
  var KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'ad_id', 'adset_id', 'campaign_id'];
  var STORE_KEY = 'teshrij_ref_services';

  var query = new URLSearchParams(location.search);
  var urlClick = query.get('ttclid');
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* private mode */ }
  var fresh = saved && saved.code && Date.now() - saved.t < KEEP_DAYS * 864e5;
  if (!fresh || (urlClick && urlClick !== saved.ttclid)) {
    var bytes = new Uint8Array(6), made = 'S';
    crypto.getRandomValues(bytes);
    for (var b = 0; b < bytes.length; b++) made += ALPHABET[bytes[b] % ALPHABET.length];
    saved = { code: made, ttclid: urlClick || null, t: Date.now() };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* private mode: lives for this page view */ }
  }
  var code = saved.code;

  var params = {};
  KEPT_PARAMS.forEach(function (k) { if (query.get(k)) params[k] = query.get(k); });

  function report(event) {
    var m = document.cookie.match(/(?:^|; )_ttp=([^;]*)/);
    var body = JSON.stringify({
      code: code, event: event, ttclid: saved.ttclid, ttp: m ? decodeURIComponent(m[1]) : null,
      url: location.href.slice(0, 1000), referrer: document.referrer.slice(0, 1000), params: params
    });
    try {
      // a string body is sent as text/plain: no CORS preflight, and it survives leaving the page
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true });
    } catch (e) { /* tracking must never break the page */ }
  }

  function tapped() {
    report('click');
    try {
      // same event id as the server's ClickButton, so TikTok counts the tap once
      if (window.ttq) window.ttq.track('ClickButton', { content_type: 'product', content_id: 'services_whatsapp_button' }, { event_id: 'click_' + code });
    } catch (e) { /* ignore */ }
  }

  function waLink(message) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message + '\n\nRef: ' + code);
  }

  // The product pages get the ad click too, also when this visit's address no longer shows it
  var onward = new URLSearchParams(location.search);
  if (saved.ttclid && !onward.get('ttclid')) onward.set('ttclid', saved.ttclid);
  var onwardQuery = onward.toString() ? '?' + onward.toString() : '';

  var links = document.querySelectorAll('a[data-wa], a[data-page]');
  for (var i = 0; i < links.length; i++) {
    var a = links[i], message = a.getAttribute('data-wa');
    if (message) {
      a.href = waLink(message);
      a.addEventListener('click', tapped);
    } else {
      a.href = a.getAttribute('href') + onwardQuery;
    }
  }

  // Every WhatsApp link carries the ref code, whichever code created the link
  function stamp(link) {
    var url;
    try { url = new URL(link.href); } catch (e) { return; }
    if (url.hostname !== 'wa.me') return;
    var text = url.searchParams.get('text') || '';
    if (text.indexOf('Ref: ' + code) < 0) link.href = waLink(text || 'Hello!');
  }
  var waLinks = document.querySelectorAll('a[href*="wa.me"]');
  for (var w = 0; w < waLinks.length; w++) stamp(waLinks[w]);
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (link) stamp(link);
  }, true); // runs before the browser follows the link

  report('view');
})();
