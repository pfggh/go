/*
 * Teshrij landing pages (one per ad): the page has one goal, a WhatsApp chat.
 *
 * Ordering is locked in: the visitor picks a plan (one is chosen from the start), taps Continue, and
 * gets a confirmation sheet; the order goes to WhatsApp only after they pick Whish or USDT, and the
 * message reads "I'd like to order <plan and price>. I'll pay by <method>." (autoreply.rules order_*_v2). The only other way to
 * WhatsApp is the small "Message us" link (<a data-wa="message">) in the header.
 * TikTok gets AddToCart when Continue is tapped, InitiateCheckout (with the price) when the order is
 * confirmed, and ClickButton for any tap that opens WhatsApp. The Meta pixel is off (since 2026-11-23); these steps go to TikTok only
 * (AddToCart, InitiateCheckout, Contact) plus PageView, with the same event ids as the backend.
 *
 * Every visitor gets a short ref code (G... on the ChatGPT page, A... on the Anghami page). The code is
 *   1. sent to the backend (lp_click) together with the ad click id from the URL (?ttclid=... from
 *      TikTok, ?fbclid=... from Meta), and
 *   2. added to the prefilled WhatsApp message as "Ref: <code>".
 * When the customer sends that message, the backend ties their phone number to the ad click, so the lead
 * and a later sale are reported to TikTok and Meta with the click id.
 *
 * The page needs:
 *   <body data-product="gpt|anghami" data-name="ChatGPT+">
 *   <input type="radio" name="plan" data-item="ChatGPT+ (3 months, $15)" data-plan="3 months" data-short="3 months" data-value="15">
 *   <button class="go" id="go"> in the plan card, <div id="bar"><button class="go"> at the bottom
 *   <div id="sheet" hidden> with #s-item, #s-price, #pays (radios name="pay"), #s-agree, <a id="send">, #back
 *   <a data-wa="message">                                  the "Message us" link
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://kfgswynickhywzhneltu.supabase.co/functions/v1/lp_click';
  var WHATSAPP = '96176970994';
  var META_PIXEL = '1629320494505137';
  var LETTER = { gpt: 'G', anghami: 'A' };
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0, 1, I, O
  var KEEP_DAYS = 7; // a returning visitor keeps their code this long, unless they arrive from a new ad click
  var KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'fbclid', 'ad_id', 'adset_id', 'campaign_id'];

  var product = document.body.getAttribute('data-product');
  var letter = LETTER[product];
  if (!letter) return;
  // short content id for pixel reports
  var PIXEL_ID = { gpt: 'ai', anghami: 'music' }[product] || 'plan';

  var query = new URLSearchParams(location.search);
  var storeKey = 'teshrij_ref_' + product;

  function load() {
    try { return JSON.parse(localStorage.getItem(storeKey)) || null; } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(storeKey, JSON.stringify(v)); } catch (e) { /* private mode: the code lives for this page view */ }
  }
  function newCode() {
    var bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    var out = letter;
    for (var i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // The visitor's code: reuse the stored one, except when it is old or this is a different ad click
  var urlClick = query.get('ttclid');
  var urlFb = query.get('fbclid'); // Meta's click id, case sensitive: kept exactly as it arrived
  var saved = load();
  var fresh = saved && saved.code && Date.now() - saved.t < KEEP_DAYS * 864e5;
  if (!fresh || (urlClick && urlClick !== saved.ttclid) || (urlFb && urlFb !== saved.fbclid)) {
    saved = {
      code: newCode(), ttclid: urlClick || null, t: Date.now(),
      fbclid: urlFb || null, fbc: urlFb ? 'fb.1.' + Date.now() + '.' + urlFb : null // Meta's click id format
    };
    save(saved);
  }
  var code = saved.code;

  // Meta pixel: the page's <head> loads it; it starts here so it can carry the ref code as the visitor id
  function fb() {
    // Meta browser pixel OFF since 2026-11-23 (owner); the loader in the page head is commented out too.
    // try { if (window.fbq) window.fbq.apply(null, arguments); } catch (err) { /* ignore */ }
  }
  fb('init', META_PIXEL, { external_id: code });
  fb('track', 'PageView');

  var params = {};
  KEPT_PARAMS.forEach(function (k) { if (query.get(k)) params[k] = query.get(k); });

  function report(event, extra) {
    var body = JSON.stringify({
      code: code,
      event: event,
      value: extra && extra.value,
      plan: extra && extra.plan,
      ttclid: saved.ttclid,
      ttp: cookie('_ttp'), // set by the TikTok pixel
      fbc: saved.fbc || cookie('_fbc'),
      fbp: cookie('_fbp'), // set by the Meta pixel
      url: location.href.slice(0, 1000),
      referrer: document.referrer.slice(0, 1000),
      params: params
    });
    try {
      // a string body is sent as text/plain: no CORS preflight, and it survives leaving the page
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true });
    } catch (e) { /* tracking must never break the page */ }
  }

  function waLink(message) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message + '\n\nRef: ' + code);
  }
  function track(name, data, id) {
    try { if (window.ttq) window.ttq.track(name, data, { event_id: id }); } catch (err) { /* ignore */ }
  }
  // Any tap that opens WhatsApp. Same event id as the backend's ClickButton, so TikTok counts it once.
  function tapped() {
    report('click');
    track('ClickButton', { content_type: 'product', content_id: PIXEL_ID + '_whatsapp_button' }, 'click_' + code);
    fb('track', 'Contact', { content_name: PIXEL_ID + ' WhatsApp button' }, { eventID: 'click_' + code });
  }

  // ---- the small "Message us" escape: <a data-wa="message"> ----
  var asks = document.querySelectorAll('a[data-wa]');
  for (var i = 0; i < asks.length; i++) {
    asks[i].href = waLink(asks[i].getAttribute('data-wa'));
    asks[i].addEventListener('click', tapped);
  }

  // ---- ordering: choose a plan -> Continue -> confirmation sheet -> payment method -> WhatsApp ----
  var sheet = document.getElementById('sheet');
  var send = document.getElementById('send');
  var pays = document.getElementById('pays');
  var payInputs = document.querySelectorAll('input[name="pay"]');
  var agree = document.getElementById('s-agree');
  var name = document.body.getAttribute('data-name');
  var plans = document.querySelectorAll('input[name="plan"]');
  var goButtons = document.querySelectorAll('.go'); // "Continue" in the plan card and in the bottom bar
  var order = null; // the chosen plan: { item, plan, short, value }

  function choose(radio) {
    order = {
      item: radio.getAttribute('data-item'), plan: radio.getAttribute('data-plan'),
      short: radio.getAttribute('data-short'), value: parseFloat(radio.getAttribute('data-value'))
    };
    for (var g = 0; g < goButtons.length; g++) goButtons[g].textContent = 'Continue with ' + order.short + ' · $' + order.value;
  }
  for (var r = 0; r < plans.length; r++) {
    plans[r].addEventListener('change', function () { choose(this); });
    if (plans[r].checked) choose(plans[r]); // one plan is chosen from the start
  }

  function refresh() {
    var pay = null;
    for (var k = 0; k < payInputs.length; k++) if (payInputs[k].checked) pay = payInputs[k].value;
    send.classList.toggle('off', !pay);
    if (pay) {
      send.href = waLink('Hello! I\'d like to order ' + order.item + '. I\'ll pay by ' + pay + '.');
      agree.textContent = 'We send you the ' + pay + ' payment details on WhatsApp.';
    } else {
      send.removeAttribute('href'); // not a link until the order can be sent with its ref code
      agree.textContent = 'Choose Whish or USDT to continue.';
    }
  }
  for (var p = 0; p < payInputs.length; p++) payInputs[p].addEventListener('change', refresh);

  for (var g = 0; g < goButtons.length; g++) {
    goButtons[g].addEventListener('click', function () {
      if (!order) return;
      document.getElementById('s-item').textContent = name + ' · ' + order.plan;
      document.getElementById('s-price').textContent = '$' + order.value;
      refresh();
      sheet.hidden = false;
      track('AddToCart', { content_type: 'product', content_id: PIXEL_ID, content_name: order.plan, value: order.value, currency: 'USD' }, 'cart_' + code);
      fb('track', 'AddToCart', { content_type: 'product', content_ids: [PIXEL_ID], content_name: order.plan, value: order.value, currency: 'USD' }, { eventID: 'cart_' + code });
      report('cart', { value: order.value, plan: order.plan }); // the server repeats it with the click id, same event id
    });
  }

  send.addEventListener('click', function (e) {
    if (send.classList.contains('off')) {
      // no payment method yet: the order is not sent
      e.preventDefault();
      pays.classList.remove('nudge');
      void pays.offsetWidth; // restart the animation
      pays.classList.add('nudge');
      return;
    }
    tapped();
    // the strong signal: plan, price and payment method are all confirmed
    track('InitiateCheckout', { content_type: 'product', content_id: PIXEL_ID, content_name: order.plan, value: order.value, currency: 'USD' }, 'order_' + code);
    fb('track', 'InitiateCheckout', { content_type: 'product', content_ids: [PIXEL_ID], content_name: order.plan, value: order.value, currency: 'USD' }, { eventID: 'order_' + code });
    report('order', { value: order.value, plan: order.plan });
  });

  function closeSheet() { sheet.hidden = true; }
  document.getElementById('back').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  // The bottom bar repeats the Continue button; show it only while the plan card's button is out of view
  var bar = document.getElementById('bar');
  var go = document.getElementById('go');
  if (bar && go && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('hide', entries[0].isIntersecting);
    }).observe(go);
  }

  // Every WhatsApp link carries the ref code, whichever code created the link
  function stamp(a) {
    var url;
    try { url = new URL(a.href); } catch (e) { return; }
    if (url.hostname !== 'wa.me') return;
    var text = url.searchParams.get('text') || '';
    if (text.indexOf('Ref: ' + code) < 0) a.href = waLink(text || 'Hello!');
  }
  var waLinks = document.querySelectorAll('a[href*="wa.me"]');
  for (var w = 0; w < waLinks.length; w++) stamp(waLinks[w]);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (a) stamp(a);
  }, true); // runs before the browser follows the link

  report('view');
})();
