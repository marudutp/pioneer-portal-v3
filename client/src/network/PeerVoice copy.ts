// export class PeerVoice {
//     private pc: RTCPeerConnection;

//     constructor(private network: any, private onRemote: (stream: MediaStream) => void) {
//         this.pc = new RTCPeerConnection({
//             // Port 19302 adalah port standar Google STUN
//             iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
//         });

//         this.pc.ontrack = (e) => {
//             console.log("🔊 Track audio diterima dari peer!");
//             if (e.streams && e.streams[0]) {
//                 // Jangan buat elemen audio di sini, biarkan VoiceManager yang urus
//                 // agar Spatial Audio (Volume jarak) berfungsi!
//                 this.onRemote(e.streams[0]);
//             }
//         };

//         this.pc.onicecandidate = (e) => {
//             if (e.candidate) {
//                 // Pastikan struktur pengiriman ICE sesuai dengan listener di server
//                 this.network.socket.emit('voice-ice', { 
//                     candidate: e.candidate 
//                 });
//             }
//         };
//     }

//     attachLocalStream(stream: MediaStream) {
//         // Tambahkan track lokal (Mic kita) ke koneksi untuk dikirim ke orang lain
//         stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
//     }

//     async createOffer() {
//         const offer = await this.pc.createOffer();
//         await this.pc.setLocalDescription(offer);
//         // Pastikan struktur pengiriman Offer sesuai dengan listener di server
//         this.network.socket.emit('voice-offer', { offer: offer });
//     }

//     async handleOffer(offer: any) {
//         await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
//         const answer = await this.pc.createAnswer();
//         await this.pc.setLocalDescription(answer);
//         // Pastikan struktur pengiriman Answer sesuai dengan listener di server
//         this.network.socket.emit('voice-answer', { answer: answer });
//     }

//     async handleAnswer(answer: any) {
//         await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
//     }

//     async addIce(candidate: any) {
//         try {
//             await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
//         } catch (e) {
//             console.warn("⚠️ Gagal menambahkan ICE Candidate:", e);
//         }
//     }
// }

// export class PeerVoice {
//     private pc: RTCPeerConnection;
//     public onRemoteStream?: (stream: MediaStream) => void;
//     constructor(private network: any, private onRemote: (stream: MediaStream) => void) {
//         this.pc = new RTCPeerConnection({
//             iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
//         });

//         this.pc.ontrack = (e) => {
//             if (e.streams && e.streams[0]) this.onRemote(e.streams[0]);
//         };

//         this.pc.onicecandidate = (e) => {
//             if (e.candidate) this.network.socket.emit('voice-ice', { candidate: e.candidate });
//         };
//     }

//     attachLocalStream(stream: MediaStream) {
//         stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
//     }

//     async createOffer() {
//         const offer = await this.pc.createOffer();
//         await this.pc.setLocalDescription(offer);
//         this.network.socket.emit('voice-offer', { offer });
//     }

//     async handleOffer(offer: any) {
//         await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
//         const answer = await this.pc.createAnswer();
//         await this.pc.setLocalDescription(answer);
//         this.network.socket.emit('voice-answer', { answer });
//     }

//     async handleAnswer(answer: any) {
//         await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
//     }

//     async addIce(candidate: any) {
//         await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
//     }
// }

import { NETWORK_EVENTS } from "@shared/constants";

export class PeerVoice {
    // 1. Ubah jadi PUBLIC agar NetworkManager bisa akses .setRemoteDescription dll
    // 2. Gunakan nama 'peerConnection' agar sesuai dengan kode di NetworkManager kamu
    public peerConnection: RTCPeerConnection;
    
    // Properti publik untuk diisi callback dari luar
    public onRemoteStream?: (stream: MediaStream) => void;

    constructor(private network: any, private targetUid: string) { 
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // Handler saat stream suara lawan diterima
        this.peerConnection.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                console.log(`🔊 Track audio dari ${this.targetUid} diterima!`);
                if (this.onRemoteStream) {
                    this.onRemoteStream(e.streams[0]);
                }
            }
        };

        // Handler saat jalur koneksi ditemukan
        this.peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                // V3: Kirim spesifik ke targetUid melalui server
                this.network.socket.emit(NETWORK_EVENTS.ICE_CANDIDATE, { 
                    candidate: e.candidate, 
                    toUid: this.targetUid 
                });
            }
        };
    }

    /**
     * Menempelkan microphone lokal ke koneksi ini
     */
    public attachLocalStream(stream: MediaStream) {
        stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, stream);
        });
    }

    /**
     * GURU/SISWA PERTAMA: Membuat penawaran koneksi
     */
    public async createOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // V3: Kirim targeted offer
        this.network.socket.emit(NETWORK_EVENTS.OFFER, { 
            offer, 
            toUid: this.targetUid 
        });
    }

    /**
     * MENANGGAPI: Membuat jawaban koneksi
     */
    public async handleOffer(offer: any) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        // V3: Kirim targeted answer
        this.network.socket.emit(NETWORK_EVENTS.ANSWER, { 
            answer, 
            toUid: this.targetUid 
        });
    }

    public async handleAnswer(answer: any) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    public async addIce(candidate: any) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) { 
            console.warn("ICE Error, Ferguso:", e); 
        }
    }
}