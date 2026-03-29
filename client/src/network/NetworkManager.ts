import { io, Socket } from "socket.io-client";
import { NETWORK_EVENTS, ROLES } from "@shared/constants";
import { AvatarManager } from "../managers/AvatarManager";
import { PeerVoice } from "./PeerVoice";
import { WhiteboardManager } from "../managers/WhiteboardManager";

export class NetworkManager {
    // private socket: Socket;
    public socket: any;
    private avatarManager: AvatarManager;
    private peerVoices: Map<string, PeerVoice> = new Map();
    private localStream: MediaStream | null = null;

    private isSceneReady: boolean = false;
    private savedOffer: any = null;
    // 1. Tambahkan property ini di bagian atas class
    private whiteboardManager: WhiteboardManager | null = null;
    public localUid: string = "";
    public role: string = "";
    // Di dalam class NetworkManager

    // Fungsi untuk mendaftarkan manager dari main.ts

    constructor(serverUrl: string, avatarManager: AvatarManager) {
        this.avatarManager = avatarManager;
        this.socket = io(serverUrl, {
            secure: true, transports: ['websocket'],
            upgrade: false,
            reconnection: true,
            reconnectionAttempts: 10,
            timeout: 2000
        });
        // 🔥 TAMBAHKAN: Heartbeat untuk menjaga koneksi aktif
        setInterval(() => {
            if (this.socket && this.socket.connected && this.localUid) {
                this.socket.emit('heartbeat', { uid: this.localUid, timestamp: Date.now() });
            }
        }, 5000);
        this.setupSocketListeners();
    }
    public setWhiteboardManager(wb: WhiteboardManager) {
        this.whiteboardManager = wb;
        console.log("📡 NetworkManager sekarang terhubung ke Papan Tulis!");
    }

    public joinClass(uid: string, displayName: string, role: string) {
        this.localUid = uid;
        this.socket.emit(NETWORK_EVENTS.AUTH_JOIN, { uid, displayName, role });
    }

    public async startVoiceChat() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("🎤 Mikrofon Aktif!");

            this.peerVoices.forEach(pv => {
                this.addLocalTracksToPeer(pv);
            });
        } catch (e) {
            console.error("❌ Gagal akses mik:", e);
        }
    }

    /**
     * FIX ERROR 2: Mengembalikan fungsi sendMovement yang hilang
     */
    // NetworkManager.ts

    public sendMovement(position: any, rotation: any) {
        // Tambahkan 'uid' agar laptop lain tahu ini gerakan MILIK SIAPA
        this.socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
            uid: this.localUid,
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
        });
    }

    public sendDrawData(data: any) {
        if (this.socket) {
            console.log("📤 [Network] Mengirim coretan ke server...");
            this.socket.emit("drawData", data);
        }
    }

    public sendClearBoard() {
        if (this.socket) {
            this.socket.emit("clearBoard");
            console.log("🧹 Mengirim perintah hapus papan ke server...");
        }
    }

    public setReady() {
        this.isSceneReady = true;
        if (this.savedOffer) {
            this.handleRemoteOffer(this.savedOffer);
            this.savedOffer = null;
        }
    }

    private setupSocketListeners() {
        // this.socket.on('currentPlayers', (players: any) => {
        //     Object.keys(players).forEach((id) => {
        //         const p = players[id];
        //         if (p.uid !== this.localUid) {
        //             this.avatarManager.createAvatar(p);
        //             this.initWebRTC(p.uid, true);
        //         }
        //     });
        // });

        // --- PASANG TELINGA PENGUMUMAN DISINI ---
        this.socket.on('announcement', (message: string) => {
            console.log("📢 Pesan Admin masuk:", message);
            // Pakai alert supaya murid langsung 'ngeh'
            alert("📢 PENGUMUMAN GURU:\n\n" + message);
        });

        this.socket.on('currentPlayers', (players: any) => {
            console.log("Menerima daftar absen dari server:", players);

            Object.keys(players).forEach((id) => {
                const p = players[id];

                // JANGAN menggambar diri sendiri lagi (karena kita sudah punya kapsul lokal)
                if (p.uid !== this.localUid) {
                    console.log(`Menggambar avatar kawan lama: ${p.displayName} (${p.uid})`);
                    this.avatarManager.createAvatar(p);

                    // Inisialisasi suara WebRTC untuk orang ini
                    this.initWebRTC(p.uid, true);
                }
            });
        });


        //Melihat ada orang baru yang baru saja masuk
        this.socket.on(NETWORK_EVENTS.USER_JOINED, (player) => {
            console.log(`Ada murid baru masuk: ${player.displayName} (${player.uid})`);

            // Pastikan ini bukan diri kita sendiri (jaga-jaga server salah kirim)
            if (player.uid !== this.localUid) {
                this.avatarManager.createAvatar(player);

                // Tunggu dia yang menelpon kita (Receiver)
                this.initWebRTC(player.uid, false);
            }
        });

        this.socket.on(NETWORK_EVENTS.OFFER, (data: any) => {
            if (!this.isSceneReady) {
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
            if (pv && data.candidate) {
                pv.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        this.socket.on(NETWORK_EVENTS.USER_LEFT, (uid: string) => {
            this.avatarManager.removeAvatar(uid);
            this.peerVoices.delete(uid);
        });


        // NetworkManager.ts - setupSocketListeners
        this.socket.on(NETWORK_EVENTS.AVATAR_UPDATE, (data: any) => {
            // 🔥 PERBAIKAN: Filter lebih ketat
            if (!data || !data.uid) return;

            // Jangan proses update dari diri sendiri
            if (data.uid === this.localUid) {
                return;
            }

            // 🔥 PERBAIKAN: Jangan proses update jika data tidak lengkap
            if (!data.position || !data.rotation) {
                console.warn("⚠️ Data update tidak lengkap dari", data.uid);
                return;
            }

            console.log(`📡 Update dari ${data.uid}: pos=${data.position.x}, ${data.position.z}`);

            const payload = {
                x: data.position.x,
                y: data.position.y,
                z: data.position.z,
                ry: data.rotation.y || data.rotation.ry || 0
            };

            this.avatarManager.updateAvatar(data.uid, payload);
        });


        this.socket.on("update-whiteboard-slide", (data: { slideUrl: string }) => {
            // Pastikan manager tidak null
            if (this.whiteboardManager && data && data.slideUrl) {
                this.whiteboardManager.displaySlide(data.slideUrl);
            } else {
                console.warn("⚠️ Gagal update slide: Manager atau Data kosong.");
            }
        });




        // SISWA: Menerima coretan dari Guru
        // NetworkManager.ts - Di dalam setupSocketListeners()

        // 1. SISWA: Dengerin Guru gambar
        // Di NetworkManager.ts (Sisi Siswa)
        this.socket.on("remoteDraw", (data: any) => {
            if (this.whiteboardManager) {
                // Panggil drawLocally dengan 4 koordinat yang dikirim Guru tadi
                this.whiteboardManager.drawLocally(
                    data.x1, data.y1,
                    data.x2, data.y2,
                    data.color,
                    data.size
                );
            }
        });

        // 2. SISWA: Dengerin Guru hapus papan
        this.socket.on("clearBoard", () => {
            if (this.whiteboardManager) {
                console.log("🧼 PERINTAH HAPUS MASUK!");
                this.whiteboardManager.clearBoard(false); // false agar tidak lapor balik ke server
            }
        });



        // DI SISI CLIENT (NetworkManager.ts atau main.ts)
        this.socket.on('capacityUpdate', (data: { current: number, max: number }) => {
            console.log("Menerima update kapasitas:", data);
            // // 🔥 PANGGIL FUNGSI UPDATE UI DI SINI
            // updateCapacityUI(data.current, data.max);
            // // Cari elemen span yang ada di index.html Om
            // const currentEl = document.getElementById('current-cap');
            // const maxEl = document.getElementById('max-cap');

            // if (currentEl) currentEl.innerText = data.current.toString();
            // if (maxEl) maxEl.innerText = data.max.toString();
            // Panggil fungsi update UI jika tersedia
            if (typeof window !== 'undefined' && window.updateCapacityUI) {
                window.updateCapacityUI(data.current, data.max);
                console.log(`✅ UI kapasitas diupdate ke: ${data.current}/${data.max}`);
            } else {
                console.warn("⚠️ Fungsi updateCapacityUI belum terdaftar di window");

                // Fallback: update langsung ke DOM
                const currentEl = document.getElementById('current-capacity');
                const maxEl = document.getElementById('max-capacity');
                if (currentEl) currentEl.innerText = data.current.toString();
                if (maxEl) maxEl.innerText = data.max.toString();
            }

        });

        // Tambahkan listener untuk update slide dari Admin
        this.socket.on("update-whiteboard-2", (data: { slideUrl: string }) => {
            console.log("📺 Mendapat update slide:", data.slideUrl);

            // Cek apakah managernya sudah duduk di kursinya
            if (this.whiteboardManager) {
                this.whiteboardManager.displaySlide(data.slideUrl);
            } else {
                console.warn("⚠️ WhiteboardManager belum terdaftar di NetworkManager");
            }
        });
        // Listener untuk pesan error (jika ditendang)
        this.socket.on('error_message', (data: { title: string, message: string }) => {
            alert(`${data.title}\n\n${data.message}`);
        });
    }



    private addLocalTracksToPeer(pv: PeerVoice) {
        if (!this.localStream) {
            console.warn("⚠️ Mikrofon belum siap, mencoba ambil izin lagi...");
            this.startVoiceChat(); // Paksa minta izin jika belum ada
            return;
        }

        this.localStream.getTracks().forEach(track => {
            const senders = pv.peerConnection.getSenders();
            const alreadyExists = senders.find(s => s.track === track);
            if (!alreadyExists) {
                pv.peerConnection.addTrack(track, this.localStream!);
                console.log("🎤 Track suara ditempel ke peer!");
            }
        });
    }

    private async initWebRTC(remoteUid: string, isCaller: boolean) {
        const pv = new PeerVoice(this, remoteUid);
        this.peerVoices.set(remoteUid, pv);

        this.addLocalTracksToPeer(pv);

        if (isCaller) {
            const offer = await pv.peerConnection.createOffer();
            await pv.peerConnection.setLocalDescription(offer);
            this.socket.emit(NETWORK_EVENTS.OFFER, { offer, toUid: remoteUid });
        }
    }

    private async handleRemoteOffer(data: any) {
        let pv = this.peerVoices.get(data.from);
        if (!pv) {
            pv = new PeerVoice(this, data.from);
            this.peerVoices.set(data.from, pv);
        }

        await pv.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        this.addLocalTracksToPeer(pv);

        const answer = await pv.peerConnection.createAnswer();
        await pv.peerConnection.setLocalDescription(answer);
        this.socket.emit(NETWORK_EVENTS.ANSWER, { answer, toUid: data.from });
    }

    public sendIceCandidate(toUid: string, candidate: RTCIceCandidate) {
        this.socket.emit(NETWORK_EVENTS.ICE_CANDIDATE, { candidate, toUid });
    }
}