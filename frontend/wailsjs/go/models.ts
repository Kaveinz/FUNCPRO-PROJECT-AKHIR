export namespace main {
	
	export class JadwalKelas {
	    id: number;
	    hari: string;
	    mataKuliah: string;
	    jamMulai: string;
	    reminder: number;
	
	    static createFrom(source: any = {}) {
	        return new JadwalKelas(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.hari = source["hari"];
	        this.mataKuliah = source["mataKuliah"];
	        this.jamMulai = source["jamMulai"];
	        this.reminder = source["reminder"];
	    }
	}
	export class Tugas {
	    id: number;
	    judul: string;
	    deskripsi: string;
	    deadline: string;
	    selesai: boolean;
	    reminder: string;
	
	    static createFrom(source: any = {}) {
	        return new Tugas(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.judul = source["judul"];
	        this.deskripsi = source["deskripsi"];
	        this.deadline = source["deadline"];
	        this.selesai = source["selesai"];
	        this.reminder = source["reminder"];
	    }
	}

}

