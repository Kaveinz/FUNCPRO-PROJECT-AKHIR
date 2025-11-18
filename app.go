package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/go-toast/toast"
	_ "github.com/mattn/go-sqlite3" // Driver SQLite
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// --- Struktur Aplikasi Utama ---
type App struct {
	ctx context.Context
	db  *sql.DB
}

// --- Struktur Data ---
type Tugas struct {
	ID        int64  `json:"id"`
	Judul     string `json:"judul"`
	Deskripsi string `json:"deskripsi"`
	Deadline  string `json:"deadline"`
	Selesai   bool   `json:"selesai"`
	Reminder  string `json:"reminder"`
}

type JadwalKelas struct {
	ID         int64  `json:"id"`
	Hari       string `json:"hari"`
	MataKuliah string `json:"mataKuliah"`
	JamMulai   string `json:"jamMulai"`
	Reminder   int    `json:"reminder"`
}

// --- Struktur Data (untuk Komunikasi) ---
// --- FP: Concurrency (Komunikasi) ---
type ReminderEvent struct {
	Judul string `json:"judul"`
	Pesan string `json:"pesan"`
}

// --- Inisialisasi ---
func NewApp() *App {
	return &App{}
}

// --- FP: Monad (Context) & Isolasi Side Effect ---
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx // Monad (Context)

	// Side Effect (Database)
	db, err := sql.Open("sqlite3", "./goplanner.db")
	if err != nil {
		log.Fatalf("Gagal membuka database: %v", err)
	}
	a.db = db
	fmt.Println("Berhasil terhubung ke database SQLite!")

	a.buatTabel() // Side Effect

	initSudahNotifikasi() // State

	// --- FP: Concurrency (Goroutine) & Monad (Context) ---
	go a.jalankanScheduler(ctx)
}

// --- FP: Side Effect (Database) ---
func (a *App) buatTabel() {
	tabelTugasSQL := `CREATE TABLE IF NOT EXISTS tugas (
		"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "judul" TEXT, "deskripsi" TEXT, "deadline" TEXT, 
		"selesai" BOOLEAN, "reminder" TEXT
	);`
	tabelJadwalSQL := `CREATE TABLE IF NOT EXISTS jadwal_kelas (
		"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "hari" TEXT,
		"mata_kuliah" TEXT, "jam_mulai" TEXT, "reminder" INTEGER
	);`
	tabelPengaturanSQL := `CREATE TABLE IF NOT EXISTS pengaturan (
		"kunci" TEXT NOT NULL PRIMARY KEY, "nilai" TEXT
	);`
	if _, err := a.db.Exec(tabelTugasSQL); err != nil {
		log.Fatalf("...")
	}
	if _, err := a.db.Exec(tabelJadwalSQL); err != nil {
		log.Fatalf("...")
	}
	if _, err := a.db.Exec(tabelPengaturanSQL); err != nil {
		log.Fatalf("...")
	}
	a.db.Exec(`INSERT OR IGNORE INTO pengaturan(kunci, nilai) VALUES ('sound_enabled', 'true')`)
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) AmbilTugas() ([]Tugas, error) {
	rows, err := a.db.Query("SELECT id, judul, deskripsi, deadline, selesai, reminder FROM tugas ORDER BY deadline ASC")
	if err != nil {
		return nil, err
	} // Error Handling (Result)
	defer rows.Close()

	// --- FP: Immutability ---
	tugasList := []Tugas{}
	for rows.Next() {
		var t Tugas
		if err := rows.Scan(&t.ID, &t.Judul, &t.Deskripsi, &t.Deadline, &t.Selesai, &t.Reminder); err != nil {
			return nil, err // Error Handling (Result)
		}
		tugasList = append(tugasList, t)
	}
	return tugasList, nil
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) TambahTugas(t Tugas) (Tugas, error) {
	query := "INSERT INTO tugas(judul, deskripsi, deadline, selesai, reminder) VALUES (?, ?, ?, ?, ?)"
	res, err := a.db.Exec(query, t.Judul, t.Deskripsi, t.Deadline, false, t.Reminder)
	if err != nil {
		return Tugas{}, err
	} // Error Handling
	id, err := res.LastInsertId()
	if err != nil {
		return Tugas{}, fmt.Errorf("gagal mendapatkan LastInsertId: %w", err)
	}
	t.ID = id
	return t, nil // Immutability (Mengembalikan state baru)
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) UpdateStatusTugas(id int64, selesai bool) error {
	_, err := a.db.Exec("UPDATE tugas SET selesai = ? WHERE id = ?", selesai, id)
	return err // Error Handling
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) HapusTugas(id int64) error {
	_, err := a.db.Exec("DELETE FROM tugas WHERE id = ?", id)
	return err // Error Handling
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) AmbilJadwal() (map[string][]JadwalKelas, error) {
	rows, err := a.db.Query("SELECT id, hari, mata_kuliah, jam_mulai, reminder FROM jadwal_kelas ORDER BY jam_mulai ASC")
	if err != nil {
		return nil, err
	} // Error Handling
	defer rows.Close()

	// --- FP: Immutability ---
	jadwalMap := make(map[string][]JadwalKelas)
	for rows.Next() {
		var j JadwalKelas
		if err := rows.Scan(&j.ID, &j.Hari, &j.MataKuliah, &j.JamMulai, &j.Reminder); err != nil {
			return nil, err
		}
		jadwalMap[j.Hari] = append(jadwalMap[j.Hari], j)
	}
	return jadwalMap, nil
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) TambahJadwal(j JadwalKelas) (JadwalKelas, error) {
	query := "INSERT INTO jadwal_kelas(hari, mata_kuliah, jam_mulai, reminder) VALUES (?, ?, ?, ?)"
	res, err := a.db.Exec(query, j.Hari, j.MataKuliah, j.JamMulai, j.Reminder)
	if err != nil {
		return JadwalKelas{}, err
	} // Error Handling
	id, err := res.LastInsertId()
	if err != nil {
		return JadwalKelas{}, fmt.Errorf("gagal mendapatkan LastInsertId: %w", err)
	}
	j.ID = id
	return j, nil // Immutability
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) HapusJadwal(id int64) error {
	_, err := a.db.Exec("DELETE FROM jadwal_kelas WHERE id = ?", id)
	return err // Error Handling
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) AmbilPengaturan(kunci string) (string, error) {
	var nilai string
	query := "SELECT nilai FROM pengaturan WHERE kunci = ?"
	err := a.db.QueryRow(query, kunci).Scan(&nilai)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err // Error Handling
	}
	return nilai, nil
}

// --- FP: Side Effect (Database) & Error Handling (Result) ---
func (a *App) SimpanPengaturan(kunci string, nilai string) error {
	query := `INSERT INTO pengaturan(kunci, nilai) VALUES (?, ?) 
			  ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai;`
	_, err := a.db.Exec(query, kunci, nilai)
	return err // Error Handling
}

// --- FP: Concurrency (Goroutine) & Monad (Context) ---
func (a *App) jalankanScheduler(ctx context.Context) {
	fmt.Println("Scheduler Reminder dimulai...")
	ticker := time.NewTicker(30 * time.Second) // Channel
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done(): // Monad (Context)
			fmt.Println("Scheduler Reminder dihentikan.")
			return
		case t := <-ticker.C: // Concurrency (Menerima dari Channel)
			fmt.Printf("Scheduler: Memeriksa @ %v\n", t.Format(time.Kitchen))
			a.periksaDeadlineTugas(ctx)
			a.periksaJadwalKelas(ctx)
		}
	}
}

// --- State (Global) ---
// (Dibutuhkan untuk mencegah spam notifikasi, sebuah side effect yang terkontrol)
var sudahNotifikasiTugas map[int64]bool
var sudahNotifikasiJadwal map[int64]bool

func initSudahNotifikasi() {
	sudahNotifikasiTugas = make(map[int64]bool)
	sudahNotifikasiJadwal = make(map[int64]bool)
}

// --- FP: Pure Function ---
func parseTimeLocal(layouts []string, value string) (time.Time, error) {
	for _, layout := range layouts {
		t, err := time.ParseInLocation(layout, value, time.Local)
		if err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("gagal parse time: '%v'", value)
}

// --- FP: Pure Function ---
// (Hanya bergantung pada input t & sekarang, tidak ada side effect)
func perluNotifikasiTugas(t Tugas, sekarang time.Time) bool {
	layouts := []string{"2006-01-02T15:04", time.RFC3339, "2006-01-02 15:04"}
	deadline, err := parseTimeLocal(layouts, t.Deadline)
	if err != nil {
		fmt.Printf("Gagal parse deadline '%s' untuk tugas '%s': %v\n", t.Deadline, t.Judul, err)
		return false
	}
	if t.Selesai || deadline.Before(sekarang) {
		return false
	}
	durasiMenujuDeadline := deadline.Sub(sekarang)
	rentangWaktu := 30 * time.Second
	if t.Reminder == "SETIAP_JAM_DI_HARI_H" {
		if durasiMenujuDeadline < (24 * time.Hour) {
			return sekarang.Minute() == 0 && sekarang.Second() <= 30
		}
		return false
	}
	if t.Reminder != "NONE" {
		menitReminder, err := strconv.Atoi(t.Reminder)
		if err != nil {
			return false
		}
		targetDurasi := time.Duration(menitReminder) * time.Minute
		if durasiMenujuDeadline <= targetDurasi && durasiMenujuDeadline > (targetDurasi-rentangWaktu) {
			return true
		}
	}
	return false
}

// --- FP: Pure Function ---
func perluNotifikasiJadwal(j JadwalKelas, sekarang time.Time) (bool, time.Time) {
	hariMap := map[string]time.Weekday{
		"Senin": time.Monday, "Selasa": time.Tuesday, "Rabu": time.Wednesday,
		"Kamis": time.Thursday, "Jumat": time.Friday, "Sabtu": time.Saturday, "Minggu": time.Sunday,
	}
	if sekarang.Weekday() != hariMap[j.Hari] {
		return false, time.Time{}
	}
	parts := strings.Split(j.JamMulai, ":")
	if len(parts) < 2 {
		return false, time.Time{}
	}
	h, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	targetWaktu := time.Date(sekarang.Year(), sekarang.Month(), sekarang.Day(), h, m, 0, 0, sekarang.Location())
	waktuNotifikasi := targetWaktu.Add(-time.Duration(j.Reminder) * time.Minute)
	rentangWaktu := 30 * time.Second
	waktuSelesaiJendela := waktuNotifikasi.Add(rentangWaktu)
	beradaDiJendela := sekarang.After(waktuNotifikasi) && sekarang.Before(waktuSelesaiJendela)
	return beradaDiJendela, waktuSelesaiJendela
}

// --- FP: Isolasi Side Effect ---
// (Fungsi impure yang memanggil fungsi pure)
func (a *App) periksaDeadlineTugas(ctx context.Context) {
	tugasList, err := a.AmbilTugas() // Side Effect
	if err != nil {
		return
	}
	sekarang := time.Now()
	for _, t := range tugasList {
		if perluNotifikasiTugas(t, sekarang) { // Panggil Pure Function
			if !sudahNotifikasiTugas[t.ID] {
				a.kirimNotifikasi(ctx, "⏰ Deadline Tugas!", t.Judul)     // Side Effect
				NotifikasiWindows(t.Judul, "Deadline tugas hampir tiba") // Side Effect
				sudahNotifikasiTugas[t.ID] = true                        // Side Effect (Mutasi state)
			}
		} else {
			if deadline, err := parseTimeLocal([]string{"2006-01-02T15:04"}, t.Deadline); err == nil && sekarang.After(deadline) {
				delete(sudahNotifikasiTugas, t.ID)
			}
		}
	}
}

// --- FP: Isolasi Side Effect ---
func (a *App) periksaJadwalKelas(ctx context.Context) {
	jadwalMap, err := a.AmbilJadwal() // Side Effect
	if err != nil {
		return
	}
	sekarang := time.Now()
	for _, daftarJadwal := range jadwalMap {
		for _, j := range daftarJadwal {
			perluNotif, waktuSelesaiJendela := perluNotifikasiJadwal(j, sekarang) // Panggil Pure Function
			if perluNotif {
				if !sudahNotifikasiJadwal[j.ID] {
					pesan := fmt.Sprintf("%s akan dimulai pukul %s", j.MataKuliah, j.JamMulai)
					a.kirimNotifikasi(ctx, "🔔 Pengingat Kelas!", pesan) // Side Effect
					NotifikasiWindows(j.MataKuliah, pesan)              // Side Effect
					sudahNotifikasiJadwal[j.ID] = true                  // Side Effect (Mutasi state)
				}
			} else {
				if !waktuSelesaiJendela.IsZero() && sekarang.After(waktuSelesaiJendela) {
					delete(sudahNotifikasiJadwal, j.ID)
				}
			}
		}
	}
}

// --- FP: Side Effect (Komunikasi via Event) ---
func (a *App) kirimNotifikasi(ctx context.Context, judul string, pesan string) {
	eventData := ReminderEvent{
		Judul: judul,
		Pesan: pesan,
	}
	// "Berkomunikasi", bukan "Berbagi Memori"
	runtime.EventsEmit(ctx, "tampilkanReminder", eventData)
}

// --- FP: SideEffect (OS Notification) ---
func NotifikasiWindows(judul, pesan string) {
	notification := toast.Notification{
		AppID:   "GoPlanner",
		Title:   judul,
		Message: pesan,
		Audio:   toast.Default,
	}
	if err := notification.Push(); err != nil {
		fmt.Printf("NotifikasiWindows: gagal push toast: %v\n", err)
	}
}
