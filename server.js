const express = require('express');
const cors = require('cors');
const fs = require('fs'); // Dosya okuma/yazma modülü
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// --- KALICI HAFIZA AYARLARI ---
const DOSYA_ADI = 'veriler.json';

// Varsayılan Veriler (İlk kez çalıştırıldığında bu liste oluşacak)
let veritabani = {
    ogrenciler: [
        { id: 1, ogrenciNo: "2024001", ad: "Ahmet Yılmaz", sinif: "11-A", oda: "101", durum: "DISARIDA", kayitliMi: false, sifre: null, email: null, tel: null },
        { id: 2, ogrenciNo: "2024002", ad: "Mehmet Demir", sinif: "12-C", oda: "102", durum: "DISARIDA", kayitliMi: false, sifre: null, email: null, tel: null },
        { id: 3, ogrenciNo: "2024003", ad: "Ayşe Kara", sinif: "10-B", oda: "205", durum: "IZINLI", kayitliMi: false, sifre: null, email: null, tel: null },
    ],
    hareketler: [],
    izinTalepleri: []
};

// --- YARDIMCI FONKSİYONLAR ---

// 1. Verileri Dosyadan Yükle (Sunucu açılınca çalışır)
function verileriYukle() {
    if (fs.existsSync(DOSYA_ADI)) {
        console.log("📂 Eski veriler bulundu, yükleniyor...");
        const dosyaIcerigi = fs.readFileSync(DOSYA_ADI, 'utf-8');
        veritabani = JSON.parse(dosyaIcerigi);
    } else {
        console.log("🆕 Veri dosyası yok, varsayılan liste oluşturuluyor...");
        verileriKaydet(); // Dosyayı oluştur
    }
}

// 2. Verileri Dosyaya Kaydet (Her işlemden sonra çalışır)
function verileriKaydet() {
    fs.writeFileSync(DOSYA_ADI, JSON.stringify(veritabani, null, 2), 'utf-8');
    // null, 2 -> Dosyayı okunabilir (girintili) formatta kaydeder
}

// Sunucu başlarken yüklemeyi yap
verileriYukle();

// --- ENDPOINTLER ---

app.get('/', (req, res) => { res.send('Kalıcı Sunucu Aktif 💾'); });

// Listeleri Getir
app.get('/ogrenciler', (req, res) => { res.json(veritabani.ogrenciler); });
app.get('/izinliler', (req, res) => { res.json(veritabani.ogrenciler.filter(o => o.durum === "IZINLI")); });
app.get('/hareketler', (req, res) => { res.json([...veritabani.hareketler].reverse()); });
app.get('/izin-talepleri', (req, res) => { res.json(veritabani.izinTalepleri.filter(t => t.durum === "BEKLIYOR")); });

// --- KAYIT OLMA ---
app.post('/kayit-ol', (req, res) => {
    const { ogrenciNo, sifre, email, tel } = req.body;

    const ogrenci = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);

    if (!ogrenci) return res.status(404).json({ basarili: false, mesaj: "❌ Öğrenci numarası bulunamadı!" });
    if (ogrenci.kayitliMi) return res.status(400).json({ basarili: false, mesaj: "⚠️ Zaten kayıtlısınız." });

    // Bilgileri Güncelle
    ogrenci.sifre = sifre;
    ogrenci.email = email;
    ogrenci.tel = tel;
    ogrenci.kayitliMi = true;

    verileriKaydet(); // 💾 DOSYAYA YAZ

    console.log(`🆕 KAYIT: ${ogrenci.ad} sisteme eklendi.`);
    res.json({ basarili: true, mesaj: "✅ Kayıt başarılı!" });
});

// --- GİRİŞ YAPMA ---
app.post('/giris', (req, res) => {
    const { ogrenciNo, sifre } = req.body;

    const kullanici = veritabani.ogrenciler.find(o =>
        o.ogrenciNo === ogrenciNo && o.sifre === sifre && o.kayitliMi === true
    );

    if (kullanici) {
        console.log(`🔑 Giriş: ${kullanici.ad}`);
        res.json({ basarili: true, ogrenci: kullanici });
    } else {
        const kayitsiz = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);
        if (kayitsiz && !kayitsiz.kayitliMi) res.status(401).json({ basarili: false, mesaj: "Önce kayıt olmalısınız!" });
        else res.status(401).json({ basarili: false, mesaj: "Hatalı bilgi!" });
    }
});
app.post('/sifre-kodu-gonder', (req, res) => {
    const { email } = req.body;

    // 1. Bu maile sahip kayıtlı bir kullanıcı var mı?
    const kullanici = veritabani.ogrenciler.find(o => o.email === email && o.kayitliMi === true);

    if (!kullanici) {
        return res.status(404).json({ basarili: false, mesaj: "❌ Bu e-posta adresiyle kayıtlı öğrenci bulunamadı!" });
    }

    // 2. Rastgele 4 haneli kod üret
    const dogrulamaKodu = Math.floor(1000 + Math.random() * 9000).toString();

    // 3. Kodu kullanıcının verisine geçici olarak kaydet
    kullanici.resetKodu = dogrulamaKodu;
    verileriKaydet(); // Dosyaya yaz ki sunucu kapanırsa gitmesin

    // 4. Kodu Konsola Yaz (İleride burası mail atacak)
    console.log("------------------------------------------------");
    console.log(`📩 MAİL GÖNDERİLDİ (SİMÜLASYON)`);
    console.log(`👤 Kime: ${kullanici.ad} (${email})`);
    console.log(`🔑 DOĞRULAMA KODU: ${dogrulamaKodu}`);
    console.log("------------------------------------------------");

    res.json({ basarili: true, mesaj: "✅ Doğrulama kodu e-posta adresinize gönderildi." });
});

// --- YENİ: ŞİFREYİ GÜNCELLEME ---
app.post('/sifre-sifirla', (req, res) => {
    const { email, kod, yeniSifre } = req.body;

    const kullanici = veritabani.ogrenciler.find(o => o.email === email);

    if (!kullanici) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı bulunamadı." });

    // Kod kontrolü
    if (kullanici.resetKodu !== kod) {
        return res.status(400).json({ basarili: false, mesaj: "❌ Girdiğiniz kod hatalı!" });
    }

    // Şifreyi değiştir ve kodu sil (Tek kullanımlık olsun)
    kullanici.sifre = yeniSifre;
    kullanici.resetKodu = null; // Kodu temizle
    verileriKaydet();

    console.log(`🔐 ŞİFRE DEĞİŞTİ: ${kullanici.ad} şifresini yeniledi.`);
    res.json({ basarili: true, mesaj: "✅ Şifreniz başarıyla değiştirildi. Giriş yapabilirsiniz." });
});

// --- TURNİKE ---
app.post('/yoklama', (req, res) => {
    // 1. CASUS: Telefondan ne geliyor görelim
    console.log("📡 YOKLAMA İSTEĞİ GELDİ:", req.body);

    // DİKKAT: Mobil uygulama 'ogrenciNo' mu gönderiyor 'ogrenciId' mi?
    // Garanti olsun diye ikisini de kontrol edelim:
    const ogrenciId = req.body.ogrenciId || req.body.ogrenciNo;
    const kapiKodu = req.body.kapiKodu;

    // Öğrenciyi bul (Hem string hem sayı hatası olmasın diye == kullanıyoruz)
    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrenciId || o.ogrenciNo == ogrenciId);

    // Öğrenci yoksa hemen dur
    if (!ogrenci) {
        console.log("❌ HATA: Öğrenci veritabanında bulunamadı! Aranan ID:", ogrenciId);
        return res.status(404).json({ basarili: false, mesaj: "Öğrenci bulunamadı" });
    }

    console.log(`👤 Öğrenci: ${ogrenci.ad}, Mevcut Durum: ${ogrenci.durum}, Gelen QR: ${kapiKodu}`);

    // --- A) ETÜT KONTROLÜ ---
    if (kapiKodu && kapiKodu.startsWith("ETUT_")) {
        if (ogrenci.etutDurumu === "VAR") {
            console.log("ℹ️ Zaten etütte.");
            return res.json({ basarili: true, mesaj: "✅ Zaten etüt listesindesin.", yeniDurum: ogrenci.durum });
        }
        ogrenci.etutDurumu = "VAR";
        verileriKaydet();
        console.log("📚 Etüt var yazıldı.");
        return res.json({ basarili: true, mesaj: "📚 Etüt Yoklaması Alındı!", yeniDurum: ogrenci.durum });
    }
    // --- QR KOD HATALIYSA ---
    else if (!kapiKodu || !kapiKodu.startsWith("YURT_")) {
        console.log("⚠️ Geçersiz QR Kodu:", kapiKodu);
        return res.status(400).json({ mesaj: "Geçersiz QR! Lütfen YURT QR'ını okutun." });
    }

    // --- B) SPAM KORUMASI ---
    const sonIslem = veritabani.hareketler ? veritabani.hareketler.find(h => h.ogrenciId == ogrenci.id || h.isim == ogrenci.ad) : null;
    
    // Not: findLast bazen eski node sürümlerinde çalışmaz, o yüzden garanti olsun diye array'i ters çevirip bakmak daha güvenli olabilir ama şimdilik senin kodunu korudum.
    // timestamp kontrolü:
    if (sonIslem && sonIslem.timestamp && (Date.now() - sonIslem.timestamp < 3000)) {
        console.log("⏳ Spam koruması devrede.");
        return res.json({ basarili: true, mesaj: "⏳ Çok hızlı okuttun, sakin ol...", yeniDurum: ogrenci.durum });
    }

    // --- C) DURUM MANTIĞI ---
    let yeniDurum = "";
    let mesaj = "";

    // Senaryo 1: Öğrenci zaten YURTTA ise -> Çıkış yapacak (veya izinli çıkacak)
    if (ogrenci.durum === "YURTTA") {
        // İzin talebi var mı?
        const izin = veritabani.izinTalepleri ? veritabani.izinTalepleri.find(t => (t.ogrenciId == ogrenci.id || t.isim == ogrenci.ad) && t.durum === "ONAYLANDI") : null;
        
        if (izin) {
            yeniDurum = "IZINLI";
            mesaj = "👋 İzinli Çıkış";
            izin.durum = "KULLANILDI"; // İzni düş
            console.log("✅ İzinli çıkış yaptı.");
        } else {
            yeniDurum = "DISARIDA";
            mesaj = "👋 Güle Güle";
            console.log("🚪 Normal çıkış yaptı.");
        }
    } 
    // Senaryo 2: Öğrenci DIŞARIDA veya İZİNLİ ise -> Yurda girecek
    else {
        yeniDurum = "YURTTA";
        mesaj = (ogrenci.durum === "IZINLI") ? "👋 İzin Dönüşü Hoşgeldin" : "👋 Hoşgeldin";
        console.log(`🏠 Yurda giriş yaptı. (Eski durum: ${ogrenci.durum})`);
    }

    // --- KAYIT VE BİTİŞ ---
    ogrenci.durum = yeniDurum;
    
    if (!veritabani.hareketler) veritabani.hareketler = [];
    veritabani.hareketler.unshift({ // push yerine unshift ile en başa ekleriz ki son hareket kolay bulunsun
        ogrenciId: ogrenci.id, 
        isim: ogrenci.ad, 
        durum_yeni: yeniDurum,
        zaman: new Date().toLocaleTimeString("tr-TR"), 
        timestamp: Date.now()
    });

    verileriKaydet();
    
    console.log("💾 Veri kaydedildi. İşlem tamam.");
    res.json({ basarili: true, mesaj: mesaj, yeniDurum: yeniDurum });
});

// --- İZİN TALEBİ ---
app.post('/izin-iste', (req, res) => {
    try {
        const { ogrenciId, tur, aciklama, tarihBaslangic, tarihBitis } = req.body;
        const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrenciId);
        if (!ogrenci) return res.status(404).json({ mesaj: "Hata" });

        veritabani.izinTalepleri.push({
            id: Date.now(), ogrenciId: ogrenci.id, isim: ogrenci.ad,
            tur, aciklama, tarih: `${tarihBaslangic}-${tarihBitis}`, durum: "BEKLIYOR"
        });

        verileriKaydet(); // 💾 DOSYAYA YAZ

        res.json({ basarili: true, mesaj: "İletildi" });
    } catch (e) { res.status(500).json({ mesaj: "Hata" }); }
});

// --- İZİN İŞLEMİ (ONAY/RED) ---
app.post('/izin-islem', (req, res) => {
    const { talepId, islem } = req.body;
    const talep = veritabani.izinTalepleri.find(t => t.id == talepId);
    if (!talep) return res.status(404).json({ mesaj: "Bulunamadı" });

    if (islem === "ONAY") {
        talep.durum = "ONAYLANDI";
        const ogrenci = veritabani.ogrenciler.find(o => o.id == talep.ogrenciId);
        if (ogrenci && ogrenci.durum === "DISARIDA") {
            ogrenci.durum = "IZINLI";
            talep.durum = "KULLANILDI";
        }
    } else { talep.durum = "REDDEDILDI"; }

    verileriKaydet(); // 💾 DOSYAYA YAZ

    res.json({ basarili: true, mesaj: "İşlem Tamam" });
});

// --- DURUM KONTROLÜ ---
app.get('/ogrenci-durum/:id', (req, res) => {
    const ogrId = req.params.id;
    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrId);
    if (ogrenci) {
        const bekleyenIzin = veritabani.izinTalepleri.find(t => t.ogrenciId == ogrId && t.durum === "ONAYLANDI");
        res.json({ durum: ogrenci.durum, izinOnaylandiMi: !!bekleyenIzin });
    } else { res.status(404).json({ mesaj: "Bulunamadı" }); }
});
app.post('/etut-sifirla', (req, res) => {
    // Tüm öğrencilerin etüt durumunu "YOK" yap
    veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
    verileriKaydet();
    console.log("🧹 Etüt listesi sıfırlandı.");
    res.json({ basarili: true, mesaj: "Etüt yoklaması sıfırlandı." });
});

app.get('/belletmenler', (req, res) => {
    // Eğer veritabanında bu alan hiç yoksa (eski dosya ise) varsayılanı oluştur
    if (!veritabani.belletmenler) {
        veritabani.belletmenler = [
            { gun: "Pazartesi", erkek: "", kiz: "" },
            { gun: "Salı", erkek: "", kiz: "" },
            { gun: "Çarşamba", erkek: "", kiz: "" },
            { gun: "Perşembe", erkek: "", kiz: "" },
            { gun: "Cuma", erkek: "", kiz: "" },
            { gun: "Cumartesi", erkek: "", kiz: "" },
            { gun: "Pazar", erkek: "", kiz: "" }
        ];
        verileriKaydet(); // Hemen kaydet ki kalıcı olsun
    }
    res.json(veritabani.belletmenler);
});

// 2. Listeyi Güncelle (Admin Kaydeder)
app.post('/belletmen-guncelle', (req, res) => {
    const yeniListe = req.body;

    // Basit doğrulama
    if (Array.isArray(yeniListe) && yeniListe.length === 7) {
        veritabani.belletmenler = yeniListe;
        verileriKaydet(); // Dosyaya yaz
        res.json({ basarili: true, mesaj: "Nöbetçi listesi güncellendi." });
    } else {
        res.status(400).json({ basarili: false, mesaj: "Liste formatı hatalı." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu Hazır: http://localhost:${PORT}`);

});

