# SmartRoute E-IMZO integratsiyasi

SmartRoute E-IMZO uchun uchinchi tomon npm wrapper ishlatmaydi. Frontend local
`CAPIWS` protokoli bilan bevosita ishlaydi, backend esa production rejimida
rasmiy E-IMZO-SERVER orqali PKCS#7 imzoni tekshirishi kerak.

## Frontend

Foydalanuvchi kompyuterida rasmiy E-IMZO desktop moduli o'rnatilgan bo'lishi kerak.
Frontend quyidagi E-IMZO funksiyalarini local WebSocket yoki official browser
extension orqali chaqiradi:

- `version`
- `apikey`
- `pfx.list_all_certificates`
- `ftjc.list_all_keys`
- `pfx.load_key`
- `pfx.verify_password`
- `pkcs7.create_pkcs7`

`localhost` va `127.0.0.1` default API-key bilan ishlaydi. LAN IP yoki production
domen uchun rasmiy E-IMZO API-key kerak:

```env
VITE_EIMZO_API_KEY=domain-uchun-rasmiy-api-key
VITE_EIMZO_API_KEYS=192.168.0.3=api-key;example.uz=api-key
```

## Backend

Rasmiy E-IMZO-SERVER ulanadigan production konfiguratsiya:

```env
EIMZO_SERVER_URL=http://127.0.0.1:8080
EIMZO_REQUIRE_SERVER=true
```

Yoki:

```env
EIMZO_SERVER_URL=http://127.0.0.1:8080
EIMZO_VERIFY_MODE=server
```

`EIMZO_REQUIRE_SERVER=true` bo'lsa, backend OpenSSL/local fallback ishlatmaydi.
Bu production uchun tavsiya qilingan rejim.

Development uchun, E-IMZO-SERVER hali sozlanmagan bo'lsa, backend local OpenSSL
verify/fallback rejimida ishlashi mumkin. Bu faqat dev/test uchun.

## Login oqimi

1. Frontend kalitlar ro'yxatini E-IMZO desktop modulidan oladi.
2. Backend `/auth/eimzo/challenge` orqali bir martalik challenge beradi.
3. Frontend tanlangan kalit bilan challenge imzolaydi.
4. Backend PKCS#7 imzoni tekshiradi.
5. Sertifikatdagi PINFL/INN/serial userga biriktirilgan bo'lsa, JWT token beradi.

PFX fayl va kalit paroli SmartRoute backendiga yuborilmaydi.
