// src/voice/VoiceManager.ts

export class VoiceManager {
    private stream: MediaStream | null = null;
    private peers: Record<string, HTMLAudioElement> = {};

    async init(): Promise<MediaStream> {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        return this.stream;
    }

    registerPeer(id: string, stream: MediaStream) {
        // Jika ID ini sudah ada, hapus dulu supaya bersih
        this.removePeer(id);

        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.id = `audio-${id}`;
        audio.style.display = "none";
        
        this.peers[id] = audio;
        document.body.appendChild(audio);

        audio.play().catch(() => {
            console.warn(`⚠️ Menunggu klik user untuk audio: ${id}`);
            const unlock = () => { audio.play(); window.removeEventListener("pointerdown", unlock); };
            window.addEventListener("pointerdown", unlock);
        });
    }

    removePeer(id: string) {
        if (this.peers[id]) {
            this.peers[id].pause();
            this.peers[id].remove();
            delete this.peers[id];
        }
    }

    updateSpatialAudio(localPos: any, players: Record<string, any>) {
        const VOICE_RADIUS = 40; 
        for (const id in this.peers) {
            const audio = this.peers[id];
            const remotePos = players[id]; // Ambil posisi berdasarkan ID socket yang sama

            if (!remotePos) {
                audio.volume = 1.0; // Jika posisi ga ketemu, full-kan saja biar aman
                continue;
            }

            const dist = Math.sqrt(
                Math.pow(remotePos.x - localPos.x, 2) + 
                Math.pow(remotePos.y - localPos.y, 2) + 
                Math.pow(remotePos.z - localPos.z, 2)
            );

            let volume = 1 - (dist / VOICE_RADIUS);
            audio.volume = Math.max(0, Math.min(1, volume));
        }
    }
}