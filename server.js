const express = require('express');
const cors = require('cors');
const fs = require('fs'); 
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://okul-yurt-admin-65dd6-default-rtdb.europe-west1.firebasedatabase.app" 
});

const db = admin.database();
const ref = db.ref("okul_yurt_verileri");

async function googleMailGonder(aliciEmail, konu, icerikHtml) {
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNMTXMkyQNpAcdk8V5jNPDn97XmU2nflYO84moSUdVgmdoSaY84sWnNX6TxygvcW7cRg/exec"; 
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: aliciEmail, subject: konu, body: icerikHtml })
        });
        const sonuc = await response.json();
        return sonuc.status === 'success';
    } catch (error) {
        console.error("❌ Mail Hatası:", error);
        return false;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());

const DOSYA_ADI = 'veriler.json';

// ==================================================================
// 📂 VERİTABANI YAPISI (YENİ ALANLAR EKLENDİ)
// ==================================================================
let veritabani = {
    hareketler: [],
    izinTalepleri: [],
    izinliNumaralar: [],
    ogrenciler: [],
    belletmenler: [],
    yemekhaneKayitlari: [] // ✨ YENİ
};

async function verileriYukle() {
    try {
        console.log("☁️ Google Firebase'den veriler çekiliyor...");
        const snapshot = await ref.once("value");
        const data = snapshot.val();
        if (data) {
            veritabani = data; 
            if (!veritabani.ogrenciler) veritabani.ogrenciler = [];
            if (!veritabani.hareketler) veritabani.hareketler = [];
            if (!veritabani.izinTalepleri) veritabani.izinTalepleri = [];
            if (!veritabani.izinliNumaralar) veritabani.izinliNumaralar = [];
            if (!veritabani.belletmenler) veritabani.belletmenler = [];
            if (!veritabani.yemekhaneKayitlari) veritabani.yemekhaneKayitlari = []; // ✨ YENİ
            console.log("✅ Veriler başarıyla senkronize edildi.");
        } else {
            console.log("🆕 Boş şablon hazırlanıyor...");
            await verileriKaydet();
        }
    } catch (error) { console.error("❌ Google bağlantı hatası:", error); }
}

async function verileriKaydet() {
    try {
        fs.writeFileSync(DOSYA_ADI, JSON.stringify(veritabani, null, 2), 'utf-8');
        await ref.set(veritabani); 
        console.log("💾 Veriler Google Cloud'a yedeklendi.");
    } catch (error) { console.error("❌ Kayıt hatası:", error); }
}

verileriYukle().then(() => { console.log("🚀 Sistem hazır."); });

// ==================================================================
// 🍴 YEMEKHANE SİSTEMİ (YENİ ENDPOİNTLER)
// ==================================================================

app.post('/yemekhane-giris', async (req, res) => {
    const { ogrenciNo } = req.body;
    const kisi = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);

    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kayıt bulunamadı!" });

    const yeniKayit = {
        isim: kisi.ad,
        tip: kisi.tip || "YURTÇU", // YURTÇU, EVCİ, ÖĞRETMEN, PERSONEL
        zaman: new Date().toLocaleTimeString("tr-TR"),
        tarih: new Date().toLocaleDateString("tr-TR")
    };

    veritabani.yemekhaneKayitlari.unshift(yeniKayit);
    await verileriKaydet();
    res.json({ basarili: true, mesaj: `Afiyet olsun, ${kisi.ad}!` });
});

app.get('/yemekhane-listesi', (req, res) => { res.json(veritabani.yemekhaneKayitlari || []); });

app.post('/yemekhane-sifirla', async (req, res) => {
    veritabani.yemekhaneKayitlari = [];
    await verileriKaydet();
    res.json({ basarili: true, mesaj: "Yemekhane listesi sıfırlandı." });
});

// ==================================================================
// 🌐 MEVCUT ENDPOİNTLER (GÜNCELLENDİ)
// ==================================================================

app.get('/', (req, res) => { res.send('Yurt/Okul Sistemi Aktif 🚀'); });
app.get('/ogrenciler', (req, res) => { res.json(veritabani.ogrenciler); });
app.get('/izinliler', (req, res) => { res.json(veritabani.ogrenciler.filter(o => o.durum === "IZINLI")); });
app.get('/hareketler', (req, res) => { res.json([...veritabani.hareketler].reverse()); });
app.get('/izin-talepleri', (req, res) => { res.json(veritabani.izinTalepleri.filter(t => t.durum === "BEKLIYOR")); });

// server.js içindeki kayıt fonksiyonunu şu mantıkla güncelleyin
app.post('/kayit-ol', async (req, res) => {
    const { ogrenciNo, email, tel, sifre } = req.body;

    // 1. Önce bu numara "izinli numaralar" listesinde hangi tiple kayıtlı?
    const izinliBilgisi = veritabani.izinliNumaralar.find(n => n.numara === ogrenciNo);

    if (!izinliBilgisi) {
        return res.status(400).json({ basarili: false, mesaj: "Bu numara sistemde tanımlı değil!" });
    }

    // 2. Kullanıcıyı oluştururken Admin'in seçtiği tipi (YURTÇU, ÖĞRETMEN vb.) ekle
    const yeniKullanici = {
        id: Date.now(),
        ogrenciNo,
        email,
        tel,
        sifre,
        ad: izinliBilgisi.ad,
        tip: izinliBilgisi.tip, // Admin panelinde seçilen tip burada devreye giriyor
        sinif: izinliBilgisi.sinif || "-",
        oda: izinliBilgisi.oda || "-",
        durum: "DISARIDA",
        etutDurumu: "YOK"
    };

    veritabani.ogrenciler.push(yeniKullanici);
    await verileriKaydet();

    res.json({ basarili: true, mesaj: "Kayıt başarılı! Giriş yapabilirsiniz." });
});

app.post('/giris', (req, res) => {
    const { ogrenciNo, sifre } = req.body;
    const kullanici = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo && o.sifre === sifre && o.kayitliMi === true);
    if (kullanici) res.json({ basarili: true, ogrenci: kullanici });
    else res.status(401).json({ basarili: false, mesaj: "Hatalı bilgi!" });
});

app.post('/yoklama', (req, res) => {
    const ogrenciId = req.body.ogrenciId || req.body.ogrenciNo;
    const kapiKodu = req.body.kapiKodu;

    const kisi = veritabani.ogrenciler.find(o => o.id == ogrenciId || o.ogrenciNo == ogrenciId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kayıt bulunamadı" });

    // ✨ YENİ: Evci öğrenciler yurda giremez
    if (kapiKodu && kapiKodu.startsWith("YURT_") && kisi.tip === "EVCİ") {
        return res.status(403).json({ basarili: false, mesaj: "⚠️ Evci öğrenciler yurda giriş yapamaz!" });
    }

    // Etüt Kontrolü
    if (kapiKodu && kapiKodu.startsWith("ETUT_")) {
        if (kisi.tip !== "YURTÇU") return res.json({ basarili: false, mesaj: "Sadece yurtçular etüde girebilir." });
        kisi.etutDurumu = "VAR";
        verileriKaydet();
        return res.json({ basarili: true, mesaj: "📚 Etüt yazıldı!" });
    } 

    // Giriş/Çıkış Mantığı
    let yeniDurum = "YURTTA";
    let mesaj = `👋 Hoşgeldin ${kisi.tip}`;

    if (kisi.durum === "YURTTA") {
        const izin = veritabani.izinTalepleri.find(t => t.ogrenciId == kisi.id && t.durum === "ONAYLANDI");
        if (izin) { yeniDurum = "IZINLI"; mesaj = "👋 İzinli Çıkış"; izin.durum = "KULLANILDI"; }
        else { yeniDurum = "DISARIDA"; mesaj = "👋 Güle Güle"; }
    }

    kisi.durum = yeniDurum;
    veritabani.hareketler.unshift({
        ogrenciId: kisi.id,
        isim: `${kisi.ad} (${kisi.tip})`,
        durum_yeni: yeniDurum,
        zaman: new Date().toLocaleTimeString("tr-TR"),
        timestamp: Date.now()
    });

    verileriKaydet();
    res.json({ basarili: true, mesaj: mesaj, yeniDurum: yeniDurum });
});

// Admin, İzin, Şifre ve Diğer endpointler (Aynen Korundu)
app.post('/admin-login', async (req, res) => {
    const { kullaniciAdi, sifre } = req.body;
    const snapshot = await ref.child("adminAyarlari").once("value");
    const adminData = snapshot.val() || { kullaniciAdi: "admin", sifre: "123456" };
    if (kullaniciAdi === adminData.kullaniciAdi && sifre === adminData.sifre) res.json({ basarili: true });
    else res.status(401).json({ basarili: false, mesaj: "Hatalı!" });
});

app.post('/admin-sifre-guncelle', async (req, res) => {
    const { yeniKullaniciAdi, yeniSifre } = req.body;
    await ref.child("adminAyarlari").set({ kullaniciAdi: yeniKullaniciAdi, sifre: yeniSifre });
    res.json({ basarili: true });
});

app.post('/sifre-kodu-gonder', async (req, res) => {
    const { email } = req.body;
    const kullanici = veritabani.ogrenciler.find(o => o.email === email && o.kayitliMi === true);
    if (!kullanici) return res.status(404).json({ basarili: false });
    const dogrulamaKodu = Math.floor(1000 + Math.random() * 9000).toString();
    kullanici.resetKodu = dogrulamaKodu;
    verileriKaydet();
    const basarili = await googleMailGonder(email, "🔐 Kod", `<h1>${dogrulamaKodu}</h1>`);
    res.json({ basarili });
});

app.post('/sifre-sifirla', (req, res) => {
    const { email, kod, yeniSifre } = req.body;
    const kullanici = veritabani.ogrenciler.find(o => o.email === email);
    if (kullanici && kullanici.resetKodu === kod) {
        kullanici.sifre = yeniSifre; kullanici.resetKodu = null;
        verileriKaydet(); res.json({ basarili: true });
    } else res.status(400).json({ basarili: false });
});

app.post('/izin-iste', (req, res) => {
    const { ogrenciId, tur, aciklama, tarihBaslangic, tarihBitis } = req.body;
    veritabani.izinTalepleri.push({ id: Date.now(), ogrenciId, isim: veritabani.ogrenciler.find(o=>o.id==ogrenciId).ad, tur, aciklama, tarih: `${tarihBaslangic}-${tarihBitis}`, durum: "BEKLIYOR" });
    verileriKaydet(); res.json({ basarili: true });
});

app.post('/izin-islem', (req, res) => {
    const { talepId, islem } = req.body;
    const talep = veritabani.izinTalepleri.find(t => t.id == talepId);
    if (talep) {
        if (islem === "ONAY") {
            talep.durum = "ONAYLANDI";
            const o = veritabani.ogrenciler.find(o => o.id == talep.ogrenciId);
            if (o && o.durum === "DISARIDA") { o.durum = "IZINLI"; talep.durum = "KULLANILDI"; }
        } else talep.durum = "REDDEDILDI";
        verileriKaydet(); res.json({ basarili: true });
    }
});

app.get('/ogrenci-durum/:id', (req, res) => {
    const o = veritabani.ogrenciler.find(o => o.id == req.params.id);
    if (o) res.json({ durum: o.durum, izinOnaylandiMi: !!veritabani.izinTalepleri.find(t => t.ogrenciId == o.id && t.durum === "ONAYLANDI") });
});

app.post('/etut-sifirla', (req, res) => {
    veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
    verileriKaydet(); res.json({ basarili: true });
});

app.get('/belletmenler', (req, res) => { res.json(veritabani.belletmenler); });
app.post('/belletmen-guncelle', (req, res) => { veritabani.belletmenler = req.body; verileriKaydet(); res.json({ basarili: true }); });

app.get('/izinli-numaralar', (req, res) => { res.json(veritabani.izinliNumaralar); });
app.post('/izinli-numara-ekle', (req, res) => {
    const { numara, ad, sinif, oda, tip } = req.body; // ✨ TİP (EVCİ/ÖĞRETMEN vb) eklendi
    veritabani.izinliNumaralar.push({ id: Date.now().toString(), numara, ad, sinif, oda, tip: tip || "YURTÇU" });
    verileriKaydet(); res.json({ basarili: true });
});

app.delete('/izinli-numara-sil/:id', (req, res) => {
    veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== req.params.id);
    verileriKaydet(); res.json({ basarili: true });
});

app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Port: ${PORT}`); });

