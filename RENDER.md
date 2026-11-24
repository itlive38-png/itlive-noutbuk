# Render'ga ulash (0 dan)

1. **GitHub**: github.com da akkaunt oching → New repository (nomi: itlive-noutbuk, **Private**) → loyiha fayllarini (server.js, package.json, render.yaml, public/ papkasi) yuklang ("uploading an existing file").
2. **Baza (Neon, bepul, o'chib ketmaydi)**: neon.tech → Sign up → Create project → "Connection string" ni nusxalang (postgresql://... bilan boshlanadi).
3. **Render**: render.com → GitHub bilan kiring → New + → Web Service → repo'ni tanlang. Runtime: Node. Build: `npm install`. Start: `node server.js`. Plan: Free.
4. **Environment** bo'limida qo'shing: ADMIN_PASS (o'zingiz o'ylagan kuchli parol), DATABASE_URL (Neon'dan nusxa), SESSION_SECRET (har qanday uzun tasodifiy matn).
5. Deploy → tayyor bo'lgach `https://nomi.onrender.com` manzili chiqadi. Kirib, Sozlamalardan loginni o'zgartiring.
6. **QR yorliqlarni shu manzildan qayta chop eting** (QR bo'limi → Chop etish / PDF).
7. Telefonda: Chrome (Android) → ⋮ → "Bosh ekranga qo'shish"; iPhone Safari → Ulashish → "Bosh ekranga qo'shish".

Eslatma: bepul Render 15 daqiqa so'rov bo'lmasa "uxlaydi", birinchi ochilish ~30–60 soniya oladi. Buni oldini olish uchun UptimeRobot.com'da /healthz manzilini har 5 daqiqada tekshirishga qo'ying.
