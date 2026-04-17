# Input Data Manifest

Halaman **Input Data** adalah langkah pertama dalam alur kerja screening. Di sini, Anda dapat mengelola daftar kargo yang akan diperiksa.

## Menambah Data Manual
1. Klik tombol **Add New** di pojok kanan atas.
2. Isi formulir yang tersedia:
    * **ULD No:** Nomor kontainer (jika ada).
    * **MAWB (SMU):** Nomor Air Waybill utama.
    * **HAWB:** Nomor Air Waybill rumah.
    * **Total Pcs & Weight:** Jumlah koli dan berat barang.
3. Klik **Save Cargo**.

## Impor Data dari Excel
Sistem mendukung impor data massal menggunakan template Excel yang telah ditentukan.

1. Gunakan template resmi: [Excel Template v2.xls](file:///home/bayu/Projects/XRayMockUp/Excel%20Template%20v2.xls).
2. Klik tombol **Import XLS**.
3. Pilih file data Anda. Sistem akan memproses dan menambahkan data ke tabel secara otomatis.

## Fitur Lainnya
* **Penyaringan (Filter):** Gunakan kotak pencarian untuk mencari MAWB/HAWB tertentu atau aktifkan "Show Incomplete Only" untuk melihat kargo yang belum selesai di-scan.
* **Sinkronisasi API:** Fitur ini saat ini berstatus *To Be Defined* (TBD).
* **Cetak Label:** Fitur pencetakan label IATA berstatus *Future Development*.
