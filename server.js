// const express = require('express');
// const cors = require('cors');
// const fs = require('fs'); 
// const admin = require("firebase-admin");

// const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "https://okul-yurt-admin-65dd6-default-rtdb.europe-west1.firebasedatabase.app" 
// });

// const db = admin.database();
// const ref = db.ref("okul_yurt_verileri");

// async function googleMailGonder(aliciEmail, konu, icerikHtml) {
//     const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNMTXMkyQNpAcdk8V5jNPDn97XmU2nflYO84moSUdVgmdoSaY84sWnNX6TxygvcW7cRg/exec"; 
//     try {
//         const response = await fetch(GOOGLE_SCRIPT_URL, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ email: aliciEmail, subject: konu, body: icerikHtml })
//         });
//         const sonuc = await response.json();
//         return sonuc.status === 'success';
//     } catch (error) {
//         console.error("❌ Mail Hatası:", error);
//         return false;
//     }
// }

// const app = express();
// const PORT = process.env.PORT || 3000;
// app.use(express.json());
// app.use(cors());

// const DOSYA_ADI = 'veriler.json';

// // ==================================================================
// // 📂 VERİTABANI YAPISI (YENİ ALANLAR EKLENDİ)
// // ==================================================================
// let veritabani = {
//     hareketler: [],
//     izinTalepleri: [],
//     izinliNumaralar: [],
//     ogrenciler: [],
//     belletmenler: [],
//     yemekhaneKayitlari: [] // ✨ YENİ
// };

// async function verileriYukle() {
//     try {
//         console.log("☁️ Google Firebase'den veriler çekiliyor...");
//         const snapshot = await ref.once("value");
//         const data = snapshot.val();
//         if (data) {
//             veritabani = data; 
//             if (!veritabani.ogrenciler) veritabani.ogrenciler = [];
//             if (!veritabani.hareketler) veritabani.hareketler = [];
//             if (!veritabani.izinTalepleri) veritabani.izinTalepleri = [];
//             if (!veritabani.izinliNumaralar) veritabani.izinliNumaralar = [];
//             if (!veritabani.belletmenler) veritabani.belletmenler = [];
//             if (!veritabani.yemekhaneKayitlari) veritabani.yemekhaneKayitlari = []; // ✨ YENİ
//             console.log("✅ Veriler başarıyla senkronize edildi.");
//         } else {
//             console.log("🆕 Boş şablon hazırlanıyor...");
//             await verileriKaydet();
//         }
//     } catch (error) { console.error("❌ Google bağlantı hatası:", error); }
// }

// async function verileriKaydet() {
//     try {
//         fs.writeFileSync(DOSYA_ADI, JSON.stringify(veritabani, null, 2), 'utf-8');
//         await ref.set(veritabani); 
//         console.log("💾 Veriler Google Cloud'a yedeklendi.");
//     } catch (error) { console.error("❌ Kayıt hatası:", error); }
// }

// verileriYukle().then(() => { console.log("🚀 Sistem hazır."); });

// // ==================================================================
// // 🍴 YEMEKHANE SİSTEMİ (YENİ ENDPOİNTLER)
// // ==================================================================

// app.post('/yemekhane-giris', async (req, res) => {
//     // kapiKodu: Flutter'dan gelen QR içeriği (YEMEKHANE_GIRIS veya YEMEKHANE_CIKIS olmalı)
//     const { ogrenciNo, kapiKodu } = req.body; 
    
//     // 1. GÜVENLİK: Sadece yemekhane için oluşturduğun QR kodları kabul et
//     if (kapiKodu !== "YEMEKHANE_GIRIS" && kapiKodu !== "YEMEKHANE_CIKIS") {
//         return res.status(400).json({ 
//             basarili: false, 
//             mesaj: "❌ Geçersiz QR! Lütfen yemekhane QR'ını okutun." 
//         });
//     }

//     const kisi = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);
//     if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kayıt bulunamadı!" });

//     const bugun = new Date().toLocaleDateString("tr-TR");
//     const suan = new Date().toLocaleTimeString("tr-TR");

//     // 2. MANTIK: Giriş mi yapılıyor yoksa Çıkış mı?
//     if (kapiKodu === "YEMEKHANE_GIRIS") {
//         // Yeni bir giriş satırı oluştur
//         const yeniKayit = {
//             ogrenciNo: kisi.ogrenciNo,
//             isim: kisi.ad,
//             tip: kisi.tip || "YURTÇU",
//             girisSaati: suan,
//             cikisSaati: "--:--", // Henüz çıkmadı
//             tarih: bugun
//         };

//         veritabani.yemekhaneKayitlari.unshift(yeniKayit);
//         await verileriKaydet();
//         return res.json({ basarili: true, mesaj: `🍴 Afiyet olsun ${kisi.ad}, girişiniz yapıldı.` });

//     } else if (kapiKodu === "YEMEKHANE_CIKIS") {
//         // Öğrencinin bugün yaptığı ve henüz çıkış saati girilmemiş kaydını bul
//         const mevcutKayit = veritabani.yemekhaneKayitlari.find(k => 
//             k.ogrenciNo === ogrenciNo && 
//             k.tarih === bugun && 
//             (k.cikisSaati === "--:--" || !k.cikisSaati)
//         );

//         if (mevcutKayit) {
//             mevcutKayit.cikisSaati = suan;
//             await verileriKaydet();
//             return res.json({ basarili: true, mesaj: `👋 Güle güle ${kisi.ad}, çıkışınız yapıldı.` });
//         } else {
//             return res.json({ basarili: false, mesaj: "⚠️ Önce giriş yapmanız gerekiyor!" });
//         }
//     }
// });
// app.get('/yemekhane-listesi', (req, res) => { 
//     // .reverse() ekleyerek son girenlerin en üstte görünmesini sağlarız
//     const liste = veritabani.yemekhaneKayitlari || [];
//     res.json(liste); 
// });
// app.post('/yemekhane-sifirla', async (req, res) => {
//     veritabani.yemekhaneKayitlari = [];
//     await verileriKaydet();
//     res.json({ basarili: true, mesaj: "Yemekhane listesi sıfırlandı." });
// });

// // ==================================================================
// // 🌐 MEVCUT ENDPOİNTLER (GÜNCELLENDİ)
// // ==================================================================

// app.get('/', (req, res) => { res.send('Yurt/Okul Sistemi Aktif 🚀'); });
// app.get('/ogrenciler', (req, res) => { res.json(veritabani.ogrenciler); });
// app.get('/izinliler', (req, res) => { res.json(veritabani.ogrenciler.filter(o => o.durum === "IZINLI")); });
// app.get('/hareketler', (req, res) => { res.json([...veritabani.hareketler].reverse()); });
// app.get('/izin-talepleri', (req, res) => { res.json(veritabani.izinTalepleri.filter(t => t.durum === "BEKLIYOR")); });

// // server.js içindeki kayıt fonksiyonunu şu mantıkla güncelleyin
// app.post('/kayit-ol', async (req, res) => {
//     const { ogrenciNo, email, tel, sifre } = req.body;

//     // 1. Önce bu numara "izinli numaralar" listesinde hangi tiple kayıtlı?
//     const izinliBilgisi = veritabani.izinliNumaralar.find(n => n.numara.toString() === ogrenciNo.toString());

//     if (!izinliBilgisi) {
//         return res.status(400).json({ basarili: false, mesaj: "Bu numara sistemde tanımlı değil!" });
//     }

//     // 2. Kullanıcıyı oluştururken Admin'in seçtiği tipi (YURTÇU, ÖĞRETMEN vb.) ekle
//     const yeniKullanici = {
//         id: Date.now(),
//         ogrenciNo,
//         email,
//         tel,
//         sifre,
//         ad: izinliBilgisi.ad,
//         tip: izinliBilgisi.tip, // Admin panelinde seçilen tip burada devreye giriyor
//         sinif: izinliBilgisi.sinif || "-",
//         oda: izinliBilgisi.oda || "-",
//         durum: "DISARIDA",
//         etutDurumu: "YOK",
//         kayitliMi: true
//     };

//     veritabani.ogrenciler.push(yeniKullanici);
//     await verileriKaydet();

//     res.json({ basarili: true, mesaj: "Kayıt başarılı! Giriş yapabilirsiniz." });
// });

// app.post('/giris', (req, res) => {
//     const { ogrenciNo, sifre } = req.body;
//     const kullanici = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo && o.sifre === sifre && o.kayitliMi === true);
//     if (kullanici) res.json({ basarili: true, ogrenci: kullanici });
//     else res.status(401).json({ basarili: false, mesaj: "Hatalı bilgi!" });
// });

// app.post('/yoklama', (req, res) => {
//     const ogrenciId = req.body.ogrenciId || req.body.ogrenciNo;
//     const kapiKodu = req.body.kapiKodu;

//     const kisi = veritabani.ogrenciler.find(o => o.id == ogrenciId || o.ogrenciNo == ogrenciId);
//     if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kayıt bulunamadı" });

//     // ✨ YENİ: Evci öğrenciler yurda giremez
//     if (kapiKodu && kapiKodu.startsWith("YURT_") && kisi.tip === "EVCİ") {
//         return res.status(403).json({ basarili: false, mesaj: "⚠️ Evci öğrenciler yurda giriş yapamaz!" });
//     }

//     // Etüt Kontrolü
//     if (kapiKodu && kapiKodu.startsWith("ETUT_")) {
//         if (kisi.tip !== "YURTÇU") return res.json({ basarili: false, mesaj: "Sadece yurtçular etüde girebilir." });
//         kisi.etutDurumu = "VAR";
//         verileriKaydet();
//         return res.json({ basarili: true, mesaj: "📚 Etüt yazıldı!" });
//     } 

//     // Giriş/Çıkış Mantığı
//     let yeniDurum = "YURTTA";
//     let mesaj = `👋 Hoşgeldin ${kisi.tip}`;

//     if (kisi.durum === "YURTTA") {
//         const izin = veritabani.izinTalepleri.find(t => t.ogrenciId == kisi.id && t.durum === "ONAYLANDI");
//         if (izin) { yeniDurum = "IZINLI"; mesaj = "👋 İzinli Çıkış"; izin.durum = "KULLANILDI"; }
//         else { yeniDurum = "DISARIDA"; mesaj = "👋 Güle Güle"; }
//     }

//     kisi.durum = yeniDurum;
//     veritabani.hareketler.unshift({
//         ogrenciId: kisi.id,
//         isim: `${kisi.ad} (${kisi.tip})`,
//         durum_yeni: yeniDurum,
//         mesaj: mesaj,
//         zaman: new Date().toLocaleTimeString("tr-TR"),
//         timestamp: Date.now()
//     });

//     verileriKaydet();
//     res.json({ basarili: true, mesaj: mesaj, yeniDurum: yeniDurum });
// });

// // Admin, İzin, Şifre ve Diğer endpointler (Aynen Korundu)
// app.post('/admin-login', async (req, res) => {
//     const { kullaniciAdi, sifre } = req.body;
//     const snapshot = await ref.child("adminAyarlari").once("value");
//     const adminData = snapshot.val() || { kullaniciAdi: "admin", sifre: "123456" };
//     if (kullaniciAdi === adminData.kullaniciAdi && sifre === adminData.sifre) res.json({ basarili: true });
//     else res.status(401).json({ basarili: false, mesaj: "Hatalı!" });
// });

// app.post('/admin-sifre-guncelle', async (req, res) => {
//     const { yeniKullaniciAdi, yeniSifre } = req.body;
//     await ref.child("adminAyarlari").set({ kullaniciAdi: yeniKullaniciAdi, sifre: yeniSifre });
//     res.json({ basarili: true });
// });

// app.post('/sifre-kodu-gonder', async (req, res) => {
//     const { email } = req.body;
//     const kullanici = veritabani.ogrenciler.find(o => o.email === email && o.kayitliMi === true);
//     if (!kullanici) return res.status(404).json({ basarili: false });
//     const dogrulamaKodu = Math.floor(1000 + Math.random() * 9000).toString();
//     kullanici.resetKodu = dogrulamaKodu;
//     verileriKaydet();
//     const basarili = await googleMailGonder(email, "🔐 Kod", `<h1>${dogrulamaKodu}</h1>`);
//     res.json({ basarili });
// });

// app.post('/sifre-sifirla', (req, res) => {
//     const { email, kod, yeniSifre } = req.body;
//     const kullanici = veritabani.ogrenciler.find(o => o.email === email);
//     if (kullanici && kullanici.resetKodu === kod) {
//         kullanici.sifre = yeniSifre; kullanici.resetKodu = null;
//         verileriKaydet(); res.json({ basarili: true });
//     } else res.status(400).json({ basarili: false });
// });

// app.post('/izin-iste', (req, res) => {
//     const { ogrenciId, tur, aciklama, tarihBaslangic, tarihBitis } = req.body;
//     veritabani.izinTalepleri.push({ id: Date.now(), ogrenciId, isim: veritabani.ogrenciler.find(o=>o.id==ogrenciId).ad, tur, aciklama, tarih: `${tarihBaslangic}-${tarihBitis}`, durum: "BEKLIYOR" });
//     verileriKaydet(); res.json({ basarili: true });
// });

// app.post('/izin-islem', (req, res) => {
//     const { talepId, islem } = req.body;
//     const talep = veritabani.izinTalepleri.find(t => t.id == talepId);
//     if (talep) {
//         if (islem === "ONAY") {
//             talep.durum = "ONAYLANDI";
//             const o = veritabani.ogrenciler.find(o => o.id == talep.ogrenciId);
//             if (o && o.durum === "DISARIDA") { o.durum = "IZINLI"; talep.durum = "KULLANILDI"; }
//         } else talep.durum = "REDDEDILDI";
//         verileriKaydet(); res.json({ basarili: true });
//     }
// });

// app.get('/ogrenci-durum/:id', (req, res) => {
//     const o = veritabani.ogrenciler.find(o => o.id == req.params.id);
//     if (o) res.json({ durum: o.durum, izinOnaylandiMi: !!veritabani.izinTalepleri.find(t => t.ogrenciId == o.id && t.durum === "ONAYLANDI") });
// });

// app.post('/etut-sifirla', (req, res) => {
//     veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
//     verileriKaydet(); res.json({ basarili: true });
// });

// app.get('/belletmenler', (req, res) => { res.json(veritabani.belletmenler); });
// app.post('/belletmen-guncelle', (req, res) => { veritabani.belletmenler = req.body; verileriKaydet(); res.json({ basarili: true }); });

// app.get('/izinli-numaralar', (req, res) => { res.json(veritabani.izinliNumaralar); });
// app.post('/izinli-numara-ekle', (req, res) => {
//     const { numara, ad, sinif, oda, tip } = req.body; // ✨ TİP (EVCİ/ÖĞRETMEN vb) eklendi
//     veritabani.izinliNumaralar.push({ id: Date.now().toString(), numara, ad, sinif, oda, tip: tip || "YURTÇU" });
//     verileriKaydet(); res.json({ basarili: true });
// });

// app.delete('/izinli-numara-sil/:id', (req, res) => {
//     veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== req.params.id);
//     verileriKaydet(); res.json({ basarili: true });
// });

// app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Port: ${PORT}`); });
const express = require('express');
const cors = require('cors');
const fs = require('fs'); 
const admin = require("firebase-admin");

// Firebase Yapılandırması
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://okul-yurt-admin-65dd6-default-rtdb.europe-west1.firebasedatabase.app" 
});

const db = admin.database();
const ref = db.ref("okul_yurt_verileri");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());

// Veritabanı Şablonu
let veritabani = {
    hareketler: [],
    izinTalepleri: [],
    izinliNumaralar: [],
    ogrenciler: [],
    belletmenler: [],
    yemekhaneKayitlari: []
};

// Verileri Firebase'den Çekme
async function verileriYukle() {
    try {
        console.log("☁️ Veriler Firebase'den çekiliyor...");
        const snapshot = await ref.once("value");
        const data = snapshot.val();
        if (data) {
            veritabani = data; 
            if (!veritabani.ogrenciler) veritabani.ogrenciler = [];
            if (!veritabani.hareketler) veritabani.hareketler = [];
            if (!veritabani.izinTalepleri) veritabani.izinTalepleri = [];
            if (!veritabani.izinliNumaralar) veritabani.izinliNumaralar = [];
            if (!veritabani.belletmenler) veritabani.belletmenler = [];
            if (!veritabani.yemekhaneKayitlari) veritabani.yemekhaneKayitlari = [];
            console.log("✅ Veriler senkronize.");
        } else {
            await verileriKaydet();
        }
    } catch (error) { console.error("❌ Yükleme Hatası:", error); }
}

// Verileri Firebase'e Kaydetme
async function verileriKaydet() {
    try {
        await ref.set(veritabani); 
    } catch (error) { console.error("❌ Kayıt hatası:", error); }
}

verileriYukle().then(() => { console.log("🚀 Sistem Tam Kapasite Hazır."); });

// ==================================================================
// 🔍 GET ENDPOİNTLERİ
// ==================================================================
app.get('/ogrenciler', (req, res) => res.json(veritabani.ogrenciler));
app.get('/izinli-numaralar', (req, res) => res.json(veritabani.izinliNumaralar));
app.get('/hareketler', (req, res) => res.json(veritabani.hareketler));
app.get('/izin-talepleri', (req, res) => res.json(veritabani.izinTalepleri));
app.get('/yemekhane-listesi', (req, res) => res.json(veritabani.yemekhaneKayitlari));
app.get('/belletmenler', (req, res) => res.json(veritabani.belletmenler));

// ==================================================================
// 💳 KARTLI GEÇİŞ & YEMEKHANE (IoT UYUMLU)
// ==================================================================

app.post('/yemekhane-kart', async (req, res) => {
    const { kartId, kapiKodu } = req.body;
    const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Tanımsız Kart!" });

    const bugun = new Date().toLocaleDateString("tr-TR");
    const suan = new Date().toLocaleTimeString("tr-TR");

    if (kapiKodu === "YEMEKHANE_GIRIS") {
        const yeniKayit = {
            ogrenciNo: kisi.ogrenciNo,
            isim: kisi.ad,
            tip: kisi.tip || "YURTÇU",
            girisSaati: suan,
            cikisSaati: "--:--",
            tarih: bugun
        };
        veritabani.yemekhaneKayitlari.unshift(yeniKayit);
        await verileriKaydet();
        return res.json({ basarili: true, mesaj: `Afiyet olsun, ${kisi.ad}!` });
    } 
    
    if (kapiKodu === "YEMEKHANE_CIKIS") {
        const kayit = veritabani.yemekhaneKayitlari.find(k => k.ogrenciNo === kisi.ogrenciNo && k.tarih === bugun && k.cikisSaati === "--:--");
        if (kayit) {
            kayit.cikisSaati = suan;
            await verileriKaydet();
            return res.json({ basarili: true, mesaj: `Güle güle, ${kisi.ad}!` });
        }
        return res.status(400).json({ basarili: false, mesaj: "Giriş kaydı bulunamadı!" });
    }
});

app.post('/yoklama-kart', async (req, res) => {
    const { kartId, kapiKodu } = req.body;
    const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kart Kayıtlı Değil!" });

    if (kapiKodu && kapiKodu.startsWith("YURT_") && kisi.tip === "EVCİ") {
        return res.status(403).json({ basarili: false, mesaj: "Evci girişi yasak!" });
    }

    let yeniDurum = (kisi.durum === "YURTTA") ? "DISARIDA" : "YURTTA";
    let mesaj = yeniDurum === "YURTTA" ? `Hoşgeldin ${kisi.ad}` : "Güle Güle";

    if (yeniDurum === "DISARIDA") {
        const izin = veritabani.izinTalepleri.find(t => t.ogrenciId == kisi.id && t.durum === "ONAYLANDI");
        if (izin) { 
            yeniDurum = "IZINLI"; 
            mesaj = "İzinli Çıkış Yapıldı"; 
            izin.durum = "KULLANILDI"; 
        }
    }

    kisi.durum = yeniDurum;
    veritabani.hareketler.unshift({
        ogrenciId: kisi.id,
        isim: kisi.ad,
        tip: kisi.tip,
        durum_yeni: yeniDurum,
        mesaj: mesaj,
        zaman: new Date().toLocaleTimeString("tr-TR"),
        timestamp: Date.now()
    });

    await verileriKaydet();
    res.json({ basarili: true, mesaj, yeniDurum });
});

// ==================================================================
// 📝 İZİN & ETÜT & BELLETMEN İŞLEMLERİ
// ==================================================================

app.post('/izin-iste', async (req, res) => {
    const { ogrenciId, tur, aciklama, tarihBaslangic, tarihBitis } = req.body;
    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrenciId);
    veritabani.izinTalepleri.push({
        id: Date.now(),
        ogrenciId,
        isim: ogrenci ? ogrenci.ad : "Bilinmeyen",
        tur,
        aciklama,
        tarih: `${tarihBaslangic}-${tarihBitis}`,
        durum: "BEKLIYOR"
    });
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/izin-islem', async (req, res) => {
    const { talepId, islem } = req.body;
    const talep = veritabani.izinTalepleri.find(t => t.id == talepId);
    if (talep) {
        talep.durum = (islem === "ONAY") ? "ONAYLANDI" : "REDDEDILDI";
        await verileriKaydet();
        res.json({ basarili: true });
    } else {
        res.status(404).json({ basarili: false, mesaj: "Talep bulunamadı." });
    }
});

app.post('/etut-sifirla', async (req, res) => {
    veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/belletmen-guncelle', async (req, res) => {
    veritabani.belletmenler = req.body;
    await verileriKaydet();
    res.json({ basarili: true });
});

// ==================================================================
// 🔐 KAYIT & GİRİŞ & ADMİN
// ==================================================================

app.post('/izinli-numara-ekle', async (req, res) => {
    const { numara, ad, sinif, oda, tip, kartId } = req.body;
    veritabani.izinliNumaralar.push({ 
        id: Date.now().toString(), numara, ad, sinif, oda, tip, kartId: kartId || "" 
    });
    await verileriKaydet();
    res.json({ basarili: true });
});

app.delete('/izinli-numara-sil/:id', async (req, res) => {
    veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== req.params.id);
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/kayit-ol', async (req, res) => {
    try {
        const { ogrenciNo, email, tel, sifre } = req.body;

        // ✨ HATA DÜZELTME: Veri tiplerini garantilemek için toString() ve trim() ekledik
        const arananNo = ogrenciNo ? ogrenciNo.toString().trim() : "";

        // 1. İzinli Numaralar listesinde tara
        const izinliBilgisi = veritabani.izinliNumaralar.find(n => 
            (n.numara ? n.numara.toString().trim() : "") === arananNo
        );

        if (!izinliBilgisi) {
            return res.status(400).json({ 
                basarili: false, 
                mesaj: "Bu numara sistemde tanımlı değil! Lütfen idareye başvurun." 
            });
        }

        // 2. Zaten kayıtlı mı kontrol et
        const zatenKayitli = veritabani.ogrenciler.find(o => 
            (o.ogrenciNo ? o.ogrenciNo.toString().trim() : "") === arananNo
        );
        
        if (zatenKayitli) {
            return res.status(400).json({ basarili: false, mesaj: "Bu numara ile zaten kayıt olunmuş!" });
        }

        // 3. Kullanıcıyı oluştur
        const yeniKullanici = {
            id: Date.now(),
            ogrenciNo: arananNo,
            email: email,
            tel: tel,
            sifre: sifre,
            ad: izinliBilgisi.ad,
            tip: izinliBilgisi.tip || "YURTÇU",
            sinif: izinliBilgisi.sinif || "-",
            oda: izinliBilgisi.oda || "-",
            kartId: izinliBilgisi.kartId || "", 
            durum: "DISARIDA",
            etutDurumu: "YOK",
            kayitliMi: true
        };

        veritabani.ogrenciler.push(yeniKullanici);
        await verileriKaydet();

        res.json({ basarili: true, mesaj: "Kayıt başarılı! Giriş yapabilirsiniz." });
    } catch (err) {
        console.error("Kayıt Hatası:", err);
        res.status(500).json({ basarili: false, mesaj: "Sunucu hatası oluştu." });
    }
});

app.post('/giris', (req, res) => {
    try {
        const { ogrenciNo, sifre } = req.body;

        // Gelen veriyi her ihtimale karşı temizle ve metne çevir
        const arananNo = ogrenciNo ? ogrenciNo.toString().trim() : "";
        const arananSifre = sifre ? sifre.toString().trim() : "";

        console.log(`🔑 Giriş denemesi: No: ${arananNo}, Sifre: ${arananSifre}`);

        // Veritabanında ara
        const kullanici = veritabani.ogrenciler.find(o => 
            (o.ogrenciNo ? o.ogrenciNo.toString().trim() : "") === arananNo && 
            (o.sifre ? o.sifre.toString().trim() : "") === arananSifre
        );

        if (kullanici) {
            console.log("✅ Giriş başarılı:", kullanici.ad);
            res.json({ basarili: true, ogrenci: kullanici });
        } else {
            console.log("❌ Giriş başarısız: Bilgiler eşleşmedi.");
            res.status(401).json({ basarili: false, mesaj: "Hatalı Numara veya Şifre!" });
        }
    } catch (err) {
        console.error("Giriş Hatası:", err);
        res.status(500).json({ basarili: false, mesaj: "Sunucu hatası." });
    }
});

app.post('/admin-login', async (req, res) => {
    const { kullaniciAdi, sifre } = req.body;
    const snapshot = await ref.child("adminAyarlari").once("value");
    const adminData = snapshot.val() || { kullaniciAdi: "admin", sifre: "123456" };
    if (kullaniciAdi === adminData.kullaniciAdi && sifre === adminData.sifre) res.json({ basarili: true });
    else res.status(401).json({ basarili: false });
});

app.post('/yemekhane-sifirla', async (req, res) => {
    veritabani.yemekhaneKayitlari = [];
    await verileriKaydet();
    res.json({ basarili: true });
});

app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Port: ${PORT}`); });


