const express = require('express');
const cors = require('cors');
const fs = require('fs'); // Dosya okuma/yazma modülü
const nodemailer = require('nodemailer');

// --- MAİL GÖNDERİCİ AYARLARI ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: 'true',
    auth: {
        user: 'srzttyb@gmail.com', // Kendi Gmail adresiniz
        pass: 'rkmj umiy gfmp owja'           // Google'dan aldığınız 16 haneli Uygulama Şifresi
    },
    tls: {
        rejectUnauthorized: false // Sertifika hatalarını yoksay
    },
    family: 4
});
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// --- KALICI HAFIZA AYARLARI ---
const DOSYA_ADI = 'veriler.json';

// Varsayılan Veriler (İlk kez çalıştırıldığında bu liste oluşacak)
let veritabani = {
    hareketler: [],
    izinTalepleri: [],
    izinliNumaralar: []
};

// --- YARDIMCI FONKSİYONLAR ---

// 1. Verileri Dosyadan Yükle (Sunucu açılınca çalışır)
function verileriYukle() {
    if (fs.existsSync(DOSYA_ADI)) {
        console.log("📂 Eski veriler bulundu, yükleniyor...");
        const dosyaIcerigi = fs.readFileSync(DOSYA_ADI, 'utf-8');
        veritabani = JSON.parse(dosyaIcerigi);
        if (!veritabani.izinliNumaralar) veritabani.izinliNumaralar = [];
        if (!veritabani.belletmenler) veritabani.belletmenler = [];
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

// --- GÜNCELLENMİŞ KAYIT OLMA ---
app.post('/kayit-ol', (req, res) => {
    // 1. Formdan sadece kayıt için gerekli bilgileri alıyoruz.
    // (Ad, Sınıf, Oda bilgilerini istemiyoruz, onları biz bulacağız)
    const { ogrenciNo, sifre, email, tel } = req.body;

    // 2. Önce bu öğrenci ana listede (veritabani.ogrenciler) var mı?
    let ogrenci = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);

    if (ogrenci) {
        // Öğrenci listede zaten var, peki kaydını tamamlamış mı?
        if (ogrenci.kayitliMi) {
            return res.status(400).json({ basarili: false, mesaj: "⚠️ Zaten kayıtlısınız. Giriş yapın." });
        }
        // Listede var ama kaydı yok (Eski usul eklenmiş olabilir), devam ediyoruz...
    } else {
        // 3. Öğrenci ana listede YOK. O zaman "İzinli Numaralar" listesine bakacağız.
        // Burada sadece numaraya değil, o numaranın detaylarına (izinliVeri) ulaşıyoruz.
        const izinliVeri = veritabani.izinliNumaralar.find(n => n.numara === ogrenciNo);

        if (!izinliVeri) {
            return res.status(404).json({ basarili: false, mesaj: "❌ Bu numara ile kayıt yetkiniz yok! İdareden onay alın." });
        }

        // 4. İzinli listesinde bulduk! 
        // Adminin girdiği Ad, Sınıf ve Oda bilgilerini buraya çekiyoruz.
        ogrenci = {
            id: Date.now(),
            ogrenciNo: ogrenciNo,
            ad: izinliVeri.ad,              // <--- Adminin girdiği İSİM
            sinif: izinliVeri.sinif || "-", // <--- Adminin girdiği SINIF
            oda: izinliVeri.oda || "-",     // <--- Adminin girdiği ODA
            durum: "DISARIDA",
            kayitliMi: false,
            sifre: null,
            email: null,
            tel: null,
            etutDurumu: "YOK"
        };

        // Artık ana listeye ekleyebiliriz
        veritabani.ogrenciler.push(ogrenci);
    }

    // 5. Öğrencinin belirlediği şifre ve iletişim bilgilerini kaydediyoruz.
    ogrenci.sifre = sifre;
    ogrenci.email = email;
    ogrenci.tel = tel;
    ogrenci.kayitliMi = true;

    verileriKaydet(); // 💾 DOSYAYA YAZ

    console.log(`🆕 KAYIT: ${ogrenci.ad} sisteme başarıyla eklendi.`);
    // Mesajda öğrencinin ismini de gösterelim ki doğru kişi olduğunu anlasın
    res.json({ basarili: true, mesaj: `✅ Kayıt başarılı! Hoşgeldin ${ogrenci.ad}` });
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
app.post('/sifre-kodu-gonder', async (req, res) => {
    const { email } = req.body;

    // 1. Bu maile sahip kayıtlı bir kullanıcı var mı?
    const kullanici = veritabani.ogrenciler.find(o => o.email === email && o.kayitliMi === true);

    if (!kullanici) {
        return res.status(404).json({ basarili: false, mesaj: "❌ Bu e-posta adresiyle kayıtlı öğrenci bulunamadı!" });
    }

    // 2. Rastgele 4 haneli kod üret
    const dogrulamaKodu = Math.floor(1000 + Math.random() * 9000).toString();

    // 3. Kodu kaydet
    kullanici.resetKodu = dogrulamaKodu;
    verileriKaydet();

    // 4. MAİL GÖNDERME İŞLEMİ (GERÇEK)
    const mailIcerigi = {
        from: '"Yurt Yönetim Sistemi" <sizinmailadresiniz@gmail.com>', // Gönderen
        to: email, // Alıcı (Öğrencinin maili)
        subject: '🔐 Şifre Sıfırlama Kodunuz',
        text: `Merhaba ${kullanici.ad},\n\nŞifrenizi sıfırlamak için gereken kodunuz: ${dogrulamaKodu}\n\nBu kodu kimseyle paylaşmayın.`,
        html: `
            <h3>Merhaba ${kullanici.ad},</h3>
            <p>Şifrenizi sıfırlamak için aşağıdaki kodu uygulamaya giriniz:</p>
            <h1 style="color: #2c3e50; background: #ecf0f1; padding: 10px; display: inline-block;">${dogrulamaKodu}</h1>
            <p>Bu işlemi siz yapmadıysanız lütfen idareye bildiriniz.</p>
        `
    };

    try {
        // Maili gönder
        await transporter.sendMail(mailIcerigi);
        
        console.log(`✅ Mail gönderildi: ${email} -> Kod: ${dogrulamaKodu}`);
        res.json({ basarili: true, mesaj: "✅ Doğrulama kodu e-posta adresinize gönderildi." });
        
    } catch (error) {
        console.error("Mail gönderme hatası:", error);
        res.status(500).json({ basarili: false, mesaj: "❌ Mail gönderilemedi. Lütfen daha sonra tekrar deneyin." });
    }
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

// --- YENİ: İZİNLİ NUMARA YÖNETİMİ ---

// 1. Listeyi Getir
app.get('/izinli-numaralar', (req, res) => {
    res.json(veritabani.izinliNumaralar);
});

// 2. Yeni Numara Ekle
// 2. Yeni İzinli Öğrenci Ekle (Detaylı)
app.post('/izinli-numara-ekle', (req, res) => {
    // Frontend'den gelen verileri alıyoruz
    const { numara, ad, sinif, oda } = req.body;

    if (!numara || !ad) return res.status(400).json({ basarili: false, mesaj: "Numara ve Ad-Soyad zorunludur!" });

    // Zaten listede var mı?
    const zatenVar = veritabani.izinliNumaralar.find(n => n.numara === numara);
    if (zatenVar) return res.status(400).json({ basarili: false, mesaj: "Bu numara zaten listede." });

    // Yeni kayıt oluştur
    const yeniKayit = {
        id: Date.now().toString(),
        numara: numara,
        ad: ad,       // YENİ
        sinif: sinif, // YENİ
        oda: oda,     // YENİ
        eklenmeTarihi: new Date().toLocaleDateString()
    };

    veritabani.izinliNumaralar.push(yeniKayit);
    verileriKaydet(); // Dosyayı güncelle

    res.json({ basarili: true, mesaj: "Öğrenci izin listesine eklendi.", data: yeniKayit });
});

// 3. Numara Sil
app.delete('/izinli-numara-sil/:id', (req, res) => {
    const { id } = req.params;

    const baslangicBoyut = veritabani.izinliNumaralar.length;
    veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== id);

    if (veritabani.izinliNumaralar.length < baslangicBoyut) {
        verileriKaydet();
        res.json({ basarili: true, mesaj: "Numara silindi." });
    } else {
        res.status(404).json({ basarili: false, mesaj: "Numara bulunamadı." });
    }
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu Hazır: http://localhost:${PORT}`);

});







