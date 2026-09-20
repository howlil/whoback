# WhoBack

**WhoBack membantu kamu melihat siapa yang tidak follow kamu balik di Instagram — tanpa perlu export data dan tanpa memasukkan password Instagram ke aplikasi lain.**

WhoBack berjalan sebagai Chrome extension dan menggunakan sesi Instagram yang **sudah login di browser kamu**.

> **Current release:** **v1.0.0**. WhoBack belum tersedia di Chrome Web Store, tetapi versi siap install tersedia melalui [GitHub Releases](https://github.com/howlil/whoback/releases/latest).

---

## Bisa buat apa?

Dengan WhoBack kamu bisa melihat:

- **Don't follow you back** — akun yang kamu follow, tapi tidak follow kamu balik.
- **You don't follow back** — akun yang follow kamu, tapi belum kamu follow balik.
- **Mutual** — kalian saling follow.
- **New followers** — follower baru sejak pengecekan sebelumnya.
- **Unfollowers** — akun yang berhenti follow sejak pengecekan sebelumnya.

Semua hasil disimpan **secara lokal di browser kamu**.

---

## Cara pakai

### 1. Login Instagram

Buka [instagram.com](https://www.instagram.com/) di Chrome dan login seperti biasa.

WhoBack **tidak meminta username atau password Instagram kamu**.

### 2. Buka WhoBack

Klik icon **WhoBack** di toolbar Chrome.

Kalau akun berhasil ditemukan, kamu akan melihat:

```text
@username
Connected
```

### 3. Klik **Check now**

WhoBack akan mulai membaca daftar **Following** dan **Followers** dari sesi Instagram yang sedang aktif.

Untuk hasil paling stabil:

- biarkan tab Instagram tetap terbuka;
- jangan refresh Instagram selama scan;
- jangan klik **Check now** berulang kali.

### 4. Tunggu sampai selesai

Jumlah akun menentukan lama scan.

WhoBack sengaja tidak mengirim request terlalu cepat agar lebih kecil kemungkinan Instagram membatasi request.

Saat scan berjalan kamu akan melihat progress seperti:

```text
Following: 150 loaded · page 3
Followers: 200 loaded · page 4
```

### 5. Lihat hasil

Setelah selesai, popup akan menampilkan ringkasan:

| Hasil | Artinya |
| --- | --- |
| **Followers** | Jumlah akun yang follow kamu |
| **Following** | Jumlah akun yang kamu follow |
| **Mutual** | Kalian saling follow |
| **Don't follow you back** | Kamu follow mereka, mereka tidak follow kamu |
| **You don't follow back** | Mereka follow kamu, kamu tidak follow mereka |

Klik **View details** untuk melihat daftar akun.

---

## Kalau scan berhenti?

WhoBack menyimpan progress setelah setiap halaman data selesai dibaca.

Jadi kalau scan berhenti di tengah jalan, progress **tidak langsung hilang**.

Saat sudah bisa dilanjutkan, tombol akan berubah menjadi:

```text
Resume scan
```

WhoBack akan melanjutkan dari posisi terakhir, bukan mulai lagi dari awal.

---

## Kalau muncul rate limit

Instagram bisa membatasi request dan menampilkan kondisi seperti:

```text
Instagram rate-limited the scan
```

Ini bukan berarti akun kamu logout.

Artinya Instagram sementara membatasi request dari sesi tersebut.

Jika ini terjadi:

1. jangan terus menekan tombol refresh;
2. tunggu sampai waktu cooldown selesai;
3. biarkan akun tetap login;
4. klik **Resume scan** setelah tombol tersedia kembali.

WhoBack akan berhenti otomatis saat mendeteksi rate limit agar tidak terus mengirim request.

> Tidak ada cara yang dapat menjamin Instagram tidak pernah memberi rate limit karena endpoint follower/following yang digunakan Instagram Web tidak memiliki quota publik yang terdokumentasi.

---

## Instalasi

### Untuk pengguna biasa

1. Buka **[Latest Release](https://github.com/howlil/whoback/releases/latest)**.
2. Di bagian **Assets**, download file:
   ```text
   whoback-chrome-v1.0.0.zip
   ```
3. Extract ZIP tersebut ke folder biasa.
4. Buka Chrome dan ketik `chrome://extensions` di address bar.
5. Aktifkan **Developer mode** di kanan atas.
6. Klik **Load unpacked**.
7. Pilih folder hasil extract yang berisi `manifest.json`.
8. Pin icon WhoBack dari menu Extensions agar mudah dibuka.

Kalau ada versi baru, download release terbaru dan load folder build terbaru.

> **Jangan gunakan tombol GitHub “Code → Download ZIP”.** Itu adalah source code. Installer manual WhoBack selalu tersedia di bagian **Assets** pada GitHub Release.

---

## Apakah password Instagram saya dibaca?

**Tidak.**

WhoBack menggunakan sesi Instagram yang sudah login di browser.

Untuk mengetahui akun mana yang sedang aktif, WhoBack membaca ID akun Instagram yang tersimpan di browser (`ds_user_id`).

WhoBack saat ini:

- tidak meminta password Instagram;
- tidak mengirim password ke server WhoBack;
- tidak memiliki application backend;
- menyimpan snapshot followers/following dan progress scan di local extension storage;
- tidak melakukan follow atau unfollow otomatis.

Menghapus extension juga menghapus akses extension terhadap sesi browser tersebut. Data local extension dapat dihapus melalui pengaturan browser.

---

## Kenapa WhoBack perlu akses Instagram?

Chrome akan meminta permission karena WhoBack perlu:

- mengetahui tab Instagram yang sedang terbuka;
- membaca ID akun yang sedang login;
- menjalankan scan di halaman Instagram;
- menyimpan progress dan hasil secara lokal.

Permission tersebut digunakan untuk fungsi WhoBack di `instagram.com`.

---

## Apakah WhoBack resmi dari Instagram?

Tidak.

WhoBack adalah project independen dan **tidak berafiliasi dengan Instagram atau Meta**.

Instagram tidak menyediakan official consumer API untuk mengambil seluruh daftar followers/following untuk use case seperti ini. Karena itu WhoBack bergantung pada internal web behavior Instagram.

Konsekuensinya:

- Instagram dapat mengubah sistemnya kapan saja;
- scan dapat berhenti atau membutuhkan update WhoBack;
- Instagram dapat memberikan rate limit;
- hasil hanya seakurat data yang berhasil dibaca saat scan selesai.

---

## Tips supaya lebih stabil

- Gunakan satu tab Instagram saja saat scan.
- Jangan reload tab Instagram ketika scan berjalan.
- Jangan menjalankan beberapa scan sekaligus.
- Kalau kena rate limit, tunggu — jangan spam retry.
- Gunakan hasil scan sebelumnya sambil menunggu refresh berikutnya.

---

## Untuk developer

<details>
<summary>Development setup</summary>

### Stack

- WXT / Manifest V3
- React + TypeScript
- Tailwind CSS
- Chrome Storage, Cookies, Scripting, Alarms, dan Side Panel APIs
- Vitest

### Run locally

```bash
corepack enable
pnpm install
pnpm dev
```

### Production build

```bash
pnpm check
pnpm zip
```

Load folder berikut sebagai unpacked extension:

```text
.output/chrome-mv3
```

### Scan architecture

```text
Instagram browser session
        ↓
ds_user_id
        ↓
viewer ID
        ↓
MAIN-world scanner
        ↓
following pages
        ↓
checkpoint
        ↓
followers pages
        ↓
checkpoint
        ↓
local snapshot
        ↓
relationship diff
```

Scanner menggunakan single-flight execution, cursor checkpoint/resume, conservative request pacing, dan hard stop ketika Instagram memberi rate-limit/block response.

</details>

---

## Disclaimer

Gunakan WhoBack secara wajar.

Project ini bergantung pada internal Instagram Web behavior yang tidak didokumentasikan sebagai public API. Tidak ada jaminan bahwa semua fitur akan selalu bekerja setelah Instagram melakukan perubahan.

---

**WhoBack — know who follows back, without handing over your Instagram password.**
