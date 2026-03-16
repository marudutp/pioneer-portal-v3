// import * as GUI from "@babylonjs/gui";
// import { WhiteboardManager } from "./WhiteboardManager";
// import { ROLES } from "@shared/constants";

// export class WhiteboardUI {
//     private ui: GUI.AdvancedDynamicTexture;
//     private panel: GUI.StackPanel;

//     constructor(private wbManager: WhiteboardManager, private role: string) {
//         // 1. Buat kanvas GUI Fullscreen
//         this.ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("WhiteboardControlUI");

//         // 2. Buat Panel Wadah (Taruh di pojok kanan agar tidak ganggu pandangan)
//         this.panel = new GUI.StackPanel();
//         this.panel.width = "220px";
//         this.panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
//         this.panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
//         this.panel.paddingRight = "20px";
//         this.ui.addControl(this.panel);

//         this.setupButtons();
//     }

//     private setupButtons() {
//         // --- FITUR KHUSUS GURU ---
//         if (this.role === ROLES.TEACHER) {
//             this.addHeader("🛠️ ALAT GURU");

//             this.createButton("⚫ Spidol Hitam", "black", () => {
//                 // Kamu bisa modifikasi WhiteboardManager agar drawPoint menerima warna
//                 console.log("Ganti ke spidol hitam");
//             });

//             this.createButton("🔴 Spidol Merah", "#e74c3c", () => {
//                 console.log("Ganti ke spidol merah");
//             });

//             this.createButton("🗑️ Kosongkan Papan", "#2c3e50", () => {
//                 if (confirm("Hapus semua coretan di papan?")) {
//                     this.wbManager.clearBoard(true);
//                 }
//             });

//             this.addSpacer();
//         }

//         // --- FITUR UMUM (GURU & MURID) ---
//         this.addHeader("💾 CATATAN");

//         this.createButton("📷 Simpan Gambar (PNG)", "#27ae60", () => {
//             const dataUrl = this.wbManager.getCanvasSnapshot();
//             const link = document.createElement('a');
//             link.download = `papan-tulis-${new Date().getTime()}.png`;
//             link.href = dataUrl;
//             link.click();
//             console.log("Snapshot berhasil disimpan, Ferguso!");
//         });
//     }

//     private createButton(text: string, color: string, onClick: () => void) {
//         const btn = GUI.Button.CreateSimpleButton("btn_" + text, text);
//         btn.height = "45px";
//         btn.color = "white";
//         btn.background = color;
//         btn.cornerRadius = 8;
//         btn.thickness = 2;
//         btn.margin = "5px";
//         btn.fontSize = "14px";
//         btn.onPointerUpObservable.add(onClick);
//         this.panel.addControl(btn);
//     }

//     private addHeader(text: string) {
//         const header = new GUI.TextBlock();
//         header.text = text;
//         header.height = "30px";
//         header.color = "white";
//         header.fontSize = "12px";
//         header.fontStyle = "bold";
//         this.panel.addControl(header);
//     }

//     private addSpacer() {
//         const spacer = new GUI.Rectangle();
//         spacer.height = "20px";
//         spacer.thickness = 0;
//         this.panel.addControl(spacer);
//     }
// }

import { WhiteboardManager } from "../managers/WhiteboardManager";
import { ROLES } from "@shared/constants";

export class WhiteboardUI {
    private wbManager: WhiteboardManager;
    private container: HTMLDivElement;

    constructor(wbManager: WhiteboardManager, role: string) {
        this.wbManager = wbManager;

        // 1. Buat Container UI di Layar
        this.container = document.createElement("div");
        this.container.id = "whiteboard-controls";
        this.styleContainer();
        document.body.appendChild(this.container);

        // 2. LOGIKA ROLE: Hanya GURU yang dapat spidol & penghapus
        if (role === ROLES.TEACHER) {
            this.createTeacherTools();
        } else {
            this.createStudentTools();
        }
    }

    private createTeacherTools() {
        // --- TOMBOL WARNA HITAM ---
        this.createButton("⚫", "black", () => {
            console.log("🎨 Ganti Spidol: HITAM");
            this.wbManager.setSpidolColor("black");
        });

        // --- TOMBOL WARNA MERAH ---
        this.createButton("🔴", "red", () => {
            console.log("🎨 Ganti Spidol: MERAH");
            this.wbManager.setSpidolColor("red");
        });

        // --- TOMBOL WARNA BIRU ---
        this.createButton("🔵", "blue", () => {
            console.log("🎨 Ganti Spidol: BIRU");
            this.wbManager.setSpidolColor("blue");
        });

        // --- TOMBOL HAPUS PAPAN (CLEAR) ---
        this.createButton("🧹 Hapus Papan", "#ff4444", () => {
            if (confirm("Hapus semua coretan di kelas?")) {
                this.wbManager.clearBoard(true); // true = lapor ke server biar semua siswa ikut terhapus
            }
        });
        // Alat Presentasi (Upload Slide)
        this.createButton("🖼️ Upload Slide", "#8e44ad", () => {
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = "image/*";

            fileInput.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('slide', file);

                try {
                    // Mengambil URL server dari environment atau config
                    const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/upload-material`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();

                    if (data.success) {
                        // Tampilkan di local dan broadcast ke murid
                        this.wbManager.displaySlide(data.url);
                        this.wbManager.getNetwork().socket.emit("admin-change-slide", { slideUrl: data.url });
                    }
                } catch (err) {
                    console.error("Gagal upload slide:", err);
                }
            };
            fileInput.click();
        });
    }

    // private createStudentTools() {
    //     // Siswa cuma dapet tombol Download hasil papan tulis
    //     this.createButton("💾 Simpan Catatan", "#4CAF50", () => {
    //         const dataUrl = this.wbManager.getCanvasSnapshot();
    //         const link = document.createElement("a");
    //         link.download = "catatan-kelas.png";
    //         link.href = dataUrl;
    //         link.click();
    //     });
    // }

    private createStudentTools() {
        this.createButton("💾 Simpan Catatan", "#4CAF50", () => {
            const rawDataUrl = this.wbManager.getCanvasSnapshot();

            // 1. Buat Image Object untuk menampung data mentah
            const img = new Image();
            img.onload = () => {
                // 2. Buat Canvas bayangan untuk membalikkan gambar
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const ctx = tempCanvas.getContext("2d");

                if (ctx) {
                    // --- JURUS BALIK GAMBAR ---
                    // --- JURUS ANTI-MIRROR & ANTI-TERBALIK ---
                    // 1. Geser titik pusat ke pojok kanan bawah
                    ctx.translate(img.width, img.height);

                    // 2. Balikkan sumbu X (-1) dan sumbu Y (-1)
                    ctx.scale(-1, -1);

                    // 3. Gambar ulang
                    ctx.drawImage(img, 0, 0);

                    // 3. Ekspor hasil yang sudah tegak lurus
                    const flippedDataUrl = tempCanvas.toDataURL("image/png");

                    // 4. Proses Download seperti biasa
                    const link = document.createElement("a");
                    link.download = `catatan-pioneer-${Date.now()}.png`;
                    link.href = flippedDataUrl;
                    link.click();

                    console.log("✅ Gambar sudah tegak lurus, Om!");
                }
            };
            img.src = rawDataUrl;
        });
    }

    private createButton(text: string, bgColor: string, onClick: () => void) {
        const btn = document.createElement("button");
        btn.innerText = text;
        btn.style.margin = "5px";
        btn.style.padding = "10px";
        btn.style.cursor = "pointer";
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.backgroundColor = bgColor;
        btn.style.color = "white";
        btn.style.fontWeight = "bold";

        btn.onclick = onClick;
        this.container.appendChild(btn);
    }

    private styleContainer() {
        this.container.style.position = "absolute";
        this.container.style.bottom = "20px";
        this.container.style.left = "50%";
        this.container.style.transform = "translateX(-50%)";
        this.container.style.zIndex = "1000";
        this.container.style.backgroundColor = "rgba(0,0,0,0.5)";
        this.container.style.padding = "10px";
        this.container.style.borderRadius = "15px";
        this.container.style.display = "flex";
        this.container.style.gap = "10px";
    }

    // private async handleSlideUpload(file: File) {
    //     const formData = new FormData();
    //     formData.append('slide', file);

    //     try {
    //         // 1. Upload ke Replit
    //         const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/upload-material`, {
    //             method: 'POST',
    //             body: formData
    //         });
    //         const data = await response.json();

    //         if (data.success) {
    //             // 2. Tampilkan di layar Guru sendiri
    //             await this.wbManager.displaySlide(data.url);

    //             // 3. Broadcast ke semua Siswa melalui NetworkManager/Socket
    //             // Asumsi: networkManager punya fungsi sendSlideUpdate
    //             (this.wbManager as any).network.socket.emit("admin-change-slide", { slideUrl: data.url });
    //         }
    //     } catch (error) {
    //         console.error("Gagal menjahit slide:", error);
    //         alert("Gagal mengupload materi!");
    //     }
    // }
    private async handleSlideUpload(file: File) {
        const formData = new FormData();
        formData.append('slide', file);

        // Pastikan URL tidak memiliki double slash di tengah
        const baseUrl = import.meta.env.VITE_SERVER_URL?.replace(/\/$/, "");
        const uploadUrl = `${baseUrl}/upload-material`;

        console.log("🚀 Mengirim materi ke:", uploadUrl);

        try {
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData
            });

            // Trik Kapten: Ambil teks mentah dulu untuk investigasi jika error
            const responseText = await response.text();

            try {
                const data = JSON.parse(responseText);

                if (data.success) {
                    console.log("✅ Berhasil upload, URL:", data.url);

                    // 1. Tampilkan di Whiteboard lokal (Guru)
                    // Pastikan fungsi displaySlide sudah ada di WhiteboardManager.ts
                    if ((this.wbManager as any).displaySlide) {
                        await (this.wbManager as any).displaySlide(data.url);
                    }

                    // 2. Broadcast ke semua Siswa
                    // Kita gunakan akses network yang ada di WhiteboardManager
                    const network = (this.wbManager as any).network;
                    if (network && network.socket) {
                        network.socket.emit("admin-change-slide", { slideUrl: data.url });
                        console.log("📡 Sinyal slide dikirim ke semua siswa!");
                    }
                } else {
                    console.error("❌ Server nolak upload:", data.message);
                    alert("Server menolak file: " + (data.message || "Unknown error"));
                }
            } catch (jsonError) {
                // Jika masuk ke sini, berarti responseText isinya HTML (Error 404/500)
                console.error("🔥 Error JSON Parsing. Isi respon server:", responseText);
                alert("Gagal upload! Server memberikan respon HTML, kemungkinan Replit Error atau URL salah.");
            }

        } catch (error) {
            console.error("❌ Gagal menjahit slide ke jaringan:", error);
            alert("Koneksi ke Replit gagal!");
        }
    }
}