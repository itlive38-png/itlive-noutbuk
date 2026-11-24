# IT Live — Noutbuk nazorati va kutubxona (v2)

Umumiy baza bilan ishlaydigan veb-ilova: barcha telefon va kompyuterlarda bir xil ma'lumot.

## Nima o'zgardi (v1 → v2)
- **Haqiqiy login:** parol serverda (scrypt), sessiya cookie bilan. Avval parolni brauzerda "chetlab o'tish" mumkin edi.
- **Umumiy baza:** noutbuk va kutubxona ma'lumoti serverda; qurilmalar 5 soniyada sinxronlanadi. Ikki kishi bir vaqtda yozsa — yozuvlar birlashtiriladi (yo'qolmaydi).
- **QR manzili avtomatik:** sayt qaysi domenda bo'lsa, QR shu domenga yo'naladi (avval eski manzil qotirilgan edi).
- **Telefon (PWA):** pastki panel + katta 📷 skaner tugmasi, "Bosh ekranga qo'shish" orqali ilova kabi ochiladi, oflayn zaxira.
- Tuzatishlar: menyu ikonkasini bosganda ishlamasligi, PDF'da o‘ g‘ apostrofi "?" bo'lishi, QR sahifasida NP 19 (hodimda) chiqib qolishi.

## Ishga tushirish (kompyuterda sinash)
```
ADMIN_PASS=ParolniYozing node server.js
```
So'ng http://localhost:3000 . (Kamera faqat HTTPS yoki localhost'da ishlaydi.)

## Muhit o'zgaruvchilari
| Nomi | Vazifasi |
|---|---|
| ADMIN_USER / ADMIN_PASS | Boshlang'ich login va parol (birinchi ishga tushganda) |
| DATABASE_URL | Postgres manzili (Render'da MAJBURIY — pastga qarang) |
| SESSION_SECRET | Sessiya kaliti (render.yaml o'zi yaratadi) |

Render'ga ulash: **RENDER.md** ni o'qing.
