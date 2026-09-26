// Endpoint URL Apps Script Anda
const GAS_ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbyH6JqClMv4W4Pt5pew2jk7bovgVpGbQI7wOzr-zIjxDFW3mHzUM7GcZ79GWQf-RuqU/exec";

// Master Checklist Item Sesuai PRD
const CHECKLIST_CONFIG = {
  mesin: [
    "Volume & Kondisi Oli Mesin",
    "Air Radiator / Coolant Reservoir",
    "Minyak Rem & Minyak Kopling",
    "Indikasi Kebocoran Fluida / Rembesan",
    "Suara & Getaran Mesin saat Idle"
  ],
  depan: [
    "Lampu Utama (Jauh / Dekat) & Foglamp",
    "Lampu Sein & Lampu Hazard Depan",
    "Kondisi Kaca Depan & Fungsi Wiper",
    "Kondisi Bumper Depan & Grille"
  ],
  samping: [
    "Kaca Spion (Fisik & Pengaturan)",
    "Tekanan & Ketebalan Ban Depan & Belakang",
    "Bodi Samping (Goresan / Penyok / Karat)"
  ],
  belakang: [
    "Lampu Rem, Lampu Mundur, & Lampu Plat Nomor",
    "Bumper Belakang & Pintu Bagasi",
    "Kondisi Ban Cadangan (Serep) & Knalpot"
  ]
};

let rawInspectionData = [];
let compressedBase64Image = "";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  renderChecklistInputs();
  setDefaultDateTime();
  initImageCompression();
  bindFormEvents();
  loadData(); // Memanggil sinkronisasi Google Sheets
});

// 1. Theme Switcher
function initTheme() {
  const toggleBtn = document.getElementById("themeToggleBtn");
  const icon = document.getElementById("themeIcon");
  const savedTheme = localStorage.getItem("fc_theme") || "light";

  document.body.className = savedTheme;
  icon.textContent = savedTheme === "dark" ? "☀️" : "🌙";

  toggleBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    const current = isDark ? "dark" : "light";
    document.body.classList.remove(isDark ? "light" : "dark");
    document.body.classList.add(current);
    icon.textContent = isDark ? "☀️" : "🌙";
    localStorage.setItem("fc_theme", current);
  });
}

// 2. Tab Navigation
function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");

      if (btn.dataset.tab === "tab-cetak") populateCetakOptions();
    });
  });
}

// 3. Render Dinamis Checklist & Toggle Status
function renderChecklistInputs() {
  Object.keys(CHECKLIST_CONFIG).forEach(category => {
    const container = document.getElementById(`checklist-${category}`);
    if (!container) return;

    CHECKLIST_CONFIG[category].forEach((item, index) => {
      const fieldId = `${category}_${index}`;
      const div = document.createElement("div");
      div.className = "check-item";
      div.innerHTML = `
        <div class="item-header">${item}</div>
        <div class="item-actions">
          <label class="chip safe selected">
            <input type="radio" name="${fieldId}_status" value="Aman" checked> Aman
          </label>
          <label class="chip danger">
            <input type="radio" name="${fieldId}_status" value="Perlu Perbaikan"> Perlu Perbaikan
          </label>
        </div>
        <input type="text" id="${fieldId}_note" class="notes-input hidden" placeholder="Catatan kerusakan (wajib)...">
      `;

      const chips = div.querySelectorAll(".chip");
      const noteInput = div.querySelector(".notes-input");

      chips.forEach(chip => {
        chip.addEventListener("click", () => {
          chips.forEach(c => c.classList.remove("selected"));
          chip.classList.add("selected");
          const val = chip.querySelector("input").value;
          if (val === "Perlu Perbaikan") {
            noteInput.classList.remove("hidden");
            noteInput.required = true;
          } else {
            noteInput.classList.add("hidden");
            noteInput.required = false;
            noteInput.value = "";
          }
        });
      });

      container.appendChild(div);
    });
  });
}

function setDefaultDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - offset)).toISOString().slice(0, 16);
  document.getElementById("checkinDate").value = localISOTime;
}

// 4. Kompresi Gambar
function initImageCompression() {
  const input = document.getElementById("fotoInput");
  const previewBox = document.getElementById("previewContainer");
  const imgPreview = document.getElementById("imagePreview");

  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        compressedBase64Image = canvas.toDataURL("image/jpeg", 0.75);
        imgPreview.src = compressedBase64Image;
        previewBox.classList.remove("hidden");
      };
    };
    reader.readAsDataURL(file);
  });
}

// 5. Submit Form & Simpan
function bindFormEvents() {
  const form = document.getElementById("checkinForm");
  const btnSubmit = document.getElementById("btnSubmit");

  document.getElementById("nopolInput").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Mengunggah & Menyimpan...";

    const details = [];
    let summaryStatus = "Aman";

    Object.keys(CHECKLIST_CONFIG).forEach(category => {
      CHECKLIST_CONFIG[category].forEach((item, index) => {
        const fieldId = `${category}_${index}`;
        const status = form.querySelector(`input[name="${fieldId}_status"]:checked`).value;
        const note = document.getElementById(`${fieldId}_note`).value;
        if (status === "Perlu Perbaikan") summaryStatus = "Perlu Perbaikan";
        
        details.push({ item, status, note });
      });
    });

    const payload = {
      tanggal_checkin: document.getElementById("checkinDate").value,
      nopol: document.getElementById("nopolInput").value,
      checker: document.getElementById("checkerName").value,
      odometer: document.getElementById("odometer").value,
      ringkasan_status: summaryStatus,
      detail_checklist: JSON.stringify(details),
      foto_base64: compressedBase64Image
    };

    try {
      await fetch(GAS_ENDPOINT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      saveLocalData(payload);
      alert("Check-in berhasil disimpan!");

      form.reset();
      document.getElementById("previewContainer").classList.add("hidden");
      compressedBase64Image = "";
      setDefaultDateTime();
      loadData();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan data ke sistem.");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerText = "Simpan Check-in";
    }
  });

  document.getElementById("searchKeyword").addEventListener("input", filterRekapData);
  document.getElementById("filterStatus").addEventListener("change", filterRekapData);
  document.getElementById("filterDate").addEventListener("change", filterRekapData);
  
  document.getElementById("closeModalBtn").onclick = () => {
    document.getElementById("detailModal").classList.add("hidden");
  };

  document.getElementById("btnPrintUnit").addEventListener("click", () => {
    const selectedIdx = document.getElementById("selectUnitCetak").value;
    const item = rawInspectionData[selectedIdx];
    if (item) renderPrintLayout(item);
  });
}

function saveLocalData(data) {
  const local = JSON.parse(localStorage.getItem("fc_records") || "[]");
  local.unshift(data);
  localStorage.setItem("fc_records", JSON.stringify(local));
}

// 6. Sinkronisasi Data dari Google Sheets
async function loadData() {
  const listContainer = document.getElementById("rekapList");

  // 1. Tampilkan data lokal terlebih dahulu jika ada
  rawInspectionData = JSON.parse(localStorage.getItem("fc_records") || "[]");
  filterRekapData();

  // 2. Fetch data online dari Google Sheets via doGet
  if (listContainer && rawInspectionData.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding:1.5rem; font-size:0.85rem; color:var(--text-muted);">Memuat riwayat dari Google Sheets...</div>`;
  }

  try {
    const response = await fetch(GAS_ENDPOINT_URL);
    const res = await response.json();

    if (res.status === "success" && Array.isArray(res.data)) {
      // Urutkan dari data paling baru
      rawInspectionData = res.data.reverse();
      localStorage.setItem("fc_records", JSON.stringify(rawInspectionData));
      filterRekapData();
    }
  } catch (err) {
    console.warn("Gagal terhubung ke Google Sheets, menggunakan data tersimpan:", err);
  }
}

// 7. Pencarian & Filter Rekap
function filterRekapData() {
  const q = document.getElementById("searchKeyword").value.toLowerCase();
  const statusFilter = document.getElementById("filterStatus").value;
  const dateFilter = document.getElementById("filterDate").value;
  const listContainer = document.getElementById("rekapList");
  listContainer.innerHTML = "";

  const filtered = rawInspectionData.filter(d => {
    const nopolStr = (d.nopol || "").toLowerCase();
    const checkerStr = (d.checker || "").toLowerCase();
    const matchQ = nopolStr.includes(q) || checkerStr.includes(q);
    const matchStatus = statusFilter === "ALL" || 
      (statusFilter === "AMAN" && d.ringkasan_status === "Aman") ||
      (statusFilter === "PERBAIKAN" && d.ringkasan_status === "Perlu Perbaikan");
    const matchDate = !dateFilter || (d.tanggal_checkin && d.tanggal_checkin.startsWith(dateFilter));
    return matchQ && matchStatus && matchDate;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding:1.5rem; font-size:0.85rem; color:var(--text-muted);">Tidak ada data inspeksi ditemukan.</div>`;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "history-card";
    const isSafe = item.ringkasan_status === "Aman";
    card.innerHTML = `
      <div>
        <strong>${item.nopol}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted);">${(item.tanggal_checkin || "").replace("T", " ")}</div>
        <div style="font-size:0.75rem; margin-top:2px;">Checker: ${item.checker}</div>
      </div>
      <div>
        <span class="badge ${isSafe ? 'badge-safe' : 'badge-danger'}">
          ${item.ringkasan_status}
        </span>
      </div>
    `;
    card.onclick = () => openDetailModal(item);
    listContainer.appendChild(card);
  });
}

// 8. Tampilkan Detail Modal (Dukungan Link Drive & Base64)
function openDetailModal(item) {
  const modal = document.getElementById("detailModal");
  document.getElementById("modalNopol").innerText = `${item.nopol} - Detail Inspeksi`;
  const body = document.getElementById("modalBody");
  
  let details = [];
  try {
    details = typeof item.detail_checklist === "string" ? JSON.parse(item.detail_checklist) : item.detail_checklist;
  } catch (e) {
    details = [];
  }
  
  let detailsHtml = (details || []).map(d => `
    <div style="padding: 6px 0; border-bottom: 1px solid var(--border-color); font-size: 0.8rem;">
      <strong>${d.item}</strong>: 
      <span style="color: ${d.status === 'Aman' ? 'var(--color-safe)' : 'var(--color-danger)'}; font-weight:600;">
        ${d.status}
      </span>
      ${d.note ? `<p style="color:var(--text-muted); margin-top:2px;">Keterangan: ${d.note}</p>` : ''}
    </div>
  `).join("");

  let fotoHtml = "";
  if (item.foto_base64) {
    fotoHtml = `<img src="${item.foto_base64}" style="width:100%; border-radius:8px; margin-top:10px;" alt="Kondisi Unit"/>`;
  } else if (item.foto_drive_url) {
    fotoHtml = `
      <div style="margin-top:12px;">
        <a href="${item.foto_drive_url}" target="_blank" style="color:var(--accent-color); font-size:0.85rem; font-weight:600; text-decoration:none;">
          🔗 Buka Foto di Google Drive
        </a>
      </div>`;
  }

  body.innerHTML = `
    <p style="font-size:0.8rem; margin-bottom: 8px;"><strong>Waktu:</strong> ${(item.tanggal_checkin || "").replace("T", " ")} | <strong>Odo:</strong> ${item.odometer} KM</p>
    <div style="max-height: 250px; overflow-y:auto; margin-bottom: 10px;">${detailsHtml}</div>
    ${fotoHtml}
  `;
  modal.classList.remove("hidden");
}

function populateCetakOptions() {
  const select = document.getElementById("selectUnitCetak");
  select.innerHTML = "";
  rawInspectionData.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.innerText = `${d.nopol} - ${(d.tanggal_checkin || "").slice(0, 10)}`;
    select.appendChild(opt);
  });
}

// 9. Format Cetak Lembar Unit
function renderPrintLayout(data) {
  const container = document.getElementById("printableArea");
  let details = [];
  try {
    details = typeof data.detail_checklist === "string" ? JSON.parse(data.detail_checklist) : data.detail_checklist;
  } catch (e) {
    details = [];
  }

  let tableRows = (details || []).map((d, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${d.item}</td>
      <td>${d.status}</td>
      <td>${d.note || '-'}</td>
    </tr>
  `).join("");

  let fotoPrint = "";
  if (data.foto_base64) {
    fotoPrint = `<div style="margin-top: 15px;"><strong>Dokumentasi Fisik Unit:</strong><br><img src="${data.foto_base64}" style="max-height: 200px; border: 1px solid #CCC; margin-top: 5px;"></div>`;
  } else if (data.foto_drive_url) {
    fotoPrint = `<div style="margin-top: 10px; font-size:11px;"><strong>Lampiran Foto (Drive):</strong> ${data.foto_drive_url}</div>`;
  }

  container.innerHTML = `
    <div class="print-header">
      <h2>LEMBAR CHECK-IN & KELAYAKAN ARMADA</h2>
      <p style="font-size: 11px;">Fleet Operations & Maintenance System</p>
    </div>
    
    <table style="border: none; margin-bottom: 10px;">
      <tr style="border: none;">
        <td style="border: none; width: 50%;"><strong>No. Polisi:</strong> ${data.nopol}</td>
        <td style="border: none; width: 50%;"><strong>Odometer:</strong> ${data.odometer} KM</td>
      </tr>
      <tr style="border: none;">
        <td style="border: none;"><strong>Tanggal/Waktu:</strong> ${(data.tanggal_checkin || "").replace("T", " ")}</td>
        <td style="border: none;"><strong>Petugas Checker:</strong> ${data.checker}</td>
      </tr>
    </table>

    <table>
      <thead>
        <tr style="background: #EEE;">
          <th style="width: 30px;">No</th>
          <th>Komponen Diperiksa</th>
          <th style="width: 120px;">Kondisi</th>
          <th>Catatan Lapangan</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    ${fotoPrint}

    <div class="signatures">
      <div class="sign-col">
        <p>Petugas Pemeriksa</p>
        <br><br><br>
        <p>( ${data.checker} )</p>
      </div>
      <div class="sign-col">
        <p>Supervisor Operasional</p>
        <br><br><br>
        <p>( .................................... )</p>
      </div>
    </div>
  `;

  window.print();
}
