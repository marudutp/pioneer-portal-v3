import { NetworkManager } from "./NetworkManager";

export class PeerVoice {
    public peerConnection: RTCPeerConnection;
    private networkManager: NetworkManager;
    private remoteUid: string;

    constructor(networkManager: NetworkManager, remoteUid: string) {
        this.networkManager = networkManager;
        this.remoteUid = remoteUid;

        // Gunakan STUN Google agar bisa tembus firewall
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        this.setupHandlers();
    }

    private setupHandlers() {
        // Kirim alamat ICE ke kawan sebelah
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.networkManager.sendIceCandidate(this.remoteUid, event.candidate);
            }
        };

        // SAAT SUARA DITERIMA (Output ke Speaker)
        this.peerConnection.ontrack = (event) => {
            console.log(`🔊 Suara dari ${this.remoteUid} masuk!`);
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.autoplay = true; // Langsung nyala
            
            // Masukkan ke body agar tidak di-garbage collect oleh browser
            document.body.appendChild(audio);
            
            // Paksa putar jika tertahan browser
            audio.play().catch(() => {
                console.warn("⚠️ Audio ditahan, butuh interaksi user di layar!");
            });
        };
    }
}