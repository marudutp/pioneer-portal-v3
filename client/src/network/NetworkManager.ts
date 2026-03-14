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

    constructor(serverUrl: string, avatarManager: AvatarManager) {
        this.avatarManager = avatarManager;
        this.socket = io(serverUrl, {
            secure: true, transports: ['websocket'],
            upgrade: false,
            reconnection: true,
            reconnectionAttempts: 10,
            timeout: 2000
        });
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

        // this.socket.on(NETWORK_EVENTS.USER_JOINED, (player) => {
        //     this.avatarManager.createAvatar(player);
        //     this.initWebRTC(player.uid, false);
        // });

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

        // Di dalam setupSocketListeners()

        this.socket.on(NETWORK_EVENTS.AVATAR_UPDATE, (data: any) => {
            // 1. Cek apakah datanya punya UID
            // 2. Cek apakah UID-nya BUKAN kita (Jangan gerakkan diri sendiri lewat sinyal server)
            if (data.uid && data.uid !== this.localUid) {
                // console.log(`Menggerakkan kawan: ${data.uid}`);
                this.avatarManager.updateAvatar(data.uid, data.position, data.rotation);
            }
        });



        // this.socket.on("remoteDraw", (data: any) => {
        //     if (this.whiteboardManager) {
        //         // Siswa menggambar di papan mereka berdasarkan data dari Guru
        //         this.whiteboardManager.drawLocally(
        //             data.x1, data.y1,
        //             data.x2, data.y2,
        //             data.color,
        //             data.size
        //         );
        //     }
        // });
        // Di setupSocketListeners() NetworkManager.ts

        // Pastikan Siswa dengerin 'remoteDraw' sesuai perintah Server!
        // this.socket.on("remoteDraw", (data: any) => {
        //     console.log("Menerima coretan remote dari Guru!"); // Cek di console Siswa
        //     if (this.whiteboardManager) {
        //         this.whiteboardManager.drawLocally(
        //             data.x1, data.y1,
        //             data.x2, data.y2,
        //             data.color,
        //             data.size
        //         );
        //     }
        // });

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

        this.socket.on('capacityUpdate', (data: { current: number, max: number }) => {
            const currentEl = document.getElementById('current-cap');
            const maxEl = document.getElementById('max-cap');

            if (currentEl && maxEl) {
                currentEl.innerText = data.current.toString();
                maxEl.innerText = data.max.toString();

                // Kasih efek warna merah kalau sudah mau penuh
                const indicator = document.getElementById('capacity-indicator');
                if (indicator) {
                    indicator.style.color = data.current >= data.max ? '#ff0000' : '#00ff00';
                    indicator.style.borderColor = data.current >= data.max ? '#ff0000' : '#00ff00';
                }
            }
        });

        // Listener untuk pesan error (jika ditendang)
        this.socket.on('error_message', (data: { title: string, message: string }) => {
            alert(`${data.title}\n\n${data.message}`);
        });
    }

    /**
     * FIX ERROR 1: Fungsi pengaman agar track tidak ditambah dua kali
     */
    // private addLocalTracksToPeer(pv: PeerVoice) {
    //     if (!this.localStream) return;

    //     this.localStream.getTracks().forEach(track => {
    //         // Cek dulu apakah track ini sudah pernah ditempel ke koneksi ini
    //         const alreadyExists = pv.peerConnection.getSenders().find(s => s.track === track);
    //         if (!alreadyExists) {
    //             pv.peerConnection.addTrack(track, this.localStream!);
    //         }
    //     });
    // }

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