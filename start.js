/*
 * Teshrij services page without brand logos (start.html). Same rows as services.html, with one change:
 *   - <button data-wa="message">  opens a confirm sheet first (TikTok ViewContent, pixel only); WhatsApp opens only
 *                                 from "Continue on WhatsApp" in the sheet, with the message and "Ref: <code>"
 *                                 (TikTok ClickButton + lp_click 'click', same event id, so it is counted once).
 *   - <a data-page>               opens that service's own page, keeping ?ttclid=... and the utm values.
 * The ref code uses the services letter S and the services storage key, exactly like catalog.js.
 * The Meta pixel gets PageView, ViewContent (sheet opened) and Contact (WhatsApp opened, same event id as lp_click).
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://kfgswynickhywzhneltu.supabase.co/functions/v1/lp_click';
  var WHATSAPP = '96176970994';
  var META_PIXEL = '1629320494505137';
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0, 1, I, O
  var KEEP_DAYS = 7;
  var KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'ad_id', 'adset_id', 'campaign_id'];
  var STORE_KEY = 'teshrij_ref_services';

  var query = new URLSearchParams(location.search);
  var urlClick = query.get('ttclid');
  var urlFb = query.get('fbclid'); // Meta's click id, case sensitive: kept exactly as it arrived
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* private mode */ }
  var fresh = saved && saved.code && Date.now() - saved.t < KEEP_DAYS * 864e5;
  if (!fresh || (urlClick && urlClick !== saved.ttclid) || (urlFb && urlFb !== saved.fbclid)) {
    var bytes = new Uint8Array(6), made = 'S';
    crypto.getRandomValues(bytes);
    for (var b = 0; b < bytes.length; b++) made += ALPHABET[bytes[b] % ALPHABET.length];
    saved = {
      code: made, ttclid: urlClick || null, t: Date.now(),
      fbclid: urlFb || null, fbc: urlFb ? 'fb.1.' + Date.now() + '.' + urlFb : null // Meta's click id format
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* lives for this page view */ }
  }
  var code = saved.code;

  // Meta pixel: the page's <head> loads it; it starts here so it can carry the ref code as the visitor id
  function fb() {
    // Meta browser pixel OFF since 2026-11-23 (owner); the loader in the page head is commented out too.
    // try { if (window.fbq) window.fbq.apply(null, arguments); } catch (e) { /* ignore */ }
  }
  fb('init', META_PIXEL, { external_id: code });
  fb('track', 'PageView');
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  var params = {};
  KEPT_PARAMS.forEach(function (k) { if (query.get(k)) params[k] = query.get(k); });

  function report(event) {
    var body = JSON.stringify({
      code: code, event: event, ttclid: saved.ttclid, ttp: cookie('_ttp'),
      fbc: saved.fbc || cookie('_fbc'), fbp: cookie('_fbp'),
      url: location.href.slice(0, 1000), referrer: document.referrer.slice(0, 1000), params: params
    });
    try {
      // a string body is sent as text/plain: no CORS preflight, and it survives leaving the page
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true });
    } catch (e) { /* tracking must never break the page */ }
  }
  function track(name, data, id) {
    try { if (window.ttq) window.ttq.track(name, data, { event_id: id }); } catch (e) { /* ignore */ }
  }
  function waLink(message) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message + '\n\nRef: ' + code);
  }

  // ---- service pages keep the ad click ----
  var onward = new URLSearchParams(location.search);
  if (saved.ttclid && !onward.get('ttclid')) onward.set('ttclid', saved.ttclid);
  if (saved.fbclid && !onward.get('fbclid')) onward.set('fbclid', saved.fbclid);
  var onwardQuery = onward.toString() ? '?' + onward.toString() : '';
  var pages = document.querySelectorAll('a[data-page]');
  for (var p = 0; p < pages.length; p++) pages[p].href = pages[p].getAttribute('href') + onwardQuery;

  // ---- step 1: a WhatsApp row opens the confirm sheet ----
  var sheet = document.getElementById('sheet');
  var send = document.getElementById('send');
  var rows = document.querySelectorAll('button.row[data-wa]');
  for (var i = 0; i < rows.length; i++) {
    rows[i].addEventListener('click', function () {
      var service = this.querySelector('.name').firstChild.textContent.trim();
      document.getElementById('s-title').textContent = service;
      send.href = waLink(this.getAttribute('data-wa'));
      sheet.hidden = false;
      track('ViewContent', { content_type: 'product', content_id: 'services_' + service.toLowerCase().replace(/\W+/g, '') }, 'view_' + service.toLowerCase().replace(/\W+/g, '') + '_' + code);
      fb('track', 'ViewContent', { content_type: 'product', content_ids: ['services_' + service.toLowerCase().replace(/\W+/g, '')], content_name: service }, { eventID: 'view_' + service.toLowerCase().replace(/\W+/g, '') + '_' + code });
    });
  }

  // ---- step 2: only this button opens WhatsApp ----
  send.addEventListener('click', function () {
    report('click');
    track('ClickButton', { content_type: 'product', content_id: 'services_whatsapp_button' }, 'click_' + code);
    fb('track', 'Contact', { content_name: 'services WhatsApp button' }, { eventID: 'click_' + code });
  });

  function closeSheet() { sheet.hidden = true; }
  document.getElementById('back').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  report('view');
})();
