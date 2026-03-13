import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ROLES, AVATAR_CONFIG } from "@shared/constants";

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