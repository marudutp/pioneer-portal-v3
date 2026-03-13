// // src/voice/VoiceManager.ts

// export class VoiceManager {
//     private stream: MediaStream | null = null;
//     // Simpan referensi audio element agar bisa dihapus dari DOM
//     private peers: Record<string, HTMLAudioElement> = {};

//     async init(): Promise<MediaStream> {
//         this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//         return this.stream;
//     }

//     registerPeer(id: string, stream: MediaStream) {
//         console.log(`🔈 Mencoba membunyikan suara dari: ${id}`);
//         // Hapus jika ID lama masih ada (mencegah duplikat)
//         this.removePeer(id);

//         const audio = document.createElement("audio");
//         audio.srcObject = stream;
//         audio.autoplay = true;

//         // Sembunyikan elemen tapi tetap di halaman agar suara jalan
//         audio.style.display = "none";
//         audio.id = `audio-${id}`;

//         this.peers[id] = audio;
//         document.body.appendChild(audio);
//         console.log(`🔊 Audio terdaftar untuk: ${id}`);
//     }

//     // FUNGSI PERBAIKAN: Menghapus dari memori DAN dari halaman web
//     removePeer(id: string) {
//         if (this.peers[id]) {
//             const audio = this.peers[id];
//             audio.pause();
//             audio.srcObject = null;
//             audio.remove(); // Hapus dari DOM (HTML)
//             delete this.peers[id]; // Hapus dari Record (Memory)
//             console.log(`🔇 Audio dihapus: ${id}`);
//         }
//     }

//     updateSpatialAudio(localPos: { x: number; y: number; z: number }, players: Record<string, { x: number; y: number; z: number }>) {
//         const VOICE_RADIUS = 25;

//         for (const id in this.peers) {
//             const audio = this.peers[id];
//             const remote = players[id];

//             if (!remote) continue;

//             const dx = remote.x - localPos.x;
//             const dy = remote.y - localPos.y;
//             const dz = remote.z - localPos.z;
//             const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

//             // Logika Volume: Semakin jauh semakin pelan
//             let volume = 1 - (dist / VOICE_RADIUS);
//             if (volume < 0) volume = 0;
//             if (volume > 1) volume = 1;

//             audio.volume = volume;
//         }
//     }
// }

// src/voice/VoiceManager.ts

export class VoiceManager {
    private stream: MediaStream | null = null;
    private peers: Record<string, HTMLAudioElement> = {};

    async init(): Promise<MediaStream> {
        // Tambahkan constraint echoCancellation agar suara lebih jernih
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        return this.stream;
    }

    // registerPeer(id: string, stream: MediaStream) {
    //     console.log(`🔈 Mencoba membunyikan suara dari ID: ${id}`);

    //     this.removePeer(id);

    //     const audio = document.createElement("audio");
    //     audio.srcObject = stream;
    //     audio.autoplay = true;
    //     audio.id = `audio-${id}`;
    //     audio.style.display = "none";

    //     // PENTING: Untuk HTTPS, browser sering butuh volume di-set manual di awal
    //     audio.volume = 1.0; 

    //     this.peers[id] = audio;
    //     document.body.appendChild(audio);

    //     // PAKSA PLAY (Browser Policy Fix)
    //     audio.play().catch(e => {
    //         console.warn(`⚠️ Browser menahan audio ${id}, menunggu klik user...`);
    //         window.addEventListener("pointerdown", () => audio.play(), { once: true });
    //     });

    //     console.log(`✅ Audio terdaftar & dimainkan untuk: ${id}`);
    // }

    // Tambahkan/Update fungsi ini di VoiceManager.ts
    registerPeer(id: string, stream: MediaStream) {
        this.removePeer(id);

        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.id = `audio-${id}`;
        audio.style.display = "none";

        this.peers[id] = audio;
        document.body.appendChild(audio);

        // FIX: Paksa putar audio. Jika diblokir browser, tunggu klik pertama user.
        audio.play().catch(() => {
            console.warn("⚠️ Audio diblokir browser. Menunggu interaksi user...");
            const unlock = () => {
                audio.play();
                window.removeEventListener("pointerdown", unlock);
            };
            window.addEventListener("pointerdown", unlock);
        });
    }
    removePeer(id: string) {
        if (this.peers[id]) {
            const audio = this.peers[id];
            audio.pause();
            audio.srcObject = null;
            audio.remove();
            delete this.peers[id];
            console.log(`🔇 Audio dihapus: ${id}`);
        }
    }

    updateSpatialAudio(localPos: { x: number; y: number; z: number }, players: Record<string, { x: number; y: number; z: number }>) {
        const VOICE_RADIUS = 30; // Sedikit diperbesar agar tidak terlalu sensitif

        for (const id in this.peers) {
            const audio = this.peers[id];

            // Perbaikan: Jika kita pakai ID statis "teacher", 
            // kita harus cari posisi player yang rolenya guru.
            // Tapi paling aman, gunakan ID socket asli.
            const remote = players[id];

            if (!remote) {
                // Jika posisi tidak ditemukan (mungkin karena ID mismatch), 
                // kita set volume maksimal saja agar suara tetap terdengar dulu.
                audio.volume = 1.0;
                continue;
            }

            const dx = remote.x - localPos.x;
            const dy = remote.y - localPos.y;
            const dz = remote.z - localPos.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            let volume = 1 - (dist / VOICE_RADIUS);
            if (volume < 0) volume = 0;
            if (volume > 1) volume = 1;

            audio.volume = volume;
        }
    }
}