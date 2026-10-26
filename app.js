(function () {
  const cfg = window.SCRAPLOOP_CONFIG || {};
  const S = window.ScrapStore;
  const $ = (sel) => document.querySelector(sel);
  const catById = Object.fromEntries(S.CATEGORIES.map((c) => [c.id, c]));

  const state = {
    listings: [],
    filters: { q: '', city: '', intent: 'all', category: '' },
  };

  // ---- helpers ------------------------------------------------------------------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function timeAgo(iso) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins || 1} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  function priceLabel(l) {
    if (l.price_type === 'free') return 'Free';
    if (l.price_type === 'offer' || l.price == null) return 'Make an offer';
    return `${cfg.CURRENCY} ${Number(l.price).toLocaleString()}`;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function listingUrl(id, src) {
    const u = new URL(location.href);
    u.search = src ? `?src=${encodeURIComponent(src)}` : '';
    u.hash = `l=${id}`;
    return u.toString();
  }

  async function share(l, src) {
    const url = listingUrl(l.id, src);
    S.track('share_click', { via: src }, l.id);
    const text = `${l.title}: ${priceLabel(l)} in ${l.city}`;
    try {
      if (navigator.share) { await navigator.share({ title: l.title, text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast('Link copied. Paste it in your WhatsApp groups');
    } catch { /* user cancelled */ }
  }

  function openDialog(d) { if (!d.open) d.showModal(); }

  // Close on ✕ or on backdrop click.
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });

  // ---- browse -------------------------------------------------------------------
  function filtered() {
    const { q, city, intent, category } = state.filters;
    const needle = q.trim().toLowerCase();
    return state.listings.filter((l) => {
      if (l.status !== 'available') return false;
      if (city && l.city !== city) return false;
      if (category && l.category !== category) return false;
      if (intent === 'free' && l.price_type !== 'free') return false;
      if ((intent === 'reuse' || intent === 'recycle') && l.intent !== intent) return false;
      if (needle) {
        const hay = `${l.title} ${l.description} ${l.area} ${catById[l.category]?.label || ''}`.toLowerCase();
        if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }

  function cardHtml(l) {
    const cat = catById[l.category] || catById.other;
    const media = l.photo_url
      ? `<img src="${esc(l.photo_url)}" alt="" loading="lazy">`
      : `<span class="ph" aria-hidden="true">${cat.icon}</span>`;
    return `
      <button class="card" type="button" data-id="${esc(l.id)}">
        <div class="card-media">${media}
          <span class="badge ${l.intent}">${l.intent === 'recycle' ? 'Recycle' : 'Reuse'}</span>
          ${l.is_sample ? '<span class="badge sample">Sample</span>' : ''}
        </div>
        <div class="card-body">
          <div class="price ${l.price_type === 'free' ? 'free' : ''}">${esc(priceLabel(l))}</div>
          <div class="title">${esc(l.title)}</div>
          <div class="meta">${l.quantity ? `${esc(l.quantity)} · ` : ''}${esc(cat.label)}</div>
          <div class="meta muted">${esc(l.city)}${l.area ? `, ${esc(l.area)}` : ''} · ${timeAgo(l.created_at)}</div>
        </div>
      </button>`;
  }

  function renderGrid() {
    const items = filtered();
    $('#resultCount').textContent = `${items.length} listing${items.length === 1 ? '' : 's'} available`;
    $('#grid').innerHTML = items.length
      ? items.map(cardHtml).join('')
      : `<div class="empty">
          <p><strong>Nothing here yet.</strong></p>
          <p>Have leftovers like this? Be the first to list them.</p>
          <button class="btn primary" data-action="post" type="button">List materials</button>
         </div>`;
  }

  function renderChips() {
    const chips = [{ id: '', label: 'All', icon: '' }, ...S.CATEGORIES];
    $('#categoryChips').innerHTML = chips
      .map((c) => `<button type="button" class="chip ${state.filters.category === c.id ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.label)}</button>`)
      .join('');
  }

  // Searches are tracked (debounced) so we learn what people want, including what we don't have.
  let searchTimer;
  $('#q').addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    renderGrid();
    clearTimeout(searchTimer);
    const q = e.target.value.trim().toLowerCase();
    if (q.length >= 2) searchTimer = setTimeout(() => S.track('search', { q, results: filtered().length }), 1200);
  });

  $('#cityFilter').addEventListener('change', (e) => {
    state.filters.city = e.target.value;
    S.track('filter', { city: e.target.value || 'all' });
    renderGrid();
  });

  $('#intentFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-intent]');
    if (!b) return;
    state.filters.intent = b.dataset.intent;
    document.querySelectorAll('#intentFilter button').forEach((x) => x.classList.toggle('on', x === b));
    S.track('filter', { intent: b.dataset.intent });
    renderGrid();
  });

  $('#categoryChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filters.category = b.dataset.cat;
    S.track('filter', { category: b.dataset.cat || 'all' });
    renderChips();
    renderGrid();
  });

  $('#grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });

  $('#browseCta').addEventListener('click', () => S.track('cta_browse'));

  // ---- detail -------------------------------------------------------------------
  function openDetail(id) {
    const l = state.listings.find((x) => x.id === id);
    if (!l) { toast('That listing is no longer available'); return; }
    const cat = catById[l.category] || catById.other;
    const wa = S.toWhatsAppNumber(l.seller_phone);
    const ref = S.newRef();
    const msg = `Hi ${l.seller_name}, I saw your listing "${l.title}" on ${cfg.APP_NAME}. Is it still available? (Ref ${ref})`;
    const sold = l.status !== 'available';

    let contact;
    if (l.is_sample) {
      contact = `<p class="note">This is a sample listing for the demo, so there's no real seller to contact.</p>`;
    } else if (sold) {
      contact = `<p class="note">This item has been marked as sold.</p>`;
    } else {
      contact = `
        <a class="btn whatsapp lg block" id="waBtn" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}">Message on WhatsApp</a>
        <a class="btn block" id="callBtn" href="tel:+${wa}">Call ${esc(l.seller_name)}</a>`;
    }

    $('#detailBody').innerHTML = `
      <div class="sheet-head">
        <span class="badge inline ${l.intent}">${l.intent === 'recycle' ? 'For recycling' : 'Usable as is'}</span>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="detail-media">${l.photo_url ? `<img src="${esc(l.photo_url)}" alt="">` : `<span class="ph big" aria-hidden="true">${cat.icon}</span>`}</div>
      <h2>${esc(l.title)}</h2>
      <div class="price big ${l.price_type === 'free' ? 'free' : ''}">${esc(priceLabel(l))}</div>
      <dl class="facts">
        ${l.quantity ? `<div><dt>Quantity</dt><dd>${esc(l.quantity)}</dd></div>` : ''}
        <div><dt>Category</dt><dd>${cat.icon} ${esc(cat.label)}</dd></div>
        <div><dt>Location</dt><dd>${esc(l.city)}${l.area ? `, ${esc(l.area)}` : ''}</dd></div>
        <div><dt>Posted</dt><dd>${timeAgo(l.created_at)} by ${esc(l.seller_name)}</dd></div>
      </dl>
      ${l.description ? `<p class="desc">${esc(l.description)}</p>` : ''}
      <div class="contact">${contact}</div>
      <button class="linklike" id="shareBtn" type="button">Share this listing</button>
      <p class="fineprint">Inspect materials before paying. Never send money in advance.</p>`;

    const onContact = (channel) => () => {
      S.recordContact(l, ref, channel);
      S.track(`contact_${channel}`, { category: l.category, city: l.city, ref }, l.id);
    };
    $('#waBtn')?.addEventListener('click', onContact('whatsapp'));
    $('#callBtn')?.addEventListener('click', onContact('call'));
    $('#shareBtn').addEventListener('click', () => share(l, 'share'));

    S.track('listing_view', { category: l.category, city: l.city, sample: l.is_sample || undefined }, l.is_sample ? null : l.id);
    history.replaceState(null, '', `#l=${l.id}`);
    openDialog($('#detailDialog'));
  }

  $('#detailDialog').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

  // ---- post ---------------------------------------------------------------------
  const form = $('#postForm');

  function openPost(origin) {
    S.track('post_opened', { origin });
    $('#postError').textContent = '';
    openDialog($('#postDialog'));
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action="post"]');
    if (!b) return;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    openPost(b.closest('.hero') ? 'hero' : b.closest('.empty') ? 'empty_state' : 'nav');
  });

  $('#photoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const img = $('#photoPreview');
    if (!file) { img.hidden = true; $('#photoHint').hidden = false; return; }
    img.src = URL.createObjectURL(file);
    img.hidden = false;
    $('#photoHint').hidden = true;
  });

  function syncPriceField() {
    $('#priceField').hidden = form.price_type.value !== 'fixed';
  }
  form.querySelectorAll('input[name="price_type"]').forEach((r) => r.addEventListener('change', syncPriceField));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const v = (k) => String(fd.get(k) || '').trim();
    const err = $('#postError');

    const fields = {
      title: v('title'),
      category: v('category'),
      intent: v('intent'),
      quantity: v('quantity'),
      price_type: v('price_type'),
      price: v('price_type') === 'fixed' && v('price') !== '' ? Number(v('price')) : null,
      city: v('city'),
      area: v('area'),
      description: v('description'),
      seller_name: v('seller_name'),
      seller_phone: v('seller_phone'),
    };

    const missing = [];
    if (fields.title.length < 3) missing.push('what it is');
    if (!fields.category) missing.push('category');
    if (!fields.city) missing.push('city');
    if (!fields.seller_name) missing.push('your name');
    if (S.toWhatsAppNumber(fields.seller_phone).length < 8) missing.push('a valid WhatsApp number');
    if (fields.price_type === 'fixed' && fields.price == null) missing.push('price (or choose "Make an offer")');
    if (missing.length) {
      err.textContent = `Please add ${missing.join(', ')}.`;
      S.track('post_validation_error', { missing: missing.join('|') });
      return;
    }

    const btn = $('#postSubmit');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const photo = $('#photoInput').files[0] || null;
      const id = await S.createListing(fields, photo);
      S.track('post_submitted', { category: fields.category, city: fields.city, has_photo: Boolean(photo), price_type: fields.price_type }, id);
      form.reset();
      $('#photoPreview').hidden = true;
      $('#photoHint').hidden = false;
      syncPriceField();
      $('#postDialog').close();
      await loadListings();
      openDetail(id);
      toast('Published! Share it so buyers see it');
    } catch (ex) {
      console.error(ex);
      err.textContent = `Couldn't publish: ${ex.message || ex}. Please try again.`;
      S.track('post_failed', { message: String(ex.message || ex).slice(0, 200) });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publish listing';
    }
  });

  // ---- my listings ------------------------------------------------------------------
  function renderMine() {
    const mine = S.myListings();
    const body = $('#mineBody');
    if (!mine.length) {
      body.innerHTML = `<div class="empty"><p>You haven't listed anything from this browser yet.</p><button class="btn primary" data-action="post" type="button">List materials</button></div>`;
      return;
    }
    body.innerHTML = mine.map((m) => {
      const l = state.listings.find((x) => x.id === m.id);
      const closed = l && l.status !== 'available';
      const status = !l ? 'Not found' : closed ? (l.status === 'removed' ? 'Removed' : 'Sold') : `Live · ${timeAgo(l.created_at)}`;
      return `<div class="mine-row">
        <div><strong>${esc(m.title)}</strong><div class="meta muted">${status}</div></div>
        <div class="mine-actions">
          ${l && !closed ? `<button class="btn sm" data-share="${esc(m.id)}" type="button">Share</button>
          <button class="btn sm" data-sold="${esc(m.id)}" type="button">Sold / close</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  $('#mineBtn').addEventListener('click', () => { renderMine(); openDialog($('#mineDialog')); });

  $('#mineBody').addEventListener('click', async (e) => {
    const shareId = e.target.closest('[data-share]')?.dataset.share;
    const soldId = e.target.closest('[data-sold]')?.dataset.sold;
    if (shareId) share(state.listings.find((x) => x.id === shareId), 'seller_share');
    if (soldId) openClose(soldId);
  });

  // ---- closing a listing (seller-reported deal outcome) ------------------------------
  const closeForm = $('#closeForm');
  let closingId = null;

  function syncCloseFields() {
    const via = closeForm.via.value;
    $('#closeRefField').hidden = via !== 'platform';
    $('#closePriceField').hidden = via === 'not_sold';
  }
  closeForm.querySelectorAll('input[name="via"]').forEach((r) => r.addEventListener('change', syncCloseFields));

  function openClose(id) {
    const l = state.listings.find((x) => x.id === id);
    if (!l) return;
    closingId = id;
    closeForm.reset();
    syncCloseFields();
    $('#closeTitle').textContent = l.title;
    $('#closeError').textContent = '';
    S.track('close_opened', {}, id);
    $('#mineDialog').close();
    openDialog($('#closeDialog'));
  }

  closeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const l = state.listings.find((x) => x.id === closingId);
    const via = closeForm.via.value;
    const rawPrice = closeForm.price.value.trim();
    const price = via !== 'not_sold' && rawPrice !== '' ? Number(rawPrice) : null;
    const rawRef = closeForm.ref.value.trim().toUpperCase().replace(/\s+/g, '');
    const ref = via === 'platform' && rawRef ? (rawRef.startsWith('SL-') ? rawRef : `SL-${rawRef.replace(/^SL/, '')}`) : '';

    const btn = $('#closeSubmit');
    btn.disabled = true;
    try {
      await S.closeListing(closingId, { via, price, ref });
      S.track('deal_reported', { via, price, ref: ref || undefined, category: l?.category, city: l?.city }, closingId);
      $('#closeDialog').close();
      await loadListings();
      toast(via === 'not_sold' ? 'Listing removed' : via === 'platform' ? 'Brilliant, thanks for telling us!' : 'Thanks, noted');
    } catch (ex) {
      $('#closeError').textContent = ex.message || 'Could not update listing';
    } finally {
      btn.disabled = false;
    }
  });

  // ---- buyer follow-up ----------------------------------------------------------------
  let followup = null;

  function maybeAskFollowup() {
    followup = S.pendingFollowup(cfg.FOLLOWUP_AFTER_HOURS ?? 24);
    if (!followup || document.querySelector('dialog[open]')) return;
    $('#followupTitle').textContent = `"${followup.title}"`;
    $('#followupAnswers').hidden = false;
    $('#followupReasons').hidden = true;
    S.track('followup_shown', { ref: followup.ref }, followup.listing_id);
    openDialog($('#followupDialog'));
  }

  function answerFollowup(answer, reason) {
    S.track('buyer_followup', { answer, reason, ref: followup.ref, channel: followup.channel }, followup.listing_id);
    // "Still talking" asks again in two days; anything else is final.
    if (answer === 'talking') S.snoozeFollowup(followup.ref, 48);
    else S.answerFollowup(followup.ref);
    $('#followupDialog').close();
    toast('Thanks, that helps us improve');
  }

  $('#followupAnswers').addEventListener('click', (e) => {
    const answer = e.target.closest('[data-answer]')?.dataset.answer;
    if (!answer) return;
    if (answer === 'no') {
      $('#followupAnswers').hidden = true;
      $('#followupReasons').hidden = false;
      return;
    }
    answerFollowup(answer);
  });

  $('#followupReasons').addEventListener('click', (e) => {
    const reason = e.target.closest('[data-reason]')?.dataset.reason;
    if (reason) answerFollowup('no', reason);
  });

  $('#followupLater').addEventListener('click', () => {
    S.snoozeFollowup(followup.ref, 24);
    S.track('followup_dismissed', { ref: followup.ref }, followup.listing_id);
    $('#followupDialog').close();
  });

  // ---- feedback -------------------------------------------------------------------
  $('#feedbackBtn').addEventListener('click', () => { S.track('feedback_opened'); openDialog($('#feedbackDialog')); });
  $('#feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const message = String(fd.get('message') || '').trim();
    if (!message) return;
    try {
      await S.sendFeedback(message, fd.get('role'));
      S.track('feedback_sent', { role: fd.get('role') });
      e.target.reset();
      $('#feedbackDialog').close();
      toast('Thank you, this really helps');
    } catch (ex) {
      toast(`Couldn't send: ${ex.message || ex}`);
    }
  });

  // ---- boot -----------------------------------------------------------------------
  async function loadListings() {
    try {
      state.listings = await S.listListings();
    } catch (ex) {
      console.error(ex);
      $('#grid').innerHTML = `<div class="empty"><p>Couldn't load listings. Check your connection and refresh.</p></div>`;
      S.track('load_failed', { message: String(ex.message || ex).slice(0, 200) });
      return;
    }
    renderGrid();
  }

  function initStatic() {
    document.querySelectorAll('[data-app-name]').forEach((n) => { n.textContent = cfg.APP_NAME; });
    document.querySelectorAll('[data-currency]').forEach((n) => { n.textContent = cfg.CURRENCY; });
    const cityOpts = cfg.CITIES.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#cityFilter').insertAdjacentHTML('beforeend', cityOpts);
    $('#citySelect').innerHTML = `<option value="">Choose…</option>${cityOpts}`;
    $('#categorySelect').insertAdjacentHTML('beforeend', S.CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join(''));
    syncPriceField();
    renderChips();
    if (!S.LIVE) {
      $('#demoBanner').hidden = false;
      $('#resetDemo').addEventListener('click', () => { S.resetDemo(); location.reload(); });
    }
  }

  initStatic();
  S.track('page_view', { referrer: document.referrer ? new URL(document.referrer).hostname : '', live: S.LIVE });
  loadListings().then(() => {
    const m = location.hash.match(/^#l=(.+)$/);
    if (m) openDetail(decodeURIComponent(m[1]));
    else setTimeout(maybeAskFollowup, 1500);
  });
})();
