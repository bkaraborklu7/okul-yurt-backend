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
//  GOOGLE İLE DOĞRULAMA KODU GÖNDERME
// ==================================================================
let dogrulamaKodlari = {}; 

// 1. AŞAMA: KOD ÜRET VE GOOGLE ÜZERİNDEN GÖNDER
app.post('/sifre-kodu-gonder', async (req, res) => {
    const { email } = req.body;
    const ogrenci = veritabani.ogrenciler.find(o => o.email === email);
    if (!ogrenci) {
        return res.status(404).json({ basarili: false, mesaj: "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı." });
    }
    // 4 haneli kod üret ve kaydet
    const kod = Math.floor(1000 + Math.random() * 9000).toString();
    dogrulamaKodlari[email] = kod;

    // Senin bulduğun fonksiyonu çağırıyoruz
    const mailGonderildi = await googleMailGonder(
        email, 
        "Yurt Sistemi Şifre Sıfırlama", 
        `Merhaba, şifre sıfırlama kodunuz: ${kod}. Bu kodu kimseyle paylaşmayın.`
    );

    if (mailGonderildi) {
        res.json({ basarili: true, mesaj: "Doğrulama kodu e-postanıza gönderildi!" });
    } else {
        res.status(500).json({ basarili: false, mesaj: "Mail gönderilirken bir sorun oluştu." });
    }
});

// 2. AŞAMA: KODU ONAYLA VE ŞİFREYİ DEĞİŞTİR
app.post('/sifre-sifirla', (req, res) => {
    const { email, kod, yeniSifre } = req.body;

    // Kod ve E-posta doğrulaması
    if (dogrulamaKodlari[email] && dogrulamaKodlari[email] === kod.toString()) {
        const ogrenciIndex = veritabani.ogrenciler.findIndex(o => o.email === email);
        
        if (ogrenciIndex !== -1) {
            veritabani.ogrenciler[ogrenciIndex].sifre = yeniSifre; // Şifreyi güncelle
            delete dogrulamaKodlari[email]; // Kodu sil
            return res.json({ basarili: true, mesaj: "Şifreniz başarıyla güncellendi!" });
        }
    }

    res.status(400).json({ basarili: false, mesaj: "Kod hatalı veya süresi dolmuş." });
});
async function googleMailGonder(aliciEmail, konu, icerikHtml) {
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNMTXMkyQNpAcdk8V5jNPDn97XmU2nflYO84moSUdVgmdoSaY84sWnNX6TxygvcW7cRg/exec";
    
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
        return sonuc.status === 'success';
    } catch (error) {
        console.error(" Fetch Bağlantı Hatası:", error);
        return false;
    }
}
// ==================================================================
//  VERİ SENKRONİZASYON FONKSİYONLARI
// ==================================================================
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
    try {
        const { kartId, kapiKodu } = req.body;
        await verileriYukle(); // Güncel listeyi al

        const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
        if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Tanımsız Kart!" });

        const bugun = new Date().toLocaleDateString("tr-TR");
        const suan = new Date().toLocaleTimeString("tr-TR");

        // --- ÇIKIŞ İŞLEMİ ---
        if (kapiKodu === "YEMEKHANE_CIKIS") {
            const kayit = veritabani.yemekhaneKayitlari.find(k => 
                k.ogrenciNo.toString() === kisi.ogrenciNo.toString() && 
                k.tarih === bugun && 
                k.cikisSaati === "--:--"
            );

            if (kayit) {
                kayit.cikisSaati = suan;
                // Eğer sınıfta bir değişiklik varsa güncelleyebiliriz:
                kayit.sinif = kisi.sinif || "-"; 
                
                await verileriKaydet();
                return res.json({ basarili: true, mesaj: `Güle güle, ${kisi.ad}!` });
            } else {
                return res.status(400).json({ basarili: false, mesaj: "Giriş kaydı bulunamadı!" });
            }
        } 
        
        // --- GİRİŞ İŞLEMİ ---
        else if (kapiKodu === "YEMEKHANE_GIRIS") {
            if (!veritabani.yemekhaneKayitlari) {
            veritabani.yemekhaneKayitlari = [];
             }
            veritabani.yemekhaneKayitlari.unshift({
                ogrenciNo: kisi.ogrenciNo,
                isim: kisi.ad,
                tip: kisi.tip || "YURTÇU",
                sinif: kisi.sinif || "-",
                girisSaati: suan,
                cikisSaati: "--:--",
                tarih: bugun
            });
            await verileriKaydet();
            return res.json({ basarili: true, mesaj: `Afiyet olsun, ${kisi.ad}!` });
        }

        // Kapı kodu ikisi de değilse
        return res.status(400).json({ basarili: false, mesaj: "Geçersiz kapı kodu!" });

    } catch (error) {
        console.error("Yemekhane Hatası:", error);
        return res.status(500).json({ basarili: false, mesaj: "Sunucu hatası oluştu." });
    }
});

app.post('/yoklama-kart', async (req, res) => {
    const { kartId, kapiKodu } = req.body;
    await verileriYukle(); // Başka bir pc'den yapılan güncellemeleri kaçırmamak için çekiyoruz
    
    const kisi = veritabani.ogrenciler.find(o => o.kartId === kartId);
    if (!kisi) return res.status(404).json({ basarili: false, mesaj: "Kart Kayıtlı Değil!" });
    const bugun = new Date().toLocaleDateString("tr-TR");
    const suan = new Date().toLocaleTimeString("tr-TR");

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
else if (kapiKodu === "ETUT_KAPI") {
    if (kisi.tip !== "YURTÇU") return res.status(403).json({ basarili: false, mesaj: "Sadece yurtçular etüde girebilir." });
    
    kisi.etutDurumu = "VAR";
    yeniDurum = "ETÜTTE";
    mesaj = "Etüt Yoklaması Alındı";

    // KALICI KAYIT EKLEME:
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
        zaman: `${bugun} ${suan}`,
        tarih: bugun,
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

app.post('/izin-onay', async (req, res) => {
    try {
        const { id, islem } = req.body;
        await verileriYukle();

        // İzin talebini ID üzerinden bul
        const talep = veritabani.izinTalepleri.find(t => t.id.toString() === id.toString());

        if (talep) {
            talep.durum = islem === 'ONAY' ? 'ONAYLANDI' : 'REDDEDILDI';
            await verileriKaydet();
            return res.json({ basarili: true, mesaj: "İşlem tamamlandı." });
        } else {
            return res.status(404).json({ basarili: false, mesaj: "Talep bulunamadı." });
        }
    } catch (error) {
        console.error("İzin onay hatası:", error);
        res.status(500).json({ basarili: false, mesaj: "Sunucu hatası." });
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
















