const express = require('express');
const cors = require('cors');
const fs = require('fs'); 
const admin = require("firebase-admin"); // Firebase'i kullanabilmek için gerekli
// Koyeb panelinden FIREBASE_CONFIG değişkenini okuyoruz
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // BURAYA DİKKAT: Firebase'deki kendi Database URL'ini yapıştır
  databaseURL: "https://okul-yurt-admin-65dd6-default-rtdb.europe-west1.firebasedatabase.app" 
});

const db = admin.database();
const ref = db.ref("okul_yurt_verileri"); // Verilerin Google'daki 'klasör' adı

// 🗑️ Nodemailer ve SMTP ayarları ÇÖPE ATILDI.
// Yerine Native Fetch API kullanıyoruz (Node v18+ destekler, Render'da var).

// ==================================================================
// 🚀 YENİ MAİL SİSTEMİ (GOOGLE WEB APP - PORT ENGELİ YOK)
// ==================================================================
async function googleMailGonder(aliciEmail, konu, icerikHtml) {
    // 👇👇👇 BURAYA DİKKAT 👇👇👇
    // Az önce "Dağıt" diyerek aldığın uzun linki tırnakların içine yapıştır:
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNMTXMkyQNpAcdk8V5jNPDn97XmU2nflYO84moSUdVgmdoSaY84sWnNX6TxygvcW7cRg/exec"; 
    // 👆👆👆 ÖRN: "https://script.google.com/macros/s/AKfycbx.../exec"

    if (GOOGLE_SCRIPT_URL.includes("BURAYA")) {
        console.error("❌ HATA: Google Script URL'sini yapıştırmayı unuttun!");
        return false;
    }

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: aliciEmail,
                subject: konu,
                body: icerikHtml
            })
        });

        const sonuc = await response.json();
        
        if (sonuc.status === 'success') {
            console.log(`✅ Mail Başarılı! Alıcı: ${aliciEmail}`);
            return true;
        } else {
            console.error("❌ Google Script Hatası:", sonuc.message);
            return false;
        }
    } catch (error) {
        console.error("❌ Fetch Bağlantı Hatası:", error);
        return false;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// ==================================================================
// 📂 VERİTABANI VE AYARLAR (AYNEN KORUNDU)
// ==================================================================
const DOSYA_ADI = 'veriler.json';

// Varsayılan Veriler
let veritabani = {
    hareketler: [],
    izinTalepleri: [],
    izinliNumaralar: [],
    ogrenciler: [],
    belletmenler: []
};

// Google'dan verileri getiren yeni fonksiyon
async function verileriYukle() {
    try {
        console.log("☁️ Google Firebase'den veriler çekiliyor...");
        const snapshot = await ref.once("value");
        const data = snapshot.val();
        
        if (data) {
            veritabani = data; // Google'da veri varsa yerel değişkenimize aktar
            console.log("✅ Veriler başarıyla senkronize edildi.");
        } else {
            console.log("🆕 Google'da veri bulunamadı, boş veritabanı hazırlandı.");
        }
    } catch (error) {
        console.error("❌ Google bağlantı hatası:", error);
    }
}
async function verileriKaydet() {
    try {
        // Veriyi hem dosyaya yaz (yedek olsun) hem de anında Google'a gönder
        fs.writeFileSync(DOSYA_ADI, JSON.stringify(veritabani, null, 2), 'utf-8');
        await ref.set(veritabani); 
        console.log("💾 Veriler Google Cloud'a yedeklendi.");
    } catch (error) {
        console.error("❌ Kayıt sırasında hata oluştu:", error);
    }
}

verileriYukle().then(() => {
    console.log("🚀 Sistem hazır ve veriler yüklendi.");
});
// ==================================================================
// 🌐 ENDPOINTLER
// ==================================================================

app.get('/', (req, res) => { res.send('Kalıcı Sunucu Aktif (Google Mail Modu) 🚀'); });

// Listeleri Getir
app.get('/ogrenciler', (req, res) => { res.json(veritabani.ogrenciler); });
app.get('/izinliler', (req, res) => { res.json(veritabani.ogrenciler.filter(o => o.durum === "IZINLI")); });
app.get('/hareketler', (req, res) => { res.json([...veritabani.hareketler].reverse()); });
app.get('/izin-talepleri', (req, res) => { res.json(veritabani.izinTalepleri.filter(t => t.durum === "BEKLIYOR")); });

// --- KAYIT OLMA ---
app.post('/kayit-ol', (req, res) => {
    const { ogrenciNo, sifre, email, tel } = req.body;
    let ogrenci = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo);

    if (ogrenci) {
        if (ogrenci.kayitliMi) return res.status(400).json({ basarili: false, mesaj: "⚠️ Zaten kayıtlısınız." });
    } else {
        const izinliVeri = veritabani.izinliNumaralar.find(n => n.numara === ogrenciNo);
        if (!izinliVeri) return res.status(404).json({ basarili: false, mesaj: "❌ Kayıt yetkiniz yok!" });

        ogrenci = {
            id: Date.now(),
            ogrenciNo: ogrenciNo,
            ad: izinliVeri.ad,
            sinif: izinliVeri.sinif || "-",
            oda: izinliVeri.oda || "-",
            durum: "DISARIDA",
            kayitliMi: false,
            sifre: null, email: null, tel: null, etutDurumu: "YOK"
        };
        veritabani.ogrenciler.push(ogrenci);
    }

    ogrenci.sifre = sifre;
    ogrenci.email = email;
    ogrenci.tel = tel;
    ogrenci.kayitliMi = true;
    verileriKaydet();

    console.log(`🆕 KAYIT: ${ogrenci.ad}`);
    res.json({ basarili: true, mesaj: `✅ Kayıt başarılı! Hoşgeldin ${ogrenci.ad}` });
});

// --- GİRİŞ YAPMA ---
app.post('/giris', (req, res) => {
    const { ogrenciNo, sifre } = req.body;
    const kullanici = veritabani.ogrenciler.find(o => o.ogrenciNo === ogrenciNo && o.sifre === sifre && o.kayitliMi === true);

    if (kullanici) {
        console.log(`🔑 Giriş: ${kullanici.ad}`);
        res.json({ basarili: true, ogrenci: kullanici });
    } else {
        res.status(401).json({ basarili: false, mesaj: "Hatalı bilgi veya kayıt yok!" });
    }
});

// ==================================================================
// 📧 MAİL GÖNDERME (ARTIK GOOGLE SCRIPT KULLANIYOR)
// ==================================================================
app.post('/sifre-kodu-gonder', async (req, res) => {
    const { email } = req.body;
    console.log(`📩 Mail isteği geldi: ${email}`);

    const kullanici = veritabani.ogrenciler.find(o => o.email === email && o.kayitliMi === true);

    if (!kullanici) {
        return res.status(404).json({ basarili: false, mesaj: "❌ Bu mail adresi sistemde kayıtlı değil." });
    }

    const dogrulamaKodu = Math.floor(1000 + Math.random() * 9000).toString();
    kullanici.resetKodu = dogrulamaKodu;
    verileriKaydet();

    const htmlIcerik = `
        <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
            <h3>Merhaba ${kullanici.ad},</h3>
            <p>Şifre sıfırlama kodunuz:</p>
            <h1 style="color: #2c3e50;">${dogrulamaKodu}</h1>
            <p>Bu kodu kimseyle paylaşmayınız.</p>
        </div>
    `;

    // 🚀 Yeni Fonksiyonu Çağırıyoruz
    const basarili = await googleMailGonder(email, "🔐 Şifre Sıfırlama Kodu", htmlIcerik);

    if (basarili) {
        res.json({ basarili: true, mesaj: "✅ Kod gönderildi." });
    } else {
        res.status(500).json({ basarili: false, mesaj: "Mail sunucusu hatası. Lütfen tekrar deneyin." });
    }
});

// --- ŞİFRE SIFIRLAMA ---
app.post('/sifre-sifirla', (req, res) => {
    const { email, kod, yeniSifre } = req.body;
    const kullanici = veritabani.ogrenciler.find(o => o.email === email);

    if (!kullanici) return res.status(404).json({ basarili: false, mesaj: "Kullanıcı bulunamadı." });
    if (kullanici.resetKodu !== kod) return res.status(400).json({ basarili: false, mesaj: "❌ Kod hatalı!" });

    kullanici.sifre = yeniSifre;
    kullanici.resetKodu = null;
    verileriKaydet();

    console.log(`🔐 Şifre değişti: ${kullanici.ad}`);
    res.json({ basarili: true, mesaj: "✅ Şifreniz değiştirildi." });
});

// --- TURNİKE ---
app.post('/yoklama', (req, res) => {
    console.log("📡 YOKLAMA:", req.body);
    const ogrenciId = req.body.ogrenciId || req.body.ogrenciNo;
    const kapiKodu = req.body.kapiKodu;

    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrenciId || o.ogrenciNo == ogrenciId);
    if (!ogrenci) return res.status(404).json({ basarili: false, mesaj: "Öğrenci bulunamadı" });

    // Etüt Kontrolü
    if (kapiKodu && kapiKodu.startsWith("ETUT_")) {
        if (ogrenci.etutDurumu === "VAR") return res.json({ basarili: true, mesaj: "✅ Zaten etüttesin.", yeniDurum: ogrenci.durum });
        ogrenci.etutDurumu = "VAR";
        verileriKaydet();
        return res.json({ basarili: true, mesaj: "📚 Etüt yazıldı!", yeniDurum: ogrenci.durum });
    } 
    else if (!kapiKodu || !kapiKodu.startsWith("YURT_")) {
        return res.status(400).json({ mesaj: "Geçersiz QR Kod!" });
    }

    // Spam Koruması
    const sonIslem = veritabani.hareketler ? veritabani.hareketler.find(h => h.ogrenciId == ogrenci.id) : null;
    if (sonIslem && sonIslem.timestamp && (Date.now() - sonIslem.timestamp < 3000)) {
        return res.json({ basarili: true, mesaj: "⏳ Çok hızlı okuttun.", yeniDurum: ogrenci.durum });
    }

    // Giriş/Çıkış Mantığı
    let yeniDurum = "YURTTA";
    let mesaj = "👋 Hoşgeldin";

    if (ogrenci.durum === "YURTTA") {
        const izin = veritabani.izinTalepleri ? veritabani.izinTalepleri.find(t => t.ogrenciId == ogrenci.id && t.durum === "ONAYLANDI") : null;
        if (izin) {
            yeniDurum = "IZINLI";
            mesaj = "👋 İzinli Çıkış";
            izin.durum = "KULLANILDI";
        } else {
            yeniDurum = "DISARIDA";
            mesaj = "👋 Güle Güle";
        }
    } else if (ogrenci.durum === "IZINLI") {
        mesaj = "👋 İzin Dönüşü Hoşgeldin";
    }

    ogrenci.durum = yeniDurum;
    if (!veritabani.hareketler) veritabani.hareketler = [];
    veritabani.hareketler.unshift({
        ogrenciId: ogrenci.id,
        isim: ogrenci.ad,
        durum_yeni: yeniDurum,
        zaman: new Date().toLocaleTimeString("tr-TR"),
        timestamp: Date.now()
    });

    verileriKaydet();
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
        verileriKaydet();
        res.json({ basarili: true, mesaj: "İletildi" });
    } catch (e) { res.status(500).json({ mesaj: "Hata" }); }
});

// --- İZİN İŞLEMİ ---
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
    verileriKaydet();
    res.json({ basarili: true, mesaj: "İşlem Tamam" });
});

app.get('/ogrenci-durum/:id', (req, res) => {
    const ogrId = req.params.id;
    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrId);
    if (ogrenci) {
        const izin = veritabani.izinTalepleri.find(t => t.ogrenciId == ogrId && t.durum === "ONAYLANDI");
        res.json({ durum: ogrenci.durum, izinOnaylandiMi: !!izin });
    } else { res.status(404).json({ mesaj: "Bulunamadı" }); }
});

app.post('/etut-sifirla', (req, res) => {
    veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
    verileriKaydet();
    res.json({ basarili: true, mesaj: "Etütler sıfırlandı." });
});

app.get('/belletmenler', (req, res) => {
    if (!veritabani.belletmenler || veritabani.belletmenler.length === 0) {
        veritabani.belletmenler = [
            { gun: "Pazartesi", erkek: "", kiz: "" },
            { gun: "Salı", erkek: "", kiz: "" },
            { gun: "Çarşamba", erkek: "", kiz: "" },
            { gun: "Perşembe", erkek: "", kiz: "" },
            { gun: "Cuma", erkek: "", kiz: "" },
            { gun: "Cumartesi", erkek: "", kiz: "" },
            { gun: "Pazar", erkek: "", kiz: "" }
        ];
        verileriKaydet();
    }
    res.json(veritabani.belletmenler);
});

app.post('/belletmen-guncelle', (req, res) => {
    const yeniListe = req.body;
    if (Array.isArray(yeniListe) && yeniListe.length === 7) {
        veritabani.belletmenler = yeniListe;
        verileriKaydet();
        res.json({ basarili: true, mesaj: "Liste güncellendi." });
    } else { res.status(400).json({ basarili: false, mesaj: "Format hatalı." }); }
});

app.get('/izinli-numaralar', (req, res) => { res.json(veritabani.izinliNumaralar); });

app.post('/izinli-numara-ekle', (req, res) => {
    const { numara, ad, sinif, oda } = req.body;
    if (!numara || !ad) return res.status(400).json({ basarili: false, mesaj: "Eksik bilgi" });
    if (veritabani.izinliNumaralar.find(n => n.numara === numara)) return res.status(400).json({ basarili: false, mesaj: "Zaten ekli" });

    veritabani.izinliNumaralar.push({
        id: Date.now().toString(), numara, ad, sinif, oda, eklenmeTarihi: new Date().toLocaleDateString()
    });
    verileriKaydet();
    res.json({ basarili: true, mesaj: "Eklendi" });
});

app.delete('/izinli-numara-sil/:id', (req, res) => {
    veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== req.params.id);
    verileriKaydet();
    res.json({ basarili: true, mesaj: "Silindi" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu Hazır: http://localhost:${PORT}`);
});


