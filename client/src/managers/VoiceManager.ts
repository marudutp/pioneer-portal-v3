import * as BABYLON from "@babylonjs/core";

// GANTI YANG LAMA DENGAN INI:
import { AUDIO_CONFIG } from "@shared/constants";
export class VoiceManager {
    private scene: BABYLON.Scene;
    private remoteSounds: Map<string, BABYLON.Sound> = new Map();
    private isUnlocked: boolean = false;

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.setupAudioUnlocker();
    }

    /**
     * MEKANISME AUDIO UNLOCKER
     * Menembus kebijakan Autoplay browser, Ferguso!
     */
    private setupAudioUnlocker() {
        const unlock = () => {
            if (this.isUnlocked) return;
            
            // Resume Audio Context Babylon
            if (BABYLON.Engine.audioEngine) {
                BABYLON.Engine.audioEngine.unlock();
                console.log("Audio Engine Unlocked! Siap dengerin gosip di kelas...");
                this.isUnlocked = true;
                
                // Hapus listener biar hemat memori
                window.removeEventListener("pointerdown", unlock);
                window.removeEventListener("keydown", unlock);
            }
        };

        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
    }

    /**
     * Memasang Stream Suara ke Avatar (Spatial Audio)
     * @param uid ID pemilik suara
     * @param stream MediaStream dari WebRTC
     * @param mesh Mesh avatar lawan agar suara 'menempel' di sana
     */
    public addRemoteStream(uid: string, stream: MediaStream, mesh: BABYLON.AbstractMesh) {
        // Jika sudah ada sound untuk UID ini, hapus dulu yang lama
        if (this.remoteSounds.has(uid)) {
            this.remoteSounds.get(uid)?.dispose();
        }

        console.log(`Menghubungkan Spatial Audio untuk user: ${uid}`);

        // Buat sound object Babylon
        const remoteSound = new BABYLON.Sound(
            `voice-${uid}`,
            stream,
            this.scene,
            null, 
            {
                streaming: true,
                autoplay: true,
                spatialSound: true, // AKTIFKAN SPATIAL AUDIO!
                maxDistance: AUDIO_CONFIG.MAX_DISTANCE,
                refDistance: AUDIO_CONFIG.REF_DISTANCE,
                rolloffFactor: AUDIO_CONFIG.ROLLOFF_FACTOR,
                distanceModel: "exponential" // Suara mengecil secara alami
            }
        );

        // Tempelkan suara ke hidung avatarnya, Ferguso!
        remoteSound.attachToMesh(mesh);
        
        this.remoteSounds.set(uid, remoteSound);
    }

    /**
     * Bersihkan suara saat user keluar
     */
    public removeRemoteStream(uid: string) {
        if (this.remoteSounds.has(uid)) {
            this.remoteSounds.get(uid)?.dispose();
            this.remoteSounds.delete(uid);
            console.log(`Suara user ${uid} sudah dimatikan.`);
        }
    }
}