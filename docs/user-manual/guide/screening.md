# Screening X-Ray

Modul **Screening** digunakan untuk melakukan pemeriksaan fisik kargo menggunakan mesin X-Ray dan mencatat hasilnya.

## Memulai Screening
1. Dari halaman **Input Data**, klik nomor **MAWB** pada tabel untuk membuka layar screening khusus kargo tersebut.
2. Pastikan kamera/capture card sudah terdeteksi.

## Penggunaan Kamera
Sistem mendukung dua tampilan kamera secara bersamaan:
* **TOP VIEW:** Tampilan atas kargo.
* **SIDE VIEW:** Tampilan samping kargo.

Jika tampilan kamera tidak muncul, pastikan perangkat capture card sudah terhubung ke USB dan izin kamera diaktifkan di browser.

## Alur Kerja Scan Barcode
1. Cursor akan otomatis fokus pada kolom **MAWB**.
2. Scan barcode MAWB.
3. Tekan **Enter**, cursor akan otomatis berpindah ke kolom **HAWB**.
4. Masukkan jumlah koli (**Actual Pcs**) yang diperiksa.

## Mencatat Hasil
1. Klik tombol **Capture Image** untuk mengambil snapshot dari kedua kamera.
2. Anda juga dapat mengunggah foto fisik barang melalui area **Preview Foto Barang**.
3. Pilih keputusan akhir:
    * **FINISHED XRAY:** Jika barang dinyatakan aman dan proses selesai.
    * **PENDING XRAY:** Jika barang memerlukan pemeriksaan lebih lanjut atau ditolak.

Setelah keputusan disimpan, sistem akan mengosongkan input dan kembali fokus ke MAWB untuk item berikutnya.
