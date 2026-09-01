/* ==================================================================
   INVENTARIS RUANGAN — APPLICATION SCRIPT
   Struktur:
   1. UTILITY FUNCTIONS
   2. DATA MANAGEMENT (LocalStorage CRUD)
   3. STATISTICS
   4. FORM MANAGEMENT
   5. FILTER & SEARCH
   6. UI MANAGEMENT (rendering)
   7. MODAL (confirmation)
   8. TOAST NOTIFICATION
   9. EXPORT / IMPORT
   10. DARK MODE
   11. PWA (install prompt & service worker)
   12. INIT
   ================================================================== */

(function () {
  "use strict";

  /* ================================================================
     1. UTILITY FUNCTIONS
     ================================================================ */

  const STORAGE_KEY = "inventarisRuangan";
  const THEME_KEY = "inventarisTheme";

  /** Format angka menjadi Rupiah, contoh: 2500000 -> "Rp2.500.000" */
  function formatRupiah(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  }

  /** Format angka biasa dengan pemisah ribuan ala Indonesia */
  function formatNumber(value) {
    return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
  }

  /** Cegah HTML injection dengan meng-escape karakter berbahaya */
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  /** Ambil hanya digit dari sebuah string (untuk parsing input harga) */
  function digitsOnly(str) {
    return String(str ?? "").replace(/[^0-9]/g, "");
  }

  /** Generate ID unik berbasis timestamp + random */
  function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  /** Debounce sederhana untuk input pencarian */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ================================================================
     2. DATA MANAGEMENT (LocalStorage CRUD)
     ================================================================ */

  /** Ambil seluruh data inventaris dari LocalStorage */
  function getAllItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Gagal membaca data inventaris:", err);
      return [];
    }
  }

  /** Simpan seluruh data inventaris ke LocalStorage */
  function saveAllItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (err) {
      console.error("Gagal menyimpan data inventaris:", err);
      showToast("error", "Gagal menyimpan data. Penyimpanan penuh atau bermasalah.");
      return false;
    }
  }

  /** Tambah item baru */
  function createItem(data) {
    const items = getAllItems();
    const newItem = {
      id: generateId(),
      nama: data.nama,
      kode: data.kode,
      ruangan: data.ruangan,
      jumlah: data.jumlah,
      harga: data.harga,
      kondisi: data.kondisi,
    };
    items.push(newItem);
    saveAllItems(items);
    return newItem;
  }

  /** Perbarui item berdasarkan id */
  function updateItem(id, data) {
    const items = getAllItems();
    const idx = items.findIndex((it) => String(it.id) === String(id));
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...data };
    saveAllItems(items);
    return items[idx];
  }

  /** Hapus item berdasarkan id */
  function deleteItem(id) {
    const items = getAllItems();
    const filtered = items.filter((it) => String(it.id) !== String(id));
    saveAllItems(filtered);
    return filtered;
  }

  /** Hapus seluruh data */
  function resetAllItems() {
    saveAllItems([]);
  }

  /* ================================================================
     3. STATISTICS
     ================================================================ */

  /** Animasi menghitung angka dari 0 (atau nilai sebelumnya) ke nilai target */
  function animateCounter(el, targetValue, opts = {}) {
    const isCurrency = !!opts.currency;
    const duration = 700;
    const startValue = Number(el.dataset.count) || 0;
    const startTime = performance.now();

    // Hormati preferensi reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      el.dataset.count = targetValue;
      el.textContent = isCurrency ? formatRupiah(targetValue) : formatNumber(targetValue);
      return;
    }

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(startValue + (targetValue - startValue) * eased);
      el.textContent = isCurrency ? formatRupiah(current) : formatNumber(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.dataset.count = targetValue;
        el.textContent = isCurrency ? formatRupiah(targetValue) : formatNumber(targetValue);
      }
    }
    requestAnimationFrame(tick);
  }

  /** Hitung dan tampilkan statistik dashboard */
  function renderStatistics() {
    const items = getAllItems();

    const totalBarang = items.reduce((sum, it) => sum + Number(it.jumlah || 0), 0);
    const kondisiBaik = items
      .filter((it) => it.kondisi === "Baik")
      .reduce((sum, it) => sum + Number(it.jumlah || 0), 0);
    const barangRusak = items
      .filter((it) => it.kondisi === "Rusak Ringan" || it.kondisi === "Rusak Berat")
      .reduce((sum, it) => sum + Number(it.jumlah || 0), 0);
    const totalNilai = items.reduce(
      (sum, it) => sum + Number(it.jumlah || 0) * Number(it.harga || 0),
      0
    );

    animateCounter(document.getElementById("statTotalBarang"), totalBarang);
    animateCounter(document.getElementById("statKondisiBaik"), kondisiBaik);
    animateCounter(document.getElementById("statBarangRusak"), barangRusak);
    animateCounter(document.getElementById("statTotalNilai"), totalNilai, { currency: true });
  }

  /* ================================================================
     4. FORM MANAGEMENT
     ================================================================ */

  const form = document.getElementById("inventarisForm");
  const itemIdInput = document.getElementById("itemId");
  const namaBarangInput = document.getElementById("namaBarang");
  const kodeInventarisInput = document.getElementById("kodeInventaris");
  const namaRuanganInput = document.getElementById("namaRuangan");
  const jumlahBarangInput = document.getElementById("jumlahBarang");
  const hargaSatuanInput = document.getElementById("hargaSatuan");
  const kondisiBarangSelect = document.getElementById("kondisiBarang");
  const formTitle = document.getElementById("formTitle");
  const btnSubmit = document.getElementById("btnSubmit");
  const btnCancel = document.getElementById("btnCancel");
  const formSection = document.getElementById("formSection");

  let isEditMode = false;

  /** Format tampilan input harga sebagai Rupiah saat mengetik, tanpa merusak nilai numerik */
  function handleHargaInput(e) {
    const digits = digitsOnly(e.target.value);
    if (!digits) {
      e.target.value = "";
      toggleHasValue(e.target);
      return;
    }
    e.target.value = "Rp" + formatNumber(digits);
    e.target.dataset.rawValue = digits;
    toggleHasValue(e.target);
  }

  /** Tandai input agar floating label naik walau browser tidak mendukung :placeholder-shown dengan baik */
  function toggleHasValue(input) {
    if (input.value) input.classList.add("has-value");
    else input.classList.remove("has-value");
  }

  /** Tampilkan pesan error pada sebuah field */
  function setFieldError(fieldId, message) {
    const errorEl = document.getElementById("err" + capitalize(fieldId));
    const group = document.getElementById(fieldId).closest(".field-group");
    if (!errorEl || !group) return;
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.add("show");
      group.classList.add("has-error");
    } else {
      errorEl.textContent = "";
      errorEl.classList.remove("show");
      group.classList.remove("has-error");
    }
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function clearAllFieldErrors() {
    ["namaBarang", "kodeInventaris", "namaRuangan", "jumlahBarang", "hargaSatuan", "kondisiBarang"].forEach(
      (id) => setFieldError(id, "")
    );
  }

  /** Validasi seluruh form, mengembalikan objek { valid, data } */
  function validateForm() {
    clearAllFieldErrors();
    let valid = true;
    const data = {};

    const nama = namaBarangInput.value.trim();
    if (!nama) {
      setFieldError("namaBarang", "Nama barang tidak boleh kosong.");
      valid = false;
    }
    data.nama = nama;

    const kode = kodeInventarisInput.value.trim();
    if (!kode) {
      setFieldError("kodeInventaris", "Kode inventaris tidak boleh kosong.");
      valid = false;
    }
    data.kode = kode;

    const ruangan = namaRuanganInput.value.trim();
    if (!ruangan) {
      setFieldError("namaRuangan", "Nama ruangan tidak boleh kosong.");
      valid = false;
    }
    data.ruangan = ruangan;

    const jumlah = Number(jumlahBarangInput.value);
    if (!jumlahBarangInput.value || isNaN(jumlah) || jumlah <= 0) {
      setFieldError("jumlahBarang", "Jumlah harus lebih dari 0.");
      valid = false;
    }
    data.jumlah = jumlah;

    const hargaRaw = hargaSatuanInput.dataset.rawValue || digitsOnly(hargaSatuanInput.value);
    const harga = Number(hargaRaw);
    if (!hargaRaw || isNaN(harga) || harga < 0) {
      setFieldError("hargaSatuan", "Harga tidak boleh negatif atau kosong.");
      valid = false;
    }
    data.harga = harga;

    const kondisi = kondisiBarangSelect.value;
    if (!kondisi) {
      setFieldError("kondisiBarang", "Kondisi wajib dipilih.");
      valid = false;
    }
    data.kondisi = kondisi;

    return { valid, data };
  }

  /** Reset form ke kondisi kosong / mode tambah */
  function resetForm() {
    form.reset();
    itemIdInput.value = "";
    isEditMode = false;
    formTitle.textContent = "Tambah Inventaris";
    btnSubmit.querySelector(".btn-label").textContent = "Simpan";
    btnCancel.hidden = true;
    clearAllFieldErrors();
    delete hargaSatuanInput.dataset.rawValue;
    [namaBarangInput, kodeInventarisInput, namaRuanganInput, jumlahBarangInput, hargaSatuanInput].forEach(
      toggleHasValue
    );
  }

  /** Masuk ke mode edit dan mengisi form dengan data item */
  function enterEditMode(item) {
    isEditMode = true;
    itemIdInput.value = item.id;
    namaBarangInput.value = item.nama;
    kodeInventarisInput.value = item.kode;
    namaRuanganInput.value = item.ruangan;
    jumlahBarangInput.value = item.jumlah;
    hargaSatuanInput.value = "Rp" + formatNumber(item.harga);
    hargaSatuanInput.dataset.rawValue = String(item.harga);
    kondisiBarangSelect.value = item.kondisi;

    [namaBarangInput, kodeInventarisInput, namaRuanganInput, jumlahBarangInput, hargaSatuanInput].forEach(
      toggleHasValue
    );

    formTitle.textContent = "Edit Inventaris";
    btnSubmit.querySelector(".btn-label").textContent = "Update Data";
    btnCancel.hidden = false;
    clearAllFieldErrors();

    // Scroll halus ke form & highlight sementara
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
    formSection.classList.remove("form-glow");
    // force reflow supaya animasi bisa diulang
    void formSection.offsetWidth;
    formSection.classList.add("form-glow");
  }

  /** Tampilkan loading singkat pada tombol submit */
  function setSubmitLoading(loading) {
    const label = btnSubmit.querySelector(".btn-label");
    const spinner = btnSubmit.querySelector(".btn-spinner");
    btnSubmit.disabled = loading;
    spinner.hidden = !loading;
    label.style.opacity = loading ? "0.6" : "1";
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const { valid, data } = validateForm();
    if (!valid) {
      formSection.classList.add("shake");
      setTimeout(() => formSection.classList.remove("shake"), 400);
      return;
    }

    setSubmitLoading(true);

    // Simulasikan proses simpan singkat agar animasi loading terasa halus
    setTimeout(() => {
      if (isEditMode) {
        updateItem(itemIdInput.value, data);
        showToast("success", "Data berhasil diperbarui");
      } else {
        createItem(data);
        showToast("success", "Data berhasil ditambahkan");
      }

      setSubmitLoading(false);
      resetForm();
      renderAll();
    }, 450);
  }

  /* ================================================================
     5. FILTER & SEARCH
     ================================================================ */

  const searchInput = document.getElementById("searchInput");
  const filterRuanganSelect = document.getElementById("filterRuangan");
  const filterKondisiSelect = document.getElementById("filterKondisi");
  const ruanganDatalist = document.getElementById("ruanganList");

  /** Isi ulang opsi filter ruangan berdasarkan data yang ada */
  function refreshRuanganOptions() {
    const items = getAllItems();
    const ruanganSet = [...new Set(items.map((it) => it.ruangan).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "id")
    );

    const currentValue = filterRuanganSelect.value;
    filterRuanganSelect.innerHTML = '<option value="">Semua Ruangan</option>';
    ruanganSet.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      filterRuanganSelect.appendChild(opt);
    });
    if (ruanganSet.includes(currentValue)) filterRuanganSelect.value = currentValue;

    ruanganDatalist.innerHTML = "";
    ruanganSet.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      ruanganDatalist.appendChild(opt);
    });
  }

  /** Ambil data yang sudah difilter berdasarkan pencarian & filter aktif */
  function getFilteredItems() {
    const items = getAllItems();
    const query = searchInput.value.trim().toLowerCase();
    const ruangan = filterRuanganSelect.value;
    const kondisi = filterKondisiSelect.value;

    return items.filter((it) => {
      const matchQuery =
        !query ||
        it.nama.toLowerCase().includes(query) ||
        it.kode.toLowerCase().includes(query);
      const matchRuangan = !ruangan || it.ruangan === ruangan;
      const matchKondisi = !kondisi || it.kondisi === kondisi;
      return matchQuery && matchRuangan && matchKondisi;
    });
  }

  /* ================================================================
     6. UI MANAGEMENT (rendering)
     ================================================================ */

  const itemGrid = document.getElementById("itemGrid");
  const emptyState = document.getElementById("emptyState");

  function conditionBadgeClass(kondisi) {
    if (kondisi === "Baik") return "badge-baik";
    if (kondisi === "Rusak Ringan") return "badge-ringan";
    return "badge-berat";
  }

  /** Buat markup HTML untuk satu kartu item (dengan data ter-escape) */
  function buildItemCardHTML(item, index) {
    const total = Number(item.jumlah) * Number(item.harga);
    const delay = Math.min(index * 0.06, 0.6);
    return `
      <article class="item-card" style="--delay:${delay}s" data-id="${item.id}">
        <div class="item-card-top">
          <div>
            <h3 class="item-name">${escapeHTML(item.nama)}</h3>
            <span class="item-code">${escapeHTML(item.kode)}</span>
          </div>
          <span class="badge ${conditionBadgeClass(item.kondisi)}">${escapeHTML(item.kondisi.toUpperCase())}</span>
        </div>

        <dl class="item-detail-grid">
          <div class="item-detail">
            <dt>Ruangan</dt>
            <dd>${escapeHTML(item.ruangan)}</dd>
          </div>
          <div class="item-detail">
            <dt>Jumlah</dt>
            <dd>${formatNumber(item.jumlah)} barang</dd>
          </div>
          <div class="item-detail">
            <dt>Harga Satuan</dt>
            <dd>${formatRupiah(item.harga)}</dd>
          </div>
          <div class="item-detail item-detail-full">
            <dt>Total Nilai</dt>
            <dd>${formatRupiah(total)}</dd>
          </div>
        </dl>

        <div class="item-card-actions">
          <button type="button" class="btn btn-sm btn-edit" data-action="edit" data-id="${item.id}">✏️ Edit</button>
          <button type="button" class="btn btn-sm btn-delete" data-action="delete" data-id="${item.id}">🗑️ Hapus</button>
        </div>
      </article>
    `;
  }

  /** Render daftar inventaris sesuai filter aktif */
  function renderItemList() {
    const filtered = getFilteredItems();

    if (filtered.length === 0) {
      itemGrid.innerHTML = "";
      itemGrid.hidden = true;
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    itemGrid.hidden = false;
    itemGrid.innerHTML = filtered.map((item, i) => buildItemCardHTML(item, i)).join("");
  }

  /** Render semuanya: statistik, filter ruangan, dan daftar item */
  function renderAll() {
    renderStatistics();
    refreshRuanganOptions();
    renderItemList();
  }

  /** Delegasi klik untuk tombol edit/hapus di dalam grid item */
  function handleItemGridClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "edit") {
      const item = getAllItems().find((it) => String(it.id) === String(id));
      if (item) enterEditMode(item);
    } else if (action === "delete") {
      openConfirmModal({
        title: "Hapus Inventaris?",
        desc: "Apakah Anda yakin ingin menghapus data ini?<br />Data yang dihapus tidak dapat dikembalikan.",
        icon: "⚠️",
        confirmLabel: "Ya, Hapus",
        onConfirm: () => performDeleteWithAnimation(id),
      });
    }
  }

  /** Hapus item dengan animasi keluar terlebih dahulu, baru dihapus dari storage */
  function performDeleteWithAnimation(id) {
    const card = itemGrid.querySelector(`.item-card[data-id="${id}"]`);
    if (!card) {
      deleteItem(id);
      renderAll();
      showToast("success", "Data berhasil dihapus");
      return;
    }

    card.classList.add("removing");
    // force reflow lalu tambahkan kelas do-remove agar transisi berjalan
    void card.offsetWidth;
    card.classList.add("do-remove");

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const waitTime = prefersReduced ? 0 : 360;

    setTimeout(() => {
      deleteItem(id);
      renderAll();
      showToast("success", "Data berhasil dihapus");
    }, waitTime);
  }

  /* ================================================================
     7. MODAL (confirmation)
     ================================================================ */

  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalBox = document.getElementById("modalBox");
  const modalIcon = document.getElementById("modalIcon");
  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const modalConfirmBtn = document.getElementById("modalConfirmBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");

  let pendingConfirmAction = null;
  let lastFocusedElement = null;

  function openConfirmModal({ title, desc, icon = "⚠️", confirmLabel = "Ya, Hapus", danger = true, onConfirm }) {
    modalTitle.textContent = title;
    modalDesc.innerHTML = desc;
    modalIcon.textContent = icon;
    modalConfirmBtn.textContent = confirmLabel;
    modalConfirmBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
    pendingConfirmAction = onConfirm;

    lastFocusedElement = document.activeElement;
    modalBackdrop.hidden = false;
    requestAnimationFrame(() => modalBackdrop.classList.add("visible"));
    modalConfirmBtn.focus();

    document.addEventListener("keydown", handleModalKeydown);
  }

  function closeConfirmModal() {
    modalBackdrop.classList.remove("visible");
    document.removeEventListener("keydown", handleModalKeydown);
    setTimeout(() => {
      modalBackdrop.hidden = true;
      pendingConfirmAction = null;
    }, 250);
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  function handleModalKeydown(e) {
    if (e.key === "Escape") closeConfirmModal();
  }

  modalConfirmBtn.addEventListener("click", () => {
    const action = pendingConfirmAction;
    closeConfirmModal();
    if (typeof action === "function") action();
  });
  modalCancelBtn.addEventListener("click", closeConfirmModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeConfirmModal();
  });

  /* ================================================================
     8. TOAST NOTIFICATION
     ================================================================ */

  const toastContainer = document.getElementById("toastContainer");

  const TOAST_ICONS = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
  };

  function showToast(type, message, duration = 3200) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `
      <span class="toast-icon">${TOAST_ICONS[type] || "ℹ"}</span>
      <span class="toast-msg">${escapeHTML(message)}</span>
      <span class="toast-progress"></span>
    `;
    toastContainer.appendChild(toast);

    const removeToast = () => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 350);
    };

    const timer = setTimeout(removeToast, duration);
    toast.addEventListener("click", () => {
      clearTimeout(timer);
      removeToast();
    });
  }

  /* ================================================================
     9. EXPORT / IMPORT
     ================================================================ */

  function handleExportData() {
    const items = getAllItems();
    if (items.length === 0) {
      showToast("warning", "Tidak ada data untuk diekspor");
      return;
    }
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-inventaris.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("success", "Data berhasil diekspor");
  }

  /** Validasi struktur data hasil import */
  function isValidImportData(data) {
    if (!Array.isArray(data)) return false;
    return data.every(
      (it) =>
        it &&
        typeof it === "object" &&
        "nama" in it &&
        "kode" in it &&
        "ruangan" in it &&
        "jumlah" in it &&
        "harga" in it &&
        "kondisi" in it
    );
  }

  function handleImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!isValidImportData(parsed)) {
          showToast("error", "File tidak valid. Pastikan file adalah hasil export Inventaris Ruangan.");
          return;
        }

        openConfirmModal({
          title: "Impor Data?",
          desc: `Ditemukan ${parsed.length} data pada file ini.<br />Data ini akan ditambahkan ke inventaris saat ini.`,
          icon: "📤",
          confirmLabel: "Ya, Impor",
          danger: false,
          onConfirm: () => {
            const existing = getAllItems();
            const normalized = parsed.map((it) => ({
              id: it.id ?? generateId(),
              nama: String(it.nama ?? ""),
              kode: String(it.kode ?? ""),
              ruangan: String(it.ruangan ?? ""),
              jumlah: Number(it.jumlah) || 0,
              harga: Number(it.harga) || 0,
              kondisi: ["Baik", "Rusak Ringan", "Rusak Berat"].includes(it.kondisi) ? it.kondisi : "Baik",
            }));
            saveAllItems([...existing, ...normalized]);
            renderAll();
            showToast("success", "Data berhasil diimpor");
          },
        });
      } catch (err) {
        console.error(err);
        showToast("error", "Gagal membaca file. Pastikan format JSON valid.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function handleResetData() {
    openConfirmModal({
      title: "Reset Semua Data?",
      desc: "Semua data inventaris akan dihapus dari perangkat ini.<br />Tindakan ini tidak dapat dibatalkan.",
      icon: "🗑️",
      confirmLabel: "Ya, Reset",
      onConfirm: () => {
        resetAllItems();
        renderAll();
        showToast("success", "Seluruh data berhasil direset");
      },
    });
  }

  /* ================================================================
     10. DARK MODE
     ================================================================ */

  const darkModeToggle = document.getElementById("darkModeToggle");
  const darkModeIcon = document.getElementById("darkModeIcon");

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    darkModeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
    darkModeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"
    );
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ================================================================
     11. PWA (install prompt & service worker)
     ================================================================ */

  const installBtn = document.getElementById("installBtn");
  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    installBtn.hidden = true;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      showToast("success", "Aplikasi berhasil di-install");
    }
    deferredInstallPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
  });

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((err) => {
          console.warn("Service worker gagal didaftarkan:", err);
        });
      });
    }
  }

  /* ================================================================
     12. INIT
     ================================================================ */

  function bindEvents() {
    form.addEventListener("submit", handleFormSubmit);
    btnCancel.addEventListener("click", resetForm);

    hargaSatuanInput.addEventListener("input", handleHargaInput);
    [namaBarangInput, kodeInventarisInput, namaRuanganInput, jumlahBarangInput].forEach((input) => {
      input.addEventListener("input", () => toggleHasValue(input));
    });

    searchInput.addEventListener("input", debounce(renderItemList, 150));
    filterRuanganSelect.addEventListener("change", renderItemList);
    filterKondisiSelect.addEventListener("change", renderItemList);

    itemGrid.addEventListener("click", handleItemGridClick);

    document.getElementById("btnExport").addEventListener("click", handleExportData);
    document.getElementById("btnImport").addEventListener("click", () => {
      document.getElementById("importFileInput").click();
    });
    document.getElementById("importFileInput").addEventListener("change", handleImportFileChange);
    document.getElementById("btnReset").addEventListener("click", handleResetData);

    darkModeToggle.addEventListener("click", toggleTheme);
  }

  function init() {
    initTheme();
    bindEvents();
    renderAll();
    registerServiceWorker();
    document.getElementById("footerYear").textContent = new Date().getFullYear();
  }

  document.addEventListener("DOMContentLoaded", init);
})();