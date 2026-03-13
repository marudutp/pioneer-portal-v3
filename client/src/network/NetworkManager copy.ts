import { io, Socket } from "socket.io-client";
import { NETWORK_EVENTS, ROLES } from "@shared/constants";
import { AvatarManager } from "../managers/AvatarManager";
import { PeerVoice } from "./PeerVoice";
import { WhiteboardManager } from "../managers/WhiteboardManager"; // 1. IMPORT DULU!

export class NetworkManager {
    private socket: Socket;
    private avatarManager: AvatarManager;
    private peerVoices: Map<string, PeerVoice> = new Map();

    // TAMBAHKAN INI: Agar variabel 'whiteboardManager' dikenal di seluruh class
    private whiteboardManager?: WhiteboardManager;
    // State Management
    public isSceneReady: boolean = false;
    private savedOffer: any = null;
    public localUid: string = "";
    public role: string = "";
    // TAMBAHKAN BARIS INI, MARUDUT!
    private localStream: MediaStream | null = null;

    constructor(serverUrl: string, avatarManager: AvatarManager) {
        this.avatarManager = avatarManager;
        this.socket = io(serverUrl);
        this.setupSocketListeners();
    }

    /**
     * Langkah Pertama: Kirim KTP (UID) ke Server
     */
    public joinClass(uid: string, displayName: string, role: string) {
        this.localUid = uid;
        console.log(`Mencoba join kelas sebagai ${role}, Ferguso...`);
        this.socket.emit(NETWORK_EVENTS.AUTH_JOIN, { uid, displayName, role });

    }
    // 2. Di fungsi Join (setelah sukses AUTH_JOIN)
    public requestWhiteboardSync() {
        this.socket.emit(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ);
    }
    private setupSocketListeners() {
        // Tambahkan ini di dalam setupSocketListeners()
        // Tambahkan ini di dalam setupSocketListeners()
        this.socket.on('currentPlayers', (players: any) => {
            console.log("Menerima daftar absen kelas...", players);
            Object.keys(players).forEach((id) => {
                const p = players[id];
                // Jangan bikin avatar untuk diri sendiri (localUid)
                if (p.uid !== this.localUid) {
                    console.log(`Menampilkan kawan lama: ${p.displayName}`);
                    this.avatarManager.createAvatar(p);

                    // Karena mereka sudah ada duluan, kita yang ajak "kenalan" (WebRTC Caller)
                    this.initWebRTC(p.uid, true);
                }
            });
        });
        // 0. Terima Peran dari Server (Handshake Sukses)
        this.socket.on('assignRole', (data: { role: string }) => {
            this.role = data.role; // Simpan role: 'guru' atau 'siswa'
            console.log(`🎭 Peran kamu resmi sebagai: ${this.role.toUpperCase()}`);

            // LOGIKA AUTO-SYNC UNTUK SISWA TELAT
            // Jika kita masuk sebagai siswa, langsung minta "contekkan" papan tulis
            if (this.role === ROLES.STUDENT) {
                this.requestWhiteboardSync();
            }

            // Jika kita Guru, munculkan tombol Clear Board (opsional jika logic ada di main.ts)
            const teacherTools = document.getElementById("teacher-tools");
            if (this.role === ROLES.TEACHER && teacherTools) {
                teacherTools.style.display = "block";
            }
        });
        // 1. Handle Penolakan (1 Laptop 1 User)
        this.socket.on(NETWORK_EVENTS.AUTH_ERROR, (message: string) => {
            alert(`Akses Ditolak: ${message}`);
            window.location.reload(); // Paksa keluar
        });

        // 2. Ada User Baru Masuk
        this.socket.on(NETWORK_EVENTS.USER_JOINED, (player) => {
            console.log("User baru nongol:", player.displayName); // Cek log di sini
            this.avatarManager.createAvatar(player);

            // Inisialisasi WebRTC untuk user baru ini
            this.initWebRTC(player.uid, false);
        });

        // 3. Terima Sinyal WebRTC (The savedOffer Logic)
        this.socket.on(NETWORK_EVENTS.OFFER, (data: any) => {
            if (!this.isSceneReady) {
                console.log("Scene belum siap, simpan offer dulu...");
                this.savedOffer = data;
            } else {
                this.handleRemoteOffer(data);
            }
        });

        this.socket.on(NETWORK_EVENTS.ANSWER, (data: any) => {
            const pv = this.peerVoices.get(data.from);
            if (pv) pv.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        });

        this.socket.on(NETWORK_EVENTS.ICE_CANDIDATE, (data: any) => {
            const pv = this.peerVoices.get(data.from);
            if (pv) pv.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        });

        // 4. Sinkronisasi Gerakan
        this.socket.on(NETWORK_EVENTS.AVATAR_UPDATE, (data: any) => {
            if (data.uid !== this.localUid) {
                this.avatarManager.updateAvatar(data.uid, data.position, data.rotation);
            }
        });

        // 5. User Cabut
        this.socket.on(NETWORK_EVENTS.USER_LEFT, (uid: string) => {
            this.avatarManager.removeAvatar(uid);
            this.peerVoices.delete(uid);
        });

        // Di dalam setupSocketListeners() NetworkManager.ts
        this.socket.on(NETWORK_EVENTS.WHITEBOARD_CLEAR, () => {
            console.log("Menerima perintah hapus papan dari Guru!");
            this.whiteboardManager?.clearBoard(false); // false agar tidak terjadi loop kirim-balas
        });

        // 1. Di setupSocketListeners()
        this.socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_REQ, (data: any) => {
            if (this.role === ROLES.TEACHER) {
                const snapshot = this.whiteboardManager?.getCanvasSnapshot();
                this.socket.emit(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, {
                    img: snapshot,
                    to: data.requester
                });
            }
        });

        this.socket.on(NETWORK_EVENTS.WHITEBOARD_SYNC_RES, (data: any) => {
            this.whiteboardManager?.applySnapshot(data.img);
        });


    }

    /**
     * Fungsi Sakti untuk mengenalkan Whiteboard ke Network
     */
    public setWhiteboardManager(manager: WhiteboardManager) {
        this.whiteboardManager = manager;
    }
    // Fungsi untuk dikirim ke server
    public sendClearBoard() {
        this.socket.emit(NETWORK_EVENTS.WHITEBOARD_CLEAR);
    }
    /**
     * Dipanggil oleh main.ts setelah Babylon Scene selesai Loading
     */
    public setReady() {
        this.isSceneReady = true;
        if (this.savedOffer) {
            console.log("Memproses offer yang tadi tertunda...");
            this.handleRemoteOffer(this.savedOffer);
            this.savedOffer = null;
        }
    }

    public async startVoiceChat() {
    try {
        // Ini adalah perintah yang tadi kamu ketik manual di console
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            } 
        });
        
        console.log("🎤 Mikrofon Berhasil Diaktifkan lewat Kode!");

        // Masukkan suara kita ke semua orang yang sudah ada di kelas
        this.peerVoices.forEach(pv => {
            this.localStream?.getTracks().forEach(track => {
                pv.peerConnection.addTrack(track, this.localStream!);
            });
        });
    } catch (err) {
        console.error("❌ Gagal akses mik via kode:", err);
    }
}
    private async initWebRTC(remoteUid: string, isCaller: boolean) {
        // 1. Buat koneksi baru untuk user ini
        const pv = new PeerVoice(this, remoteUid);
        this.peerVoices.set(remoteUid, pv);
        // 1. MASUKKAN SUARA KITA KE PIPA
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pv.peerConnection.addTrack(track, this.localStream!);
            });
        }

        // 2. TANGKAP SUARA DIA
        pv.onRemoteStream = (stream) => {
            console.log(`🔊 Dapet suara dari: ${remoteUid}`);
            // Kirim stream ini ke VoiceManager untuk dijadikan suara 3D
            // this.voiceManager.attachStreamToAvatar(remoteUid, stream); 
        };
        if (isCaller) {
            console.log(`Mengajak ngobrol ${remoteUid}...`);
            try {
                // Buat 'undangan' suara
                const offer = await pv.peerConnection.createOffer();
                await pv.peerConnection.setLocalDescription(offer);

                // Kirim ke server untuk diteruskan ke target
                this.socket.emit(NETWORK_EVENTS.OFFER, {
                    offer: offer,
                    toUid: remoteUid
                });
            } catch (e) {
                console.error("Gagal buat WebRTC Offer:", e);
            }
        }
    }

    private async handleRemoteOffer(data: any) {
        const { from, offer } = data;
        console.log(`Menerima ajakan ngobrol dari ${from}`);

        // 1. Siapkan koneksi untuk si pengirim
        let pv = this.peerVoices.get(from);
        if (!pv) {
            pv = new PeerVoice(this, from);
            this.peerVoices.set(from, pv);
        }

        try {
            // 2. Terima undangannya
            await pv.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // 3. Buat 'jawaban'
            const answer = await pv.peerConnection.createAnswer();
            await pv.peerConnection.setLocalDescription(answer);

            // 4. Kirim balik jawabannya lewat server
            this.socket.emit(NETWORK_EVENTS.ANSWER, {
                answer: answer,
                toUid: from
            });
        } catch (e) {
            console.error("Gagal balas WebRTC Offer:", e);
        }
    }

    public sendMovement(position: any, rotation: any) {
        this.socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, { position, rotation });
    }

}