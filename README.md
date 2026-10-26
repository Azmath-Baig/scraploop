# ScrapLoop

A marketplace where people list leftover construction and renovation materials (steel, tiles, wood,
doors, fixtures, cables) and buyers, recyclers and DIYers contact them directly on WhatsApp.

- `index.html`: the marketplace (browse, post, contact, mark sold, feedback)
- `stats.html`: funnels, sources, searches, problems and feedback, so you can see whether anyone uses it
- `supabase/schema.sql`: database, security rules and photo storage

## 1. Run it locally (demo mode)

```
npx serve .
```
or `python -m http.server 8000`, then open http://localhost:8000.

With no Supabase keys in `config.js` it runs in **demo mode**: sample listings, and data stored only in your browser.

## 2. Go live with real data (free, ~10 minutes)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Go to **Project Settings → API** and copy the *Project URL* and the *anon public* key into `config.js`.
4. Set `CURRENCY`, `COUNTRY_CODE` and `CITIES` in `config.js` for the market you're testing in.

## 3. Deploy and get a public link (free)

The easiest option is **Netlify Drop**: go to https://app.netlify.com/drop and drag this whole folder onto the page.
You get a URL straight away. Alternatives are Vercel, Cloudflare Pages or GitHub Pages; there's no build step.

## 4. Track where users come from

Add `?src=` to every link you share, so the stats page can tell channels apart:

```
https://your-site.netlify.app/?src=wa_contractors_group
https://your-site.netlify.app/?src=fb_marketplace
https://your-site.netlify.app/?src=scrapdealer_ahmed
```

Open `stats.html` on your own phone and laptop and click **Mark this browser as team**, so your own clicks
don't count toward the numbers.

## What gets measured

| Event | Meaning |
|---|---|
| `page_view` | Someone opened the site |
| `listing_view` | Opened a listing |
| `contact_whatsapp` / `contact_call` | Clicked to contact a seller (the main buyer success metric) |
| `post_opened` → `post_submitted` | Seller funnel |
| `post_validation_error` | Which form fields people get stuck on |
| `search` (with `results`) | What people look for, including searches with 0 results (unmet demand) |
| `deal_reported` | Seller closed a listing: sold via ScrapLoop, sold elsewhere, or not sold (+ optional price and Ref code) |
| `buyer_followup` | Returning buyer answered "Did you get it?" (yes / still talking / no + reason) |
| `share_click`, `filter`, `feedback_sent` | Engagement |

## How deals are tracked when people move to WhatsApp

A WhatsApp click only means someone *tried* to contact a seller. To find out what happened next, there are three signals:

1. **Ref code.** Every WhatsApp message includes a code like `Ref SL-4821`, unique to that buyer and listing.
   When the seller closes the listing and picks "sold to someone from ScrapLoop", they can paste the code. The stats page
   shows how many reported deals match a real contact.
2. **Seller outcome.** Closing a listing asks whether the item went to a ScrapLoop buyer, someone found elsewhere, or
   wasn't sold. *Platform share of sales* = via ScrapLoop ÷ (via ScrapLoop + elsewhere).
3. **Buyer follow-up.** A buyer who contacted a seller and returns after `FOLLOWUP_AFTER_HOURS` is asked "Did you get it?".
   "No" answers record why (no reply, price, transport…), which shows you what's breaking.

The stats page also lists **sellers to check in with**: open listings older than `SELLER_CHECKIN_AFTER_DAYS`, each with a
one-tap pre-written WhatsApp message. With your first users, messaging them yourself gives the most accurate data.

## Known limitations (fine for a prototype; worth saying honestly)

- No accounts. Sellers manage listings from the browser they posted from.
- Anyone can post, so moderate manually in the Supabase table editor if spam appears.
- The stats page is public (but unlisted). Don't share its URL.
