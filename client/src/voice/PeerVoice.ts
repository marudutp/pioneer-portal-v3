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

export class PeerVoice {
    private pc: RTCPeerConnection;
    // TAMBAHKAN INI: Properti publik agar bisa diisi dari main.ts
    public onRemoteStream?: (stream: MediaStream) => void;

    constructor(private network: any) { // Hapus argument onRemote di constructor
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        this.pc.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                console.log("🔊 Track audio diterima!");
                // Panggil onRemoteStream jika sudah diisi
                if (this.onRemoteStream) {
                    this.onRemoteStream(e.streams[0]);
                }
            }
        };

        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.network.socket.emit('voice-ice', { candidate: e.candidate });
            }
        };
    }

    attachLocalStream(stream: MediaStream) {
        stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
    }

    async createOffer() {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.network.socket.emit('voice-offer', { offer });
    }

    async handleOffer(offer: any) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.network.socket.emit('voice-answer', { answer });
    }

    async handleAnswer(answer: any) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }

    async addIce(candidate: any) {
        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) { console.warn("ICE Error:", e); }
    }
}