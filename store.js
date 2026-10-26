// Data layer: Supabase when configured, localStorage otherwise (demo mode).
(function () {
  const cfg = window.SCRAPLOOP_CONFIG || {};
  const LIVE = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const db = LIVE ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const BUCKET = 'listing-photos';
  // edit_token is deliberately not readable by the public; see supabase/schema.sql.
  const PUBLIC_COLS = 'id,created_at,title,category,intent,quantity,price,price_type,city,area,description,photo_url,seller_name,seller_phone,status,sold_at,sold_via';

  const CATEGORIES = [
    { id: 'metal', label: 'Metal & rebar', icon: '🔩' },
    { id: 'wood', label: 'Wood & pallets', icon: '🪵' },
    { id: 'tiles', label: 'Tiles & stone', icon: '🧱' },
    { id: 'fixtures', label: 'Doors & windows', icon: '🚪' },
    { id: 'sanitary', label: 'Sanitary & plumbing', icon: '🚿' },
    { id: 'electrical', label: 'Electrical & cables', icon: '🔌' },
    { id: 'glass', label: 'Glass', icon: '🪟' },
    { id: 'plastic', label: 'Plastic & PVC', icon: '🧴' },
    { id: 'rubble', label: 'Concrete & rubble', icon: '⛏️' },
    { id: 'furniture', label: 'Furniture & fit-out', icon: '🪑' },
    { id: 'other', label: 'Other', icon: '📦' },
  ];

  const ls = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
    },
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ---- identity & attribution -------------------------------------------------
  let visitorId = ls.get('sl_visitor', null);
  if (!visitorId) { visitorId = uuid(); ls.set('sl_visitor', visitorId); }

  let sessionId = null;
  try { sessionId = sessionStorage.getItem('sl_session'); } catch { /* ignore */ }
  if (!sessionId) {
    sessionId = uuid();
    try { sessionStorage.setItem('sl_session', sessionId); } catch { /* ignore */ }
  }

  // ?src=whatsapp_contractors tags where a visitor came from. First touch wins.
  const urlSrc = new URLSearchParams(location.search).get('src');
  let firstSrc = ls.get('sl_src', null);
  if (!firstSrc) {
    firstSrc = urlSrc || (document.referrer ? hostOf(document.referrer) : 'direct');
    ls.set('sl_src', firstSrc);
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
  }

  const isInternal = () => ls.get('sl_internal', false) === true;
  const device = () => (window.matchMedia('(max-width: 700px)').matches ? 'mobile' : 'desktop');

  // ---- events -------------------------------------------------------------------
  async function track(name, props = {}, listingId = null) {
    const row = {
      visitor_id: visitorId,
      session_id: sessionId,
      name,
      listing_id: listingId,
      props: { ...props, src: firstSrc, device: device(), internal: isInternal() || undefined },
    };
    try {
      if (LIVE) {
        await db.from('events').insert(row);
      } else {
        const events = ls.get('sl_events', []);
        events.push({ ...row, id: events.length + 1, created_at: new Date().toISOString() });
        ls.set('sl_events', events.slice(-5000));
      }
    } catch (err) {
      console.warn('track failed', err);
    }
  }

  // ---- listings -----------------------------------------------------------------
  function sampleListings() {
    const now = Date.now();
    const h = 3600 * 1000;
    const base = { seller_name: 'Sample seller', seller_phone: '', status: 'available', photo_url: '', is_sample: true };
    return [
      { ...base, id: 's1', created_at: new Date(now - 2 * h).toISOString(), title: 'Leftover porcelain floor tiles 60×60', category: 'tiles', intent: 'reuse', quantity: '38 m²', price_type: 'fixed', price: 450, city: 'Dubai', area: 'JVC', description: 'Grey matt finish, unopened boxes left after an apartment fit-out.' },
      { ...base, id: 's2', created_at: new Date(now - 7 * h).toISOString(), title: 'Steel rebar offcuts, 12–16 mm', category: 'metal', intent: 'recycle', quantity: '~1.2 tonnes', price_type: 'offer', price: null, city: 'Sharjah', area: 'Industrial Area 6', description: 'Mixed lengths from a villa project. Buyer to collect.' },
      { ...base, id: 's3', created_at: new Date(now - 26 * h).toISOString(), title: 'Wooden pallets (good condition)', category: 'wood', intent: 'reuse', quantity: '25 pcs', price_type: 'free', price: null, city: 'Dubai', area: 'Al Quoz', description: 'Free to anyone who can pick them up this week.' },
      { ...base, id: 's4', created_at: new Date(now - 50 * h).toISOString(), title: 'Interior doors with frames', category: 'fixtures', intent: 'reuse', quantity: '6 doors', price_type: 'fixed', price: 900, city: 'Abu Dhabi', area: 'Khalifa City', description: 'Removed during a renovation. Light scratches, all hinges included.' },
      { ...base, id: 's5', created_at: new Date(now - 80 * h).toISOString(), title: 'Copper cable scrap', category: 'electrical', intent: 'recycle', quantity: '60 kg', price_type: 'offer', price: null, city: 'Ajman', area: '', description: 'Stripped and unstripped mix from an office strip-out.' },
      { ...base, id: 's6', created_at: new Date(now - 120 * h).toISOString(), title: 'Glass shower partitions', category: 'glass', intent: 'reuse', quantity: '3 panels', price_type: 'fixed', price: 300, city: 'Dubai', area: 'Dubai Marina', description: '10 mm tempered glass, 90 cm wide.' },
    ];
  }

  async function listListings() {
    if (LIVE) {
      const { data, error } = await db.from('listings').select(PUBLIC_COLS).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    }
    let listings = ls.get('sl_listings', null);
    if (!listings) { listings = sampleListings(); ls.set('sl_listings', listings); }
    return listings;
  }

  function compressImage(file, maxSize = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read photo'))), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo')); };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function createListing(fields, photoFile) {
    const id = uuid();
    const editToken = uuid();
    let photoUrl = '';

    if (photoFile) {
      const blob = await compressImage(photoFile, LIVE ? 1200 : 700, LIVE ? 0.8 : 0.6);
      if (LIVE) {
        const path = `${id}.jpg`;
        const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        photoUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      } else {
        photoUrl = await blobToDataUrl(blob);
      }
    }

    const row = { ...fields, id, photo_url: photoUrl, status: 'available', edit_token: editToken };

    if (LIVE) {
      const { error } = await db.from('listings').insert(row);
      if (error) throw error;
    } else {
      const listings = ls.get('sl_listings', []);
      const { edit_token, ...publicRow } = row;
      listings.unshift({ ...publicRow, created_at: new Date().toISOString() });
      ls.set('sl_listings', listings);
    }

    const mine = ls.get('sl_mine', []);
    mine.unshift({ id, token: editToken, title: fields.title });
    ls.set('sl_mine', mine);
    return id;
  }

  const myListings = () => ls.get('sl_mine', []);

  // via: 'platform' (buyer found it here), 'elsewhere' (sold outside), 'not_sold' (seller removed it).
  async function closeListing(id, { via, price = null, ref = '' }) {
    const mine = myListings().find((m) => m.id === id);
    if (!mine) throw new Error('You can only update listings posted from this browser');
    if (LIVE) {
      const { data, error } = await db.rpc('close_listing', { p_id: id, p_token: mine.token, p_via: via, p_price: price, p_ref: ref || null });
      if (error) throw error;
      if (!data) throw new Error('Listing not found or already closed');
    } else {
      const listings = ls.get('sl_listings', []);
      const l = listings.find((x) => x.id === id);
      if (l) {
        l.status = via === 'not_sold' ? 'removed' : 'sold';
        l.sold_at = new Date().toISOString();
        l.sold_via = via;
      }
      ls.set('sl_listings', listings);
    }
  }

  // ---- buyer contacts & follow-ups -------------------------------------------------
  // Every contact gets a short reference code that travels inside the WhatsApp message, so a
  // seller can tell us which ScrapLoop buyer a deal came from.
  function newRef() {
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let s = '';
    for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `SL-${s}`;
  }

  function recordContact(listing, ref, channel) {
    const contacts = ls.get('sl_contacts', []);
    if (contacts.some((c) => c.listing_id === listing.id && !c.answered)) return;
    contacts.push({ listing_id: listing.id, title: listing.title, ref, channel, at: new Date().toISOString(), answered: false, snoozed_until: null });
    ls.set('sl_contacts', contacts.slice(-50));
  }

  function pendingFollowup(afterHours) {
    const now = Date.now();
    return ls.get('sl_contacts', []).find((c) =>
      !c.answered &&
      now - new Date(c.at).getTime() >= afterHours * 3600 * 1000 &&
      (!c.snoozed_until || now >= new Date(c.snoozed_until).getTime())) || null;
  }

  function updateContact(ref, patch) {
    const contacts = ls.get('sl_contacts', []);
    const c = contacts.find((x) => x.ref === ref);
    if (c) Object.assign(c, patch);
    ls.set('sl_contacts', contacts);
  }

  // ---- feedback -----------------------------------------------------------------
  async function sendFeedback(message, role) {
    const row = { visitor_id: visitorId, message, role, src: firstSrc };
    if (LIVE) {
      const { error } = await db.from('feedback').insert(row);
      if (error) throw error;
    } else {
      const fb = ls.get('sl_feedback', []);
      fb.unshift({ ...row, created_at: new Date().toISOString() });
      ls.set('sl_feedback', fb);
    }
  }

  // ---- stats reads ----------------------------------------------------------------
  async function fetchAll(table, cols, sinceIso) {
    if (!LIVE) {
      const key = { events: 'sl_events', feedback: 'sl_feedback', listings: 'sl_listings' }[table];
      const rows = ls.get(key, []);
      return sinceIso ? rows.filter((r) => r.created_at >= sinceIso) : rows;
    }
    const pageSize = 1000;
    let rows = [];
    for (let from = 0; from < 50000; from += pageSize) {
      let q = db.from(table).select(cols).order('created_at', { ascending: true }).range(from, from + pageSize - 1);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      rows = rows.concat(data);
      if (data.length < pageSize) break;
    }
    return rows;
  }

  // ---- helpers --------------------------------------------------------------------
  function toWhatsAppNumber(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = (cfg.COUNTRY_CODE || '') + digits.slice(1);
    else if (digits.length <= 9) digits = (cfg.COUNTRY_CODE || '') + digits;
    return digits;
  }

  window.ScrapStore = {
    LIVE,
    CATEGORIES,
    visitorId,
    source: firstSrc,
    track,
    listListings,
    createListing,
    myListings,
    closeListing,
    newRef,
    recordContact,
    pendingFollowup,
    answerFollowup: (ref) => updateContact(ref, { answered: true }),
    snoozeFollowup: (ref, hours) => updateContact(ref, { snoozed_until: new Date(Date.now() + hours * 3600 * 1000).toISOString() }),
    sendFeedback,
    fetchEvents: (since) => fetchAll('events', 'created_at,visitor_id,session_id,name,listing_id,props', since),
    fetchFeedback: (since) => fetchAll('feedback', 'created_at,message,role,src', since),
    fetchListings: () => fetchAll('listings', PUBLIC_COLS, null),
    isInternal,
    setInternal: (v) => ls.set('sl_internal', Boolean(v)),
    resetDemo: () => ['sl_listings', 'sl_events', 'sl_feedback', 'sl_mine', 'sl_contacts'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } }),
    toWhatsAppNumber,
  };
})();
