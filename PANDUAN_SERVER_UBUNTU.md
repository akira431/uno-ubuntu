# 📖 Panduan Menjalankan Server UNO Truth or Dare di VirtualBox Ubuntu

Game **UNO Truth or Dare Multiplayer** ini telah disinkronkan dengan server Node.js + Express + Socket.io yang dioptimalkan untuk berjalan di VirtualBox Ubuntu / LAN / VPS, lengkap dengan sistem **Lobby Rematch Otomatis** (pemain tetap berada di ruangan saat permainan selesai tanpa perlu memasukkan kode lagi).

---

## 🚀 1. Persiapan di VirtualBox Ubuntu

### A. Pastikan Node.js & npm Terpasang
Buka terminal di Ubuntu VirtualBox Anda dan jalankan:
```bash
node -v
npm -v
```
Jika belum terpasang, instal dengan:
```bash
sudo apt update
sudo apt install -y nodejs npm
```

---

## 📁 2. Memindahkan Project ke Ubuntu

Anda dapat memindahkan folder `uno-main` ke Ubuntu melalui salah satu cara berikut:
- **Shared Folders VirtualBox**: Pasang folder `game` Windows ke folder `/media/sf_game` atau `~/game` di Ubuntu.
- **File Transfer (SCP/FileZilla)**: Transfer folder `uno-main` via SSH.
- **Git / ZIP**: Kompres folder menjadi `.zip` lalu ekstrak di direktori home Ubuntu (`~/uno-main`).

Masuk ke direktori game di terminal Ubuntu:
```bash
cd ~/uno-main
```

---

## 📦 3. Instal Dependensi

Jalankan perintah berikut sekali saja untuk memasang paket:
```bash
npm install
```

---

## ⚡ 4. Menjalankan Server

### Opsi A: Mode Langsung (Development)
```bash
node server.js
```
Terminal akan menampilkan output seperti ini:
```text
==================================================================
🃏 UNO TRUTH OR DARE — DEDICATED MULTIPLAYER SERVER
==================================================================
🚀 Server aktif di Port: 3000

🌐 Cara Akses dari Browser:
   > Komputer ini (Localhost) : http://localhost:3000
   > HP / Laptop Lain (LAN)   : http://192.168.1.50:3000
==================================================================
```

### Opsi B: Mode Background / Production (PM2)
Agar server tetap berjalan di latar belakang meskipun terminal ditutup:
```bash
sudo npm install -g pm2
pm2 start server.js --name "uno-server"
pm2 save
pm2 startup
```

Untuk melihat status atau log:
```bash
pm2 status
pm2 logs uno-server
```

---

## 🌐 5. Konfigurasi Jaringan VirtualBox (Penting!)

Agar HP atau laptop teman Anda dapat membuka game yang dihosting di VirtualBox, pilih salah satu mode jaringan berikut di VirtualBox:

### Opsi 1: Mode **Bridged Adapter** (Paling Mudah & Direkomendasikan)
1. Buka VirtualBox -> Pilih VM Ubuntu -> **Settings** -> **Network**.
2. Ubah `Attached to:` dari **NAT** menjadi **Bridged Adapter**.
3. Pilih adapter Wi-Fi atau Ethernet komputer Anda.
4. Di terminal Ubuntu, cek IP dengan perintah:
   ```bash
   ip a
   ```
   (Biasanya formatnya `192.168.x.x` yang selevel dengan jaringan Wi-Fi rumah/kantor Anda).
5. Semua HP yang terhubung ke Wi-Fi yang sama cukup membuka:
   `http://<IP_UBUNTU>:3000`

### Opsi 2: Mode **NAT dengan Port Forwarding**
Jika VM Anda harus menggunakan mode NAT:
1. Buka VirtualBox -> **Settings** -> **Network** -> **Advanced** -> **Port Forwarding**.
2. Tambahkan rule baru:
   - **Name**: `UNO`
   - **Protocol**: `TCP`
   - **Host IP**: (kosongkan)
   - **Host Port**: `3000`
   - **Guest IP**: (kosongkan)
   - **Guest Port**: `3000`
3. Sekarang siapa pun di jaringan Wi-Fi Anda bisa membuka IP komputer Windows Anda:
   `http://<IP_KOMPUTER_WINDOWS>:3000`

---

## 🎮 6. Fitur Baru: Lobby Rematch (Pemain Tetap di Room)

1. **Setelah Permainan Selesai**:
   - Layar pemenang muncul di semua HP pemain.
   - **Host**: Memiliki tombol `🏠 Kembali ke Lobi (Babak Baru)` dan `⚡ Langsung Gas Babak Baru`.
   - **Guest / Pemain Lain**: Ditampilkan status `⏳ Pemain tetap di room! Menunggu Host memulai babak berikutnya...`.
2. **Saat Host Memilih "Kembali ke Lobi"**:
   - Seluruh pemain secara otomatis dikembalikan ke tampilan Lobi Ruangan.
   - **Tidak ada yang perlu memasukkan kode ruangan lagi!**
   - Nama, avatar, dan posisi pemain tetap tersimpan di slot masing-masing.
   - Host cukup mengklik tombol `🃏 Mulai Game (Host)` untuk membagikan kartu baru dan memulai babak selanjutnya.
3. **Pemain Tetap Terhubung**:
   - Jika sinyal HP salah satu pemain goyang, server akan otomatis menyambungkan kembali (auto-reconnect) ke slot yang sama tanpa mengulang room.
