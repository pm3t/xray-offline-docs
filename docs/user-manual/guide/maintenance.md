# Pemeliharaan & Pembaruan Sistem

Untuk memastikan sistem berjalan dengan versi terbaru, ikuti langkah pembaruan manual berikut.

## Cara Melakukan Pembaruan (Update)
Pembaruan dilakukan dengan menimpa berkas aplikasi yang sudah terkompilasi (production build).

1. Sambungkan **USB Drive** yang berisi folder pembaruan ke workstation.
2. Tutup aplikasi/browser yang sedang menjalankan sistem.
3. Buka USB Drive, masuk ke folder `Dist/`.
4. Salin (copy) seluruh isi di dalam folder `Dist/`.
5. Buka direktori aplikasi di workstation: `C:\XRay`.
6. Tempel (paste) dan pilih **Replace All** jika ada peringatan mengenai file yang duplikat.
7. Jalankan kembali aplikasi melalui shortcut atau browser.

## Pembersihan Database (Opsional)
Jika sistem terasa lambat atau ada korupsi data lokal:
1. Klik kanan pada halaman aplikasi -> **Inspect**.
2. Masuk ke tab **Application** -> **IndexedDB**.
3. Pilih **ScanDB** dan klik **Delete Database**.
4. Refresh halaman (Data manifest di LocalStorage akan tetap aman, namun riwayat scan akan terhapus).
