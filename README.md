# SmartRoute - Transport va Logistika Boshqaruv Tizimi

SmartRoute - avtotransport parki, yo'l varaqalari, yoqilg'i (AZS), turniketlar (Hikvision), ESMA tibbiy ko'rik va 1C tarozilarini boshqaruvchi va monitoring qiluvchi korporativ tizim.

---

## 🚀 Boshqa kompyuterda ishga tushirish (Quick Start)

### 1. Talablar:
- **Node.js**: `v20.0.0` yoki undan yuqori (tavsiya etiladi: Node.js LTS)
- **Git**: O'rnatilgan bo'lishi kerak

---

### 2. Kodni yuklab olish (Clone):
```bash
git clone https://github.com/JavohirHojibayev/smartroute.git
cd smartroute
```

---

### 3. Tizimni ishga tushirish:

#### 🔹 Windows kompyuterida (Avtomatik 1-bosqichli ishga tushirish):
Loyihaning ildiz papkasidagi `start-smartroute.bat` faylini ikki marta bosing yoki konsoldan kiriting:
```cmd
start-smartroute.bat
```
*(Ushbu fayl avtomatik ravishda `.env` faylini yaratadi, `node_modules` paketlarini o'rnatadi hamda Frontend va Backend'ni parallel ishga tushiradi).*

#### 🔹 Linux / macOS kompyuterida:
```bash
chmod +x start-smartroute.sh
./start-smartroute.sh
```

#### 🔹 Qo'lda ishga tushirish (Manual Start):
1. **Backend ni sozlash va ishga tushirish**:
   ```bash
   cd backend
   cp .env.example .env    # Windows: copy .env.example .env
   npm install
   npm run start:dev
   ```
2. **Frontend ni sozlash va ishga tushirish**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

### 4. Tizimga kirish manzillari va login:

- **Frontend (Interfeys)**: `http://localhost:5173`
- **Backend (API)**: `http://localhost:3000`

🔑 **Boshlang'ich SuperAdmin kirish ma'lumotlari**:
- **Login**: `dkzadmin`
- **Parol**: `QW1665gety`

*(Eslatma: Parol va login sozlamalarini `backend/.env` faylidan o'zgartirishingiz mumkin).*

---

## 🛠 Tizim Tuzilishi (Architecture)

- `frontend/` - React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Leaflet (Xarita)
- `backend/` - NestJS + TypeORM + SQLite database + WebSockets (Socket.IO) + REST API
- `docker-compose.yml` - PostgreSQL (TimescaleDB) va Redis (zarur bo'lsa)

---

## 📄 Litsenziya
Maxfiy va ichki foydalanish uchun loyiha.
