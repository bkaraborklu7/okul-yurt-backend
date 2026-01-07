const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");

// ==================================================================
//  YAPILANDIRMA VE BAĞLANTI
// ==================================================================

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

// Global bellek değişkeni
let veritabani = {
    hareketler: [],
    izinTalepleri: [],
    izinliNumaralar: [],
    ogrenciler: [],
    belletmenler: [],
    yemekhaneKayitlari: [],
    etutKayitlari: []
};

// ==================================================================
//  VERİ SENKRONİZASYON FONKSİYONLARI
// ==================================================================

/**
 * Firebase'deki en güncel veriyi RAM'e (veritabani değişkenine) çeker.
 * Çoklu bilgisayar kullanımında veri hatasını engellemek için kritik POST'larda çağrılır.
 */
async function verileriYukle() {
    try {
        const snapshot = await ref.once("value");
        const data = snapshot.val();
        if (data) {
            veritabani = data;
            // Eksik tablo kontrolü (Hata önleyici)
            const tablolar = ["ogrenciler", "hareketler", "izinTalepleri", "izinliNumaralar", "belletmenler", "yemekhaneKayitlari", "etutKayitlari"];
            tablolar.forEach(t => { if (!veritabani[t]) veritabani[t] = []; });
        }
    } catch (error) {
        console.error(" Veri Çekme Hatası:", error);
    }
}

/**
 * RAM'deki güncel durumu Firebase'e kalıcı olarak yazar.
 */
async function verileriKaydet() {
    try {
        await ref.set(veritabani);
    } catch (error) {
        console.error(" Veri Kayıt Hatası:", error);
    }
}

// Sistem açılışında verileri bir kez yükle ve portu dinlemeye başla
verileriYukle().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Sunucu Hazır | Port: ${PORT}`);
    });
});

// ==================================================================
//  VERİ ÇEKME (GET) ENDPOINTLERİ
// ==================================================================

// Tüm listeleme işlemlerinde RAM'deki hazır veriyi döner (Hız odaklı)
app.get('/ogrenciler', (req, res) => res.json(veritabani.ogrenciler));
app.get('/izinli-numaralar', (req, res) => res.json(veritabani.izinliNumaralar));
app.get('/hareketler', (req, res) => res.json(veritabani.hareketler));
app.get('/izin-talepleri', (req, res) => res.json(veritabani.izinTalepleri));
app.get('/yemekhane-listesi', (req, res) => res.json(veritabani.yemekhaneKayitlari));
app.get('/belletmenler', (req, res) => res.json(veritabani.belletmenler));
app.get('/etut-listesi', (req, res) => res.json(veritabani.etutKayitlari));

// ==================================================================
//  KARTLI GEÇİŞ & YEMEKHANE MANTIĞI
// ==================================================================

app.post('/yemekhane-kart', async (req, res) => {
    const { kartId, kapiKodu } = req.body;
    await verileriYukle(); // Güncel listeyi al

    const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Tanımsız Kart!" });

    const bugun = new Date().toLocaleDateString("tr-TR");
    const suan = new Date().toLocaleTimeString("tr-TR");

    if (kapiKodu === "YEMEKHANE_GIRIS") {
        veritabani.yemekhaneKayitlari.unshift({
            ogrenciNo: kisi.ogrenciNo,
            isim: kisi.ad,
            tip: kisi.tip || "YURTÇU",
            girisSaati: suan,
            cikisSaati: "--:--",
            tarih: bugun
        });
        await verileriKaydet();
        return res.json({ basarili: true, mesaj: `Afiyet olsun, ${kisi.ad}!` });
    } 
    
    if (kapiKodu === "YEMEKHANE_CIKIS") {
        const kayit = veritabani.yemekhaneKayitlari.find(k => 
            k.ogrenciNo.toString() === kisi.ogrenciNo.toString() && k.tarih === bugun && k.cikisSaati === "--:--"
        );
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
    await verileriYukle(); // Başka bir pc'den yapılan güncellemeleri kaçırmamak için çekiyoruz
    
    const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kart Kayıtlı Değil!" });

    let yeniDurum = kisi.durum;
    let mesaj = "";

    // 1. ANA KAPI MANTIĞI
    if (kapiKodu === "ANA_GIRIS") {
        if (kisi.durum === "DISARIDA" || kisi.durum === "IZINLI") {
            yeniDurum = "OKULDA";
            mesaj = `Okula Giriş Yapıldı. Hoşgeldin ${kisi.ad}`;
        } else {
            const izin = veritabani.izinTalepleri.find(t => t.ogrenciId == kisi.id && t.durum === "ONAYLANDI");
            if (izin) {
                yeniDurum = "IZINLI";
                mesaj = "İzinli Çıkış Yapıldı";
                izin.durum = "KULLANILDI";
            } else {
                yeniDurum = "DISARIDA";
                mesaj = "Okuldan Çıkış Yapıldı. Güle Güle";
            }
        }
    }
    // 2. YURT KAPISI MANTIĞI
    else if (kapiKodu === "YURT_KAPI") {
        if (kisi.tip === "EVCİ") return res.status(403).json({ basarili: false, mesaj: "Evci öğrenciler yurda giremez!" });
        yeniDurum = (kisi.durum === "YURTTA") ? "OKULDA" : "YURTTA";
        mesaj = (yeniDurum === "YURTTA") ? "Yurda Giriş Yapıldı" : "Yurttan Çıkış Yapıldı";
    }
    // 3. ETÜT KAPISI MANTIĞI
    // 3. ETÜT KAPISI MANTIĞI (Revize Edildi)
else if (kapiKodu === "ETUT_KAPI") {
    if (kisi.tip !== "YURTÇU") return res.status(403).json({ basarili: false, mesaj: "Sadece yurtçular etüde girebilir." });
    
    kisi.etutDurumu = "VAR";
    yeniDurum = "ETÜTTE";
    mesaj = "Etüt Yoklaması Alındı";

    // KALICI KAYIT EKLEME:
    const bugun = new Date().toLocaleDateString("tr-TR");
    const suan = new Date().toLocaleTimeString("tr-TR");
    
    veritabani.etutKayitlari.unshift({
        ad: kisi.ad,
        ogrenciNo: kisi.ogrenciNo,
        sinif: kisi.sinif || "-",
        tarih: bugun,
        saat: suan
    });
}

    // Sonuçları Kaydet
    kisi.durum = yeniDurum;
    veritabani.hareketler.unshift({
        ogrenciId: kisi.id,
        isim: kisi.ad,
        tip: kisi.tip,
        durum_yeni: yeniDurum,
        mesaj: mesaj,
        kapi: kapiKodu,
        zaman: new Date().toLocaleTimeString("tr-TR"),
        timestamp: Date.now()
    });

    await verileriKaydet();
    res.json({ basarili: true, mesaj, yeniDurum });
});

// ==================================================================
//  İZİN & YÖNETİM İŞLEMLERİ
// ==================================================================

app.post('/izin-iste', async (req, res) => {
    const { ogrenciId, tur, aciklama, tarihBaslangic, tarihBitis } = req.body;
    await verileriYukle();
    const ogrenci = veritabani.ogrenciler.find(o => o.id == ogrenciId);
    veritabani.izinTalepleri.push({
        id: Date.now(),
        ogrenciId,
        isim: ogrenci ? ogrenci.ad : "Bilinmeyen",
        tur, aciklama, tarih: `${tarihBaslangic}-${tarihBitis}`, durum: "BEKLIYOR"
    });
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/izin-islem', async (req, res) => {
    const { talepId, islem } = req.body;
    await verileriYukle();
    const talep = veritabani.izinTalepleri.find(t => t.id == talepId);
    if (talep) {
        talep.durum = (islem === "ONAY") ? "ONAYLANDI" : "REDDEDILDI";
        await verileriKaydet();
        res.json({ basarili: true });
    } else {
        res.status(404).json({ basarili: false, mesaj: "Talep bulunamadı." });
    }
});

// ==================================================================
//  KAYIT & GİRİŞ & SİSTEM AYARLARI
// ==================================================================

app.post('/kayit-ol', async (req, res) => {
    try {
        const { ogrenciNo, email, tel, sifre } = req.body;
        await verileriYukle();
        const arananNo = ogrenciNo?.toString().trim() || "";

        const izinliBilgisi = veritabani.izinliNumaralar.find(n => (n.numara?.toString().trim()) === arananNo);
        if (!izinliBilgisi) return res.status(400).json({ basarili: false, mesaj: "Numara sistemde tanımlı değil!" });

        const zatenKayitli = veritabani.ogrenciler.find(o => (o.ogrenciNo?.toString().trim()) === arananNo);
        if (zatenKayitli) return res.status(400).json({ basarili: false, mesaj: "Bu numara zaten kayıtlı!" });

        veritabani.ogrenciler.push({
            id: Date.now(),
            ogrenciNo: arananNo,
            email, tel, sifre,
            ad: izinliBilgisi.ad,
            tip: izinliBilgisi.tip || "YURTÇU",
            sinif: izinliBilgisi.sinif || "-",
            oda: izinliBilgisi.oda || "-",
            kartId: izinliBilgisi.kartId || "",
            durum: "DISARIDA", etutDurumu: "YOK", kayitliMi: true
        });
        await verileriKaydet();
        res.json({ basarili: true, mesaj: "Kayıt başarılı!" });
    } catch (err) {
        res.status(500).json({ basarili: false, mesaj: "Sunucu hatası!" });
    }
});

app.post('/giris', async (req, res) => {
    await verileriYukle();
    const { ogrenciNo, sifre } = req.body;
    const arananNo = ogrenciNo?.toString().trim() || "";
    const arananSifre = sifre?.toString().trim() || "";

    const kullanici = veritabani.ogrenciler.find(o => 
        (o.ogrenciNo?.toString().trim()) === arananNo && (o.sifre?.toString().trim()) === arananSifre
    );

    if (kullanici) res.json({ basarili: true, ogrenci: kullanici });
    else res.status(401).json({ basarili: false, mesaj: "Hatalı Numara veya Şifre!" });
});

app.get('/ogrenci-durum/:id', async (req, res) => {
    const ogrenci = veritabani.ogrenciler.find(o => o.id.toString() === req.params.id.toString());
    if (!ogrenci) return res.status(404).json({ basarili: false });

    const bugun = new Date().toLocaleDateString("tr-TR");
    const yemekhanedeMi = veritabani.yemekhaneKayitlari.find(k => k.ogrenciNo === ogrenci.ogrenciNo && k.tarih === bugun && k.cikisSaati === "--:--");
    const izinVarMi = veritabani.izinTalepleri.find(t => t.ogrenciId.toString() === req.params.id.toString() && t.durum === "ONAYLANDI");

    res.json({ basarili: true, durum: ogrenci.durum, izinOnaylandiMi: !!izinVarMi, yemekhaneDurumu: !!yemekhanedeMi });
});
// Admin ve Sıfırlama Endpointleri
app.post('/admin-login', async (req, res) => {
    const snapshot = await ref.child("adminAyarlari").once("value");
    const adminData = snapshot.val() || { kullaniciAdi: "admin", sifre: "123456" };
    const { kullaniciAdi, sifre } = req.body;
    if (kullaniciAdi === adminData.kullaniciAdi && sifre === adminData.sifre) res.json({ basarili: true });
    else res.status(401).json({ basarili: false });
});

app.post('/etut-sifirla', async (req, res) => {
    veritabani.ogrenciler.forEach(o => o.etutDurumu = "YOK");
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/yemekhane-sifirla', async (req, res) => {
    veritabani.yemekhaneKayitlari = [];
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/izinli-numara-ekle', async (req, res) => {
    veritabani.izinliNumaralar.push({ id: Date.now().toString(), ...req.body });
    await verileriKaydet();
    res.json({ basarili: true });
});

app.delete('/izinli-numara-sil/:id', async (req, res) => {
    veritabani.izinliNumaralar = veritabani.izinliNumaralar.filter(n => n.id !== req.params.id);
    await verileriKaydet();
    res.json({ basarili: true });
});

app.post('/belletmen-guncelle', async (req, res) => {
    veritabani.belletmenler = req.body;
    await verileriKaydet();
    res.json({ basarili: true });
});







