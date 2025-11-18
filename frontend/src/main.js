import './style.css';
import alertSoundFile from './assets/alert.mp3'; // Pastikan file ini ada!

// Import fungsi dari Wails (backend Go)
import {
  AmbilTugas, TambahTugas, UpdateStatusTugas, HapusTugas,
  AmbilJadwal, TambahJadwal, HapusJadwal,
  AmbilPengaturan, SimpanPengaturan // Disederhanakan
} from '../wailsjs/go/main/App';

import { EventsOn } from '../wailsjs/runtime/runtime';

/* ====================================================================
   GLOBAL / AUDIO HANDLING
==================================================================== */
let audioEnabled = true; // Default true, akan di-update dari DB
const bundledSound = new Audio(alertSoundFile);
bundledSound.preload = 'auto';

// Fungsi untuk memutar audio (Disederhanakan)
async function playSound() {
  if (!audioEnabled) {
    console.warn("Audio dinonaktifkan.");
    return;
  }
  // Hanya putar audio default
  try {
    bundledSound.currentTime = 0;
    await bundledSound.play();
  } catch (err) {
    console.warn('Gagal mainkan audio default (mungkin diblokir):', err);
  }
}


/* ====================================================================
   NAVIGASI
==================================================================== */
const pages = document.querySelectorAll('.page-content');
const navButtons = document.querySelectorAll('.nav-btn');

function navigate(pageId) {
  pages.forEach(p => p.classList.add('hidden'));
  document.getElementById(pageId)?.classList.remove('hidden');

  navButtons.forEach(b => b.classList.remove('nav-btn-active'));
  document.getElementById(`nav-${pageId.split('-')[1]}`)?.classList.add('nav-btn-active');

  if (pageId === 'page-tugas') muatTugas();
  if (pageId === 'page-jadwal') muatJadwal();
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navigate(`page-${btn.id.replace('nav-', '')}`);
  });
});

/* ====================================================================
   TUGAS
==================================================================== */
const tugasList = document.getElementById('tugas-list');
const btnTambahTugas = document.getElementById('btn-tambah-tugas');

async function muatTugas() {
  if (!tugasList) return;
  tugasList.innerHTML = '';
  try {
    const daftarTugas = await AmbilTugas();
    if (!daftarTugas || daftarTugas.length === 0) {
      tugasList.innerHTML = '<p class="text-gray-400 text-center">Belum ada tugas.</p>';
      return;
    }
    const belum = daftarTugas.filter(t => !t.selesai);
    const selesai = daftarTugas.filter(t => t.selesai);
    
    belum.forEach(t => renderTugas(t));
    selesai.forEach(t => renderTugas(t));
  } catch (err) {
    console.error('Gagal memuat tugas:', err);
  }
}

function renderTugas(t) {
  const li = document.createElement('li');
  li.className = `task-item flex items-start justify-between ${t.selesai ? 'opacity-60' : ''}`;
  const deadline = t.deadline ? new Date(t.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  
  li.innerHTML = `
    <div class="flex items-start gap-3">
      <input type="checkbox" data-id="${t.id}" class="toggle-selesai w-5 h-5 mt-1" ${t.selesai ? 'checked' : ''}>
      <div>
        <p class="font-semibold text-lg ${t.selesai ? 'line-through' : ''}">${t.judul}</p>
        <p class="text-sm text-gray-400">${t.deskripsi || ''}</p>
        <p class="text-sm text-teal-400 mt-1">Deadline: ${deadline}</p>
      </div>
    </div>
    <button data-id="${t.id}" class="btn-hapus font-semibold text-red-500 hover:text-red-400">Hapus</button>
  `;
  tugasList.appendChild(li);
}

btnTambahTugas.addEventListener('click', async () => {
  const judul = document.getElementById('tugas-judul').value.trim();
  const deskripsi = document.getElementById('tugas-deskripsi').value.trim();
  const deadline = document.getElementById('tugas-deadline').value;
  const reminder = document.getElementById('tugas-reminder').value; 

  if (!judul || !deadline) {
    alert('Judul dan deadline wajib diisi!');
    return;
  }
  try {
    const tugasBaru = { id: 0, judul, deskripsi, deadline, selesai: false, reminder };
    await TambahTugas(tugasBaru);
    
    document.getElementById('tugas-judul').value = '';
    document.getElementById('tugas-deskripsi').value = '';
    document.getElementById('tugas-deadline').value = '';
    document.getElementById('tugas-reminder').value = 'NONE';
    await muatTugas();
  } catch (err) {
    console.error('Gagal menambah tugas:', err);
    alert('Gagal menambah tugas. Lihat console.');
  }
});

tugasList.addEventListener('click', async (e) => {
  const target = e.target;
  if (!target.dataset.id) return;
  const id = parseInt(target.dataset.id);
  
  if (target.classList.contains('toggle-selesai')) {
    try { await UpdateStatusTugas(id, target.checked); await muatTugas(); } 
    catch (err) { console.error(err); }
  }
  if (target.classList.contains('btn-hapus')) {
    try { await HapusTugas(id); await muatTugas(); } 
    catch (err) { console.error(err); }
  }
});

// --- Jadwal logic ---
const jadwalList = document.getElementById('jadwal-list');
const btnTambahJadwal = document.getElementById('btn-tambah-jadwal');
const hariUrut = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];

async function muatJadwal() {
  if (!jadwalList) return;
  jadwalList.innerHTML = '';
  try {
    const jadwalMap = await AmbilJadwal();
    let empty = true;
    for (const hari of hariUrut) {
      const arr = jadwalMap[hari] || [];
      if (arr.length > 0) {
        empty = false;
        const div = document.createElement('div');
        div.className = 'bg-slate-800 p-4 rounded-lg';
        let inner = `<h3 class="font-bold text-teal-400 mb-2 border-b border-slate-700 pb-2">${hari}</h3>`;
        arr.forEach(j => {
          inner += `
            <div class="flex justify-between items-center mb-2">
              <div>
                <p class="font-semibold">${j.mataKuliah}</p>
                <p class="text-sm text-gray-400">${j.jamMulai} (Remind: ${j.reminder}m)</p>
              </div>
              <button data-id="${j.id}" class="btn-hapus-jadwal font-semibold text-red-500 hover:text-red-400 text-sm">Hapus</button>
            </div>`;
        });
        div.innerHTML = inner;
        jadwalList.appendChild(div);
      }
    }
    if (empty) jadwalList.innerHTML = '<p class="text-gray-400 text-center">Belum ada jadwal.</p>';
  } catch (err) {
    console.error('Gagal muat jadwal', err);
  }
}

if (btnTambahJadwal) {
  btnTambahJadwal.addEventListener('click', async () => {
      const mataKuliah = document.getElementById('jadwal-matkul').value;
      const hari = document.getElementById('jadwal-hari').value;
      const jamMulai = document.getElementById('jadwal-jam').value;
      const reminder = parseInt(document.getElementById('jadwal-reminder').value || '10');

      if (!mataKuliah || !hari || !jamMulai) {
          alert("Mata kuliah, hari, dan jam wajib diisi!");
          return;
      }
      try {
          const jadwalBaru = { id: 0, hari, mataKuliah, jamMulai, reminder };
          await TambahJadwal(jadwalBaru);
          document.getElementById('jadwal-matkul').value = '';
          document.getElementById('jadwal-jam').value = '';
          await muatJadwal();
      } catch (err) {
          alert("Gagal menambah jadwal: " + err);
      }
  });
}

if (jadwalList) {
  jadwalList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-hapus-jadwal')) {
      const id = parseInt(e.target.dataset.id);
      try { await HapusJadwal(id); await muatJadwal(); } 
      catch (err) { console.error(err); }
    }
  });
}

// --- Pengaturan audio (Disederhanakan) ---
const soundToggle = document.getElementById('soundToggle');

soundToggle.addEventListener('change', async () => {
    audioEnabled = soundToggle.checked;
    await SimpanPengaturan('sound_enabled', audioEnabled ? 'true' : 'false');
    if(audioEnabled) {
      // Coba mainkan audio senyap untuk izin
      bundledSound.muted = true;
      bundledSound.play().catch(()=>{});
      bundledSound.muted = false;
    }
});

async function muatPengaturan() {
  try {
    const soundStatus = await AmbilPengaturan('sound_enabled');
    audioEnabled = (soundStatus === 'false') ? false : true; // default true
    soundToggle.checked = audioEnabled;
  } catch (err) { console.error(err); }
}

// --- Wails event handling (Disederhanakan) ---
EventsOn("tampilkanReminder", (data) => {
  console.log('Menerima event reminder:', data);
  tampilkanNotifikasiHTML(data.judul, data.pesan);
  playSound(); // Hanya memutar audio default
});

function tampilkanNotifikasiHTML(judul, pesan) {
  const notif = document.createElement('div');
  notif.className = 'notifikasi-popup';
  notif.innerHTML = `<strong>${judul}</strong><p>${pesan}</p><button class="notif-dismiss">Tutup</button>`;
  document.body.appendChild(notif);
  
  setTimeout(()=> notif.classList.add('show'), 20);

  notif.querySelector('.notif-dismiss').addEventListener('click', () => {
    notif.classList.remove('show');
    setTimeout(()=> notif.remove(), 300);
  });
  
  setTimeout(()=> {
    if (document.body.contains(notif)) {
      notif.classList.remove('show');
      setTimeout(()=> notif.remove(), 300);
    }
  }, 8000);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  navigate('page-tugas');
  muatPengaturan();
});