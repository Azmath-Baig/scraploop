(function () {
  const cfg = window.SCRAPLOOP_CONFIG || {};
  const S = window.ScrapStore;
  const $ = (sel) => document.querySelector(sel);
  let lastEvents = [];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const uniq = (events, pred) => new Set(events.filter(pred).map((e) => e.visitor_id)).size;
  const isContact = (e) => e.name === 'contact_whatsapp' || e.name === 'contact_call';

  function table(headers, rows) {
    if (!rows.length) return '<p class="muted">No data yet.</p>';
    const th = headers.map((h, i) => `<th class="${i ? 'n' : ''}">${esc(h)}</th>`).join('');
    const tr = rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
    return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  }

  function funnel(steps) {
    const top = steps[0].value || 0;
    return steps.map((s, i) => {
      const prev = i ? steps[i - 1].value : null;
      const width = top ? Math.max(1, (s.value / top) * 100) : 0;
      return `<div class="funnel-row">
        <div>${esc(s.label)}</div>
        <div class="bar-track"><div class="bar" style="width:${width}%"></div></div>
        <div class="num"><strong>${s.value}</strong>${i ? `<small>${pct(s.value, prev)} of previous</small>` : ''}</div>
      </div>`;
    }).join('');
  }

  function groupCount(items, keyFn) {
    const m = new Map();
    items.forEach((x) => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderDaily(events, days) {
    const n = days || Math.min(60, Math.max(7, Math.ceil((Date.now() - new Date(events[0]?.created_at || Date.now())) / 864e5) + 1));
    const buckets = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      buckets.push({ key: d.toISOString().slice(0, 10), label: `${d.getDate()}/${d.getMonth() + 1}`, visitors: new Set() });
    }
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
    events.filter((e) => e.name === 'page_view').forEach((e) => byKey[e.created_at.slice(0, 10)]?.visitors.add(e.visitor_id));
    const max = Math.max(1, ...buckets.map((b) => b.visitors.size));
    const every = Math.ceil(buckets.length / 10);
    $('#daily').innerHTML = buckets.map((b, i) => `
      <div class="col" title="${b.key}: ${b.visitors.size} visitors">
        <div class="bar" style="height:${(b.visitors.size / max) * 100}%"></div>
        <span>${i % every === 0 ? b.label : '&nbsp;'}</span>
      </div>`).join('');
  }

  const REASONS = {
    no_reply: "Seller didn't reply",
    already_sold: 'Already sold',
    price: 'Too expensive',
    transport: 'Transport / too far',
    quality: 'Not as described',
    changed_mind: 'Changed my mind',
  };

  function renderDeals(events, listings, since) {
    const contactEvents = events.filter(isContact);
    const contactRefs = new Set(contactEvents.filter((e) => e.props?.ref).map((e) => `${e.listing_id}|${e.props.ref}`));
    const contacted = new Set(contactEvents.map((e) => e.listing_id).filter(Boolean));

    const closed = listings.filter((l) => l.sold_via && (!since || l.sold_at >= since));
    const by = (v) => closed.filter((l) => l.sold_via === v).length;
    const platform = by('platform');
    const elsewhere = by('elsewhere');
    const notSold = by('not_sold');

    const reports = events.filter((e) => e.name === 'deal_reported');
    const platformReports = reports.filter((e) => e.props?.via === 'platform');
    const value = platformReports.reduce((sum, e) => sum + (Number(e.props?.price) || 0), 0);
    const refMatched = platformReports.filter((e) => e.props?.ref && contactRefs.has(`${e.listing_id}|${e.props.ref}`)).length;

    const closedIds = new Set(listings.filter((l) => l.status !== 'available').map((l) => l.id));
    const contactedOpen = [...contacted].filter((id) => !closedIds.has(id)).length;

    $('#dealKpis').innerHTML = [
      ['Listings contacted', contacted.size],
      ['Deals via ScrapLoop', platform],
      ['Platform share of sales', pct(platform, platform + elsewhere)],
      ['Contacted → deal', pct(platform, contacted.size)],
      [`Reported deal value (${cfg.CURRENCY})`, value.toLocaleString()],
      ['Deals matched to a Ref code', `${refMatched} / ${platform}`],
      ['Contacted, outcome unknown', contactedOpen],
    ].map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

    $('#dealOutcomes').innerHTML = closed.length
      ? table(['Outcome', 'Listings', 'Share'], [
        ['Sold via ScrapLoop buyer', platform, pct(platform, closed.length)],
        ['Sold elsewhere (leakage to other channels)', elsewhere, pct(elsewhere, closed.length)],
        ['Removed, not sold', notSold, pct(notSold, closed.length)],
      ])
      : '<p class="muted">No listings closed yet.</p>';

    // Latest answer per contact ref wins ("still talking" can later become yes/no).
    const latest = new Map();
    events.filter((e) => e.name === 'buyer_followup').forEach((e) => latest.set(e.props?.ref || e.visitor_id, e));
    const answers = [...latest.values()];
    const count = (a) => answers.filter((e) => e.props?.answer === a).length;
    const reasonRows = groupCount(answers.filter((e) => e.props?.answer === 'no'), (e) => REASONS[e.props?.reason] || 'No reason given')
      .map(([r, n]) => [`   ↳ ${r}`, n]);
    $('#buyerAnswers').innerHTML = answers.length
      ? table(['Answer', 'Buyers'], [['✅ Got it', count('yes')], ['💬 Still talking', count('talking')], ['❌ No', count('no')], ...reasonRows])
      : '<p class="muted">No follow-up answers yet. Buyers are asked when they return after contacting a seller.</p>';
  }

  function renderCheckins(events, listings) {
    const daysOld = cfg.SELLER_CHECKIN_AFTER_DAYS ?? 3;
    $('#checkinSub').textContent = `Open listings older than ${daysOld} days. Message the seller to find out what happened. At this stage, asking people directly is your most accurate data.`;
    const cutoff = Date.now() - daysOld * 864e5;
    const statsFor = (id) => ({
      views: events.filter((e) => e.name === 'listing_view' && e.listing_id === id).length,
      contacts: events.filter((e) => isContact(e) && e.listing_id === id).length,
    });
    const rows = listings
      .filter((l) => l.status === 'available' && new Date(l.created_at).getTime() < cutoff)
      .map((l) => ({ l, ...statsFor(l.id) }))
      .sort((a, b) => b.contacts - a.contacts);
    if (!rows.length) { $('#checkins').innerHTML = '<p class="muted">Nobody to check in with yet.</p>'; return; }

    $('#checkins').innerHTML = `<table><thead><tr><th>Listing</th><th>Seller</th><th class="n">Age</th><th class="n">Views</th><th class="n">Contacts</th><th></th></tr></thead><tbody>${rows.map(({ l, views, contacts }) => {
      const msg = `Hi ${l.seller_name}, it's the ${cfg.APP_NAME} team. Did your "${l.title}" find a taker? If yes, was it someone who found it on ${cfg.APP_NAME}? Any feedback helps us a lot.`;
      const age = Math.floor((Date.now() - new Date(l.created_at)) / 864e5);
      return `<tr>
        <td>${esc(l.title)}</td><td>${esc(l.seller_name)}</td>
        <td class="n">${age}d</td><td class="n">${views}</td><td class="n">${contacts}</td>
        <td class="n"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${S.toWhatsAppNumber(l.seller_phone)}?text=${encodeURIComponent(msg)}">Message</a></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  async function render() {
    const days = Number($('#range').value);
    const since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
    $('#updated').textContent = 'Loading…';

    let events, listings, feedback;
    try {
      [events, listings, feedback] = await Promise.all([S.fetchEvents(since), S.fetchListings(), S.fetchFeedback(since)]);
    } catch (ex) {
      $('#updated').textContent = `Couldn't load stats: ${ex.message || ex}`;
      return;
    }

    if ($('#hideInternal').checked) events = events.filter((e) => !(e.props && e.props.internal));
    lastEvents = events;
    const realListings = listings.filter((l) => !l.is_sample);
    const posted = realListings.filter((l) => !since || l.created_at >= since);
    const sold = realListings.filter((l) => l.status === 'sold' && (!since || l.sold_at >= since));

    const visitors = uniq(events, (e) => e.name === 'page_view');
    const viewers = uniq(events, (e) => e.name === 'listing_view');
    const contacters = uniq(events, isContact);
    const openers = uniq(events, (e) => e.name === 'post_opened');
    const posters = uniq(events, (e) => e.name === 'post_submitted');
    const contacts = events.filter(isContact).length;
    const sessions = new Set(events.map((e) => e.session_id)).size;

    $('#kpis').innerHTML = [
      ['Unique visitors', visitors],
      ['Sessions', sessions],
      ['Listings posted', posted.length],
      ['Live listings', realListings.filter((l) => l.status === 'available').length],
      ['Contact clicks', contacts],
      ['Marked sold', sold.length],
    ].map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

    $('#buyerFunnel').innerHTML = funnel([
      { label: 'Visited', value: visitors },
      { label: 'Opened a listing', value: viewers },
      { label: 'Contacted a seller', value: contacters },
    ]);
    $('#sellerFunnel').innerHTML = funnel([
      { label: 'Visited', value: visitors },
      { label: 'Opened post form', value: openers },
      { label: 'Published listing', value: posters },
    ]);

    renderDeals(events, realListings, since);
    renderCheckins(events, realListings);
    renderDaily(events, days);

    // Sources: attribute every visitor to their first-touch source.
    const srcOf = new Map();
    events.forEach((e) => { if (!srcOf.has(e.visitor_id)) srcOf.set(e.visitor_id, (e.props && e.props.src) || 'unknown'); });
    const bySrc = new Map();
    events.forEach((e) => {
      const s = srcOf.get(e.visitor_id);
      if (!bySrc.has(s)) bySrc.set(s, { v: new Set(), view: new Set(), contact: new Set(), post: new Set() });
      const b = bySrc.get(s);
      if (e.name === 'page_view') b.v.add(e.visitor_id);
      if (e.name === 'listing_view') b.view.add(e.visitor_id);
      if (isContact(e)) b.contact.add(e.visitor_id);
      if (e.name === 'post_submitted') b.post.add(e.visitor_id);
    });
    $('#sources').innerHTML = table(
      ['Source', 'Visitors', 'Viewed listing', 'Contacted', 'Posted', 'Contact rate'],
      [...bySrc.entries()].sort((a, b) => b[1].v.size - a[1].v.size)
        .map(([s, b]) => [s, b.v.size, b.view.size, b.contact.size, b.post.size, pct(b.contact.size, b.v.size)]),
    );

    // Categories: supply (listings) vs demand (views, contacts).
    const catRows = S.CATEGORIES.map((c) => {
      const views = events.filter((e) => e.name === 'listing_view' && e.props?.category === c.id).length;
      const cts = events.filter((e) => isContact(e) && e.props?.category === c.id).length;
      return [`${c.icon} ${c.label}`, posted.filter((l) => l.category === c.id).length, views, cts];
    }).filter((r) => r[1] || r[2] || r[3]).sort((a, b) => b[3] - a[3] || b[2] - a[2]);
    $('#categories').innerHTML = table(['Category', 'Posted', 'Views', 'Contacts'], catRows);

    // Searches
    const searches = events.filter((e) => e.name === 'search' && e.props?.q);
    const sMap = new Map();
    searches.forEach((e) => {
      const r = sMap.get(e.props.q) || { n: 0, zero: 0 };
      r.n += 1;
      if (!e.props.results) r.zero += 1;
      sMap.set(e.props.q, r);
    });
    $('#searches').innerHTML = table(
      ['Query', 'Searches', '0 results'],
      [...sMap.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([q, r]) => [q, r.n, r.zero]),
    );

    // Problems: validation errors and failures.
    const problems = [
      ...groupCount(events.filter((e) => e.name === 'post_validation_error'), (e) => `Form: missing ${e.props?.missing || '?'}`),
      ...groupCount(events.filter((e) => e.name === 'post_failed' || e.name === 'load_failed'), (e) => `${e.name}: ${e.props?.message || '?'}`),
    ];
    $('#problems').innerHTML = table(['Issue', 'Count'], problems);

    $('#feedback').innerHTML = feedback.length
      ? feedback.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((f) => `
        <div class="fb-item">
          <div class="meta muted">${esc(new Date(f.created_at).toLocaleString())} · ${esc(f.role || '')} · ${esc(f.src || '')}</div>
          <div>${esc(f.message)}</div>
        </div>`).join('')
      : '<p class="muted">No feedback yet.</p>';

    $('#updated').textContent = `${events.length} events · updated ${new Date().toLocaleTimeString()}`;
  }

  function exportCsv() {
    const cols = ['created_at', 'name', 'visitor_id', 'session_id', 'listing_id', 'src', 'device', 'props'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(lastEvents.map((e) => [
      e.created_at, e.name, e.visitor_id, e.session_id, e.listing_id, e.props?.src, e.props?.device, JSON.stringify(e.props || {}),
    ].map(q).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scraploop-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function syncInternalBtn() {
    $('#markInternal').textContent = S.isInternal() ? 'This browser: team ✓' : 'Mark this browser as team';
  }

  document.querySelectorAll('[data-app-name]').forEach((n) => { n.textContent = cfg.APP_NAME; });
  if (!S.LIVE) $('#demoBanner').hidden = false;
  syncInternalBtn();
  $('#markInternal').addEventListener('click', () => { S.setInternal(!S.isInternal()); syncInternalBtn(); });
  $('#range').addEventListener('change', render);
  $('#hideInternal').addEventListener('change', render);
  $('#exportCsv').addEventListener('click', exportCsv);
  render();
})();
