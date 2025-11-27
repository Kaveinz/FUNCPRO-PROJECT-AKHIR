import './style.css'; 
import alertSoundFile from './assets/alert.mp3'; 


// Import fungsi dari Wails (backend Go)
import {
  AmbilTugas, TambahTugas, UpdateStatusTugas, HapusTugas,
  AmbilJadwal, TambahJadwal, HapusJadwal,
  AmbilPengaturan, SimpanPengaturan
} from '../wailsjs/go/main/App';

import { EventsOn } from '../wailsjs/runtime/runtime';

/* ====================================================================
   GLOBAL / AUDIO HANDLING
==================================================================== */
let audioEnabled = true; 
const bundledSound = new Audio(alertSoundFile);
bundledSound.preload = 'auto';

async function playSound() {
  if (!audioEnabled) return;
  try {
    bundledSound.currentTime = 0;
    await bundledSound.play();
  } catch (err) {
    console.warn('Gagal mainkan audio:', err);
  }
}

/* ====================================================================
   NAVIGASI (PERBAIKAN: Menggunakan ID yang Tepat)
==================================================================== */
const navButtons = document.querySelectorAll('.nav-btn');

function navigate(pageId) {
  // 1. Sembunyikan semua halaman
  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  
  // 2. Tampilkan halaman target
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.remove('hidden');

  // 3. Update style tombol navigasi
  navButtons.forEach(btn => btn.classList.remove('nav-btn-active'));
  const activeBtnId = `nav-${pageId.replace('page-', '')}`;
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) activeBtn.classList.add('nav-btn-active');

  // 4. Muat data
  if (pageId === 'page-tugas') muatTugas();
  if (pageId === 'page-jadwal') muatJadwal();
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Ambil bagian akhir ID (misal: 'tugas' dari 'nav-tugas')
    const targetPageId = `page-${btn.id.split('-')[1]}`;
    navigate(targetPageId);
  });
});

/* ====================================================================
   LOGIKA TUGAS
==================================================================== */
const tugasList = document.getElementById('tugas-list');
const btnTambahTugas = document.getElementById('btn-tambah-tugas');

async function muatTugas() {
  if (!tugasList) return;
  tugasList.innerHTML = '';
  try {
    const daftarTugas = await AmbilTugas();
    if (!daftarTugas || daftarTugas.length === 0) {
      tugasList.innerHTML = '<p class="text-gray-500 text-center mt-10">Belum ada tugas. Tambahkan tugas baru!</p>';
      return;
    }
    
    const belum = daftarTugas.filter(t => !t.selesai);
    const selesai = daftarTugas.filter(t => t.selesai);
    
    belum.forEach(t => renderTugas(t));
    
    if (selesai.length > 0) {
        const divider = document.createElement('div');
        divider.className = "text-gray-500 text-sm font-bold uppercase tracking-wide mt-6 mb-2";
        divider.innerText = "Selesai";
        tugasList.appendChild(divider);
        selesai.forEach(t => renderTugas(t));
    }
  } catch (err) {
    console.error('Gagal memuat tugas:', err);
  }
}

function renderTugas(t) {
  const li = document.createElement('li');
  li.className = `task-item flex items-start justify-between gap-4 ${t.selesai ? 'opacity-50' : ''}`;
  
  let dateStr = "-";
  if(t.deadline) {
      dateStr = new Date(t.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }

  li.innerHTML = `
    <div class="flex items-start gap-3 w-full">
      <input type="checkbox" data-id="${t.id}" class="toggle-selesai w-5 h-5 mt-1 accent-teal-500 cursor-pointer" ${t.selesai ? 'checked' : ''}>
      <div class="flex-1">
        <p class="font-bold text-lg text-white ${t.selesai ? 'line-through text-gray-500' : ''}">${t.judul}</p>
        <p class="text-gray-400 text-sm mb-1">${t.deskripsi || ''}</p>
        <div class="flex items-center gap-2 text-xs font-mono text-teal-400 bg-slate-900/50 w-fit px-2 py-1 rounded">
            <span>📅 ${dateStr}</span>
        </div>
      </div>
    </div>
    <button data-id="${t.id}" class="btn-hapus text-red-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded transition">
        🗑️
    </button>
  `;
  tugasList.appendChild(li);
}

if (btnTambahTugas) {
    btnTambahTugas.addEventListener('click', async () => {
        const judul = document.getElementById('tugas-judul').value.trim();
        const deskripsi = document.getElementById('tugas-deskripsi').value.trim();
        const deadline = document.getElementById('tugas-deadline').value;
        const reminder = document.getElementById('tugas-reminder').value;

        if (!judul || !deadline) {
            alert('Judul dan Deadline wajib diisi!');
            return;
        }

        try {
            await TambahTugas({ id: 0, judul, deskripsi, deadline, selesai: false, reminder });
            
            // Reset Form
            document.getElementById('tugas-judul').value = '';
            document.getElementById('tugas-deskripsi').value = '';
            document.getElementById('tugas-deadline').value = '';
            document.getElementById('tugas-reminder').value = 'NONE';
            
            await muatTugas();
        } catch (err) {
            alert("Gagal menambah tugas: " + err);
        }
    });
}

if (tugasList) {
    tugasList.addEventListener('click', async (e) => {
        const target = e.target;
        const id = parseInt(target.dataset.id);
        if (!id) return;

        if (target.classList.contains('toggle-selesai')) {
            await UpdateStatusTugas(id, target.checked);
            muatTugas();
        }
        if (target.closest('.btn-hapus')) { // Pakai closest agar ikon di dalam tombol juga bisa diklik
            const btn = target.closest('.btn-hapus');
            const idDel = parseInt(btn.dataset.id);
            if(confirm("Hapus tugas ini?")) {
                await HapusTugas(idDel);
                muatTugas();
            }
        }
    });
}

/* ====================================================================
   LOGIKA JADWAL (PERBAIKAN UTAMA)
==================================================================== */
const jadwalList = document.getElementById('jadwal-list');
const btnTambahJadwal = document.getElementById('btn-tambah-jadwal');
const hariUrut = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];

async function muatJadwal() {
  if (!jadwalList) return;
  jadwalList.innerHTML = '';
  try {
    const jadwalMap = await AmbilJadwal();
    let empty = true;

    hariUrut.forEach(hari => {
      const arr = jadwalMap[hari] || [];
      if (arr.length > 0) {
        empty = false;
        
        // Buat Kartu Hari
        const card = document.createElement('div');
        card.className = 'bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex flex-col';
        
        // Header Hari
        let itemsHtml = `<div class="bg-slate-700/50 p-3 border-b border-slate-700">
                            <h3 class="font-bold text-teal-400 text-center uppercase tracking-wider">${hari}</h3>
                         </div>
                         <div class="p-3 space-y-3">`;

        // Isi Jadwal
        arr.forEach(j => {
          itemsHtml += `
            <div class="bg-slate-900/50 p-3 rounded border border-slate-700/50 flex justify-between items-center group">
                <div>
                    <p class="font-bold text-white text-sm">${j.mataKuliah}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded">⏰ ${j.jamMulai}</span>
                        <span class="text-[10px] text-gray-500">Ingat: ${j.reminder}m</span>
                    </div>
                </div>
                <button data-id="${j.id}" class="btn-hapus-jadwal text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity px-2">✖</button>
            </div>
          `;
        });
        itemsHtml += `</div>`; // Tutup container items
        
        card.innerHTML = itemsHtml;
        jadwalList.appendChild(card);
      }
    });

    if (empty) {
        jadwalList.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10">Belum ada jadwal kelas.</div>';
    }

  } catch (err) {
    console.error('Gagal muat jadwal', err);
  }
}

if (btnTambahJadwal) {
  btnTambahJadwal.addEventListener('click', async () => {
      const matkul = document.getElementById('jadwal-matkul').value.trim();
      const hari = document.getElementById('jadwal-hari').value;
      const jam = document.getElementById('jadwal-jam').value;
      const reminderVal = document.getElementById('jadwal-reminder').value;
      const reminder = parseInt(reminderVal || '60');

      if (!matkul || !hari || !jam) {
          alert("Mata kuliah, Hari, dan Jam wajib diisi!");
          return;
      }

      try {
          const jadwalBaru = { id: 0, hari: hari, mataKuliah: matkul, jamMulai: jam, reminder: reminder };
          await TambahJadwal(jadwalBaru);
          
          // Reset form
          document.getElementById('jadwal-matkul').value = '';
          document.getElementById('jadwal-jam').value = '';
          
          await muatJadwal();
      } catch (err) {
          console.error(err);
          alert("Gagal menambah jadwal. Cek console.");
      }
  });
}

if (jadwalList) {
  jadwalList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-hapus-jadwal')) {
      if(confirm("Hapus jadwal ini?")) {
          const id = parseInt(e.target.dataset.id);
          await HapusJadwal(id);
          muatJadwal();
      }
    }
  });
}

/* ====================================================================
   PENGATURAN & NOTIFIKASI
==================================================================== */
const soundToggle = document.getElementById('soundToggle');

if (soundToggle) {
    soundToggle.addEventListener('change', async () => {
        audioEnabled = soundToggle.checked;
        await SimpanPengaturan('sound_enabled', audioEnabled ? 'true' : 'false');
        if(audioEnabled) {
            // Test sound
            bundledSound.muted = true;
            bundledSound.play().catch(()=>{});
            bundledSound.muted = false;
        }
    });
}

async function muatPengaturan() {
  try {
    const soundStatus = await AmbilPengaturan('sound_enabled');
    audioEnabled = (soundStatus === 'false') ? false : true; 
    if (soundToggle) soundToggle.checked = audioEnabled;
  } catch (err) { console.error(err); }
}

// Event dari Go (Backend)
EventsOn("tampilkanReminder", (data) => {
  console.log('Reminder:', data);
  tampilkanNotifikasiHTML(data.judul, data.pesan);
  playSound();
});

function tampilkanNotifikasiHTML(judul, pesan) {
  const notif = document.createElement('div');
  notif.className = 'notifikasi-popup'; // Class ini ada di <style> index.html
  notif.innerHTML = `
    <div class="flex justify-between items-start">
        <strong class="text-teal-400 text-lg block mb-1">${judul}</strong>
        <button class="notif-dismiss text-gray-400 hover:text-white">&times;</button>
    </div>
    <p class="text-gray-200 text-sm">${pesan}</p>
  `;
  document.body.appendChild(notif);
  
  // Animasi Masuk
  setTimeout(()=> notif.classList.add('show'), 20);

  const removeNotif = () => {
      notif.classList.remove('show');
      setTimeout(()=> notif.remove(), 500);
  };

  notif.querySelector('.notif-dismiss').addEventListener('click', removeNotif);
  
  // Auto close 8 detik
  setTimeout(()=> {
    if (document.body.contains(notif)) removeNotif();
  }, 8000);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  navigate('page-tugas');
  muatPengaturan();
});