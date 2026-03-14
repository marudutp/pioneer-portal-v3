import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ROLES, AVATAR_CONFIG } from "@shared/constants";
import { Vector3, Scalar, AnimationGroup, AbstractMesh } from "@babylonjs/core";

export interface UserData {
    uid: string;
    displayName: string;
    role: string;
    x?: number; // Pakai number biasa buat koordinat mentah dari socket
    z?: number;
    position?: BABYLON.Vector3;
    rotation?: BABYLON.Vector3;
}

export class AvatarManager {
    private animations: Map<string, AnimationGroup> = new Map();
    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    // Simpan GUI Rect agar bisa dihapus bareng avatarnya
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    // Buat SATU saja manager UI untuk semua orang
    private uiManager: GUI.AdvancedDynamicTexture;
    // --- TAMBAHKAN BARIS INI, LUR! ---
    public localAvatar: BABYLON.AbstractMesh | null = null;
    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        // Inisialisasi UI Manager sekali saja di awal
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }
    private stopAllAnimations() {
        // Kita suruh semua animasi yang ada di laci untuk berhenti
        this.animations.forEach(anim => {
            if (anim.isPlaying) anim.stop();
        });
    }
    // Fungsi pembantu untuk urusan animasi
    private playLocalAnimation(name: string, loop: boolean) {
        const anim = this.animations.get(name); // Asumsi Om simpan anim di Map
        if (anim && !anim.isPlaying) {
            this.stopAllAnimations();
            anim.play(loop);
        }
    }
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const movementSpeed = 0.15; // Kecepatan jalan
        const rotationSpeed = 0.15; // Kecepatan putar (makin kecil makin halus)

        // 1. Ambil Arah Kamera (Projected to Floor)
        // Kita ambil arah depan kamera, tapi nol-kan sumbu Y supaya avatar gak terbang
        let forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward = forward.normalize();

        // Ambil arah kanan kamera (Cross product antara Up dan Forward)
        let right = Vector3.Cross(Vector3.Up(), forward).normalize();

        // 2. Hitung Vektor Pergerakan Berdasarkan Input Joystick
        // deltaZ = Maju/Mundur, deltaX = Kiri/Kanan
        const moveDirection = forward.scale(deltaZ).add(right.scale(-deltaX));

        // 3. Jika Ada Input (Joystick digerakkan)
        if (moveDirection.length() > 0.001) {
            // A. Gerakkan Avatar dengan Deteksi Tabrakan (Collisions)
            this.localAvatar.moveWithCollisions(moveDirection.scale(movementSpeed));

            // B. Rotasi Halus (Look at Direction)
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRotation,
                rotationSpeed
            );

            // C. Jalankan Animasi Jalan (Contoh: "walk")
            this.playLocalAnimation("walk", true);

            // D. SINKRONISASI KE SERVER (PENTING!)
            // Kirim data ke Replit agar murid lain bisa lihat Om gerak
            if (socket) {
                socket.emit('player_move', {
                    uid: this.localAvatar.name, // atau UID user
                    x: this.localAvatar.position.x,
                    y: this.localAvatar.position.y,
                    z: this.localAvatar.position.z,
                    ry: this.localAvatar.rotation.y
                });
            }
        } else {
            // E. Berhenti & Jalankan Animasi Idle jika tidak ada input
            this.playLocalAnimation("idle", true);
        }
    }
    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        if (this.avatars.has(user.uid)) {
            return this.avatars.get(user.uid)!;
        }

        const isTeacher = user.role === ROLES.TEACHER;
        const colorHex = isTeacher ? AVATAR_CONFIG.TEACHER_COLOR : AVATAR_CONFIG.STUDENT_COLOR;

        const body = BABYLON.MeshBuilder.CreateCapsule(user.uid, {
            height: AVATAR_CONFIG.DEFAULT_HEIGHT,
            radius: 0.4
        }, this.scene);

        // Atur posisi awal (Gunakan data server atau random)
        body.position.x = user.x || (Math.random() * 4 - 2);
        body.position.z = user.z || (Math.random() * 4 - 2);
        body.position.y = AVATAR_CONFIG.DEFAULT_HEIGHT / 2;

        const material = new BABYLON.StandardMaterial(`mat-${user.uid}`, this.scene);
        material.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
        material.emissiveColor = BABYLON.Color3.FromHexString(colorHex).scale(0.2);
        body.material = material;

        // Pasang Label Nama
        this.addNameTag(body, user.uid, user.displayName);

        this.avatars.set(user.uid, body);
        return body;
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        const rect = new GUI.Rectangle();
        rect.width = "150px";
        rect.height = "40px";
        rect.cornerRadius = 5;
        rect.color = "white";
        rect.thickness = 2;
        rect.background = "rgba(0,0,0,0.5)"; // Kasih transparansi biar keren
        this.uiManager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name;
        label.fontSize = 14;
        rect.addControl(label);

        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;

        // Simpan referensi rect agar bisa dihapus nanti
        this.guiElements.set(uid, rect);
    }

    public updateAvatar(uid: string, position: any, rotation: any) {
        const avatar = this.avatars.get(uid);
        if (avatar && position) {
            // Konversi data mentah socket ke Vector3 agar Lerp tidak error
            const targetPos = new BABYLON.Vector3(position.x, position.y, position.z);

            // Cek VALIDASI: Jangan lerp kalau nilainya NaN (Penyebab avatar hilang ke luar angkasa)
            if (!isNaN(targetPos.x)) {
                avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.2);
            }

            if (rotation) {
                const targetRot = new BABYLON.Vector3(rotation.x, rotation.y, rotation.z);
                avatar.rotation = BABYLON.Vector3.Lerp(avatar.rotation, targetRot, 0.2);
            }
        }
    }

    public removeAvatar(uid: string) {
        // 1. Hapus Mesh
        const avatar = this.avatars.get(uid);
        if (avatar) {
            avatar.dispose();
            this.avatars.delete(uid);
        }

        // 2. Hapus GUI (PENTING: Biar gak nyangkut di pojok kiri atas)
        const rect = this.guiElements.get(uid);
        if (rect) {
            rect.dispose();
            this.guiElements.delete(uid);
        }

        console.log(`Avatar ${uid} musnah total, Lur!`);
    }
}