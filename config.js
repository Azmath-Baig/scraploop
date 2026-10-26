// ScrapLoop configuration.
// Leave SUPABASE_URL / SUPABASE_ANON_KEY empty to run in demo mode (data stays in this browser only).
// For real users, create a free Supabase project, run supabase/schema.sql, then paste the values from
// Supabase → Project Settings → API.
window.SCRAPLOOP_CONFIG = {
  SUPABASE_URL: 'https://qijhuyipieabzkrhqwxn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpamh1eWlwaWVhYnprcmhxd3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5ODg3NTcsImV4cCI6MjEwODU2NDc1N30.fxBH5NGCa1QS2lrNRV2v7H9IInCRry1WnCNV8VyBKVE',

  APP_NAME: 'ScrapLoop',
  CURRENCY: 'AED',
  // Used to turn local numbers like 050 123 4567 into WhatsApp links (971 = UAE, 966 = KSA, 20 = Egypt, 91 = India).
  COUNTRY_CODE: '971',
  CITIES: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Al Ain'],
  // Buyers who contacted a seller are asked "did you get it?" when they come back after this many hours.
  FOLLOWUP_AFTER_HOURS: 24,
  // Stats page lists sellers to personally check in with once a listing is this old and still open.
  SELLER_CHECKIN_AFTER_DAYS: 3,
};
