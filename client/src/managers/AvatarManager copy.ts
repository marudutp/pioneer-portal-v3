import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui"; // Jangan lupa install @babylonjs/gui
import { ROLES, AVATAR_CONFIG } from "@shared/constants";

export interface UserData {
    uid: string;
    displayName: string;
    role: string;
    position?: BABYLON.Vector3;
    rotation?: BABYLON.Vector3;
}

export class AvatarManager {
    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    public localAvatar: BABYLON.AbstractMesh | null = null;

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
    }

    /**
     * Membuat 'tubuh' untuk user (Lokal maupun Remote)
     */
    // public createAvatar(user: UserData): BABYLON.AbstractMesh {
    //     // 1. Tentukan warna berdasarkan Role
    //     const roleColor = user.role === ROLES.TEACHER
    //         ? AVATAR_CONFIG.TEACHER_COLOR
    //         : AVATAR_CONFIG.STUDENT_COLOR;

    //     // 2. Terapkan warna ke Label Nama (GUI)
    //     const label = new GUI.TextBlock();
    //     label.text = user.displayName;
    //     label.color = roleColor; // Warna otomatis berubah sesuai role!

    //     // 3. Atur posisi Label berdasarkan Tinggi Default
    //     // Kita taruh label di (Tinggi Avatar + Offset)
    //     const labelPosition = AVATAR_CONFIG.DEFAULT_HEIGHT + AVATAR_CONFIG.LABEL_OFFSET;

    //     // 1. Buat badan (Capsule itu bentuk paling standar buat karakter game, Ferguso!)
    //     const body = BABYLON.MeshBuilder.CreateCapsule(user.uid, {
    //         height: AVATAR_CONFIG.DEFAULT_HEIGHT,
    //         radius: 0.4
    //     }, this.scene);

    //     // Angkat sedikit biar kakinya gak nembus lantai
    //     body.position.y = AVATAR_CONFIG.DEFAULT_HEIGHT / 2;

    //     // 2. Beri warna berdasarkan Role
    //     const material = new BABYLON.StandardMaterial(`mat-${user.uid}`, this.scene);
    //     material.diffuseColor = BABYLON.Color3.FromHexString(
    //         user.role === ROLES.TEACHER ? AVATAR_CONFIG.TEACHER_COLOR : AVATAR_CONFIG.STUDENT_COLOR
    //     );
    //     body.material = material;

    //     // 3. Tambahkan Label Nama (GUI)
    //     this.addNameTag(body, user.displayName);


    //     // Simpan ke daftar
    //     this.avatars.set(user.uid, body);
    //     return body;
    // }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // 0. CEK DUPLIKAT: Jangan buat lagi kalau UID sudah ada di daftar
        if (this.avatars.has(user.uid)) {
            console.log(`Avatar ${user.displayName} sudah ada, skip creation.`);
            return this.avatars.get(user.uid)!;
        }

        // 1. Tentukan warna berdasarkan Role
        const isTeacher = user.role === ROLES.TEACHER;
        const colorHex = isTeacher
            ? AVATAR_CONFIG.TEACHER_COLOR
            : AVATAR_CONFIG.STUDENT_COLOR;

        // 2. Buat Badan (Capsule)
        const body = BABYLON.MeshBuilder.CreateCapsule(user.uid, {
            height: AVATAR_CONFIG.DEFAULT_HEIGHT,
            radius: 0.4
        }, this.scene);

        // 3. ATUR POSISI (Kunci agar tidak menumpuk!)
        // Gunakan posisi dari data user (server), atau beri offset acak agar tidak tumpang tindih
        body.position.x = user.x || (Math.random() * 2 - 1);
        body.position.z = user.z || (Math.random() * 2 - 1);

        // Y diatur agar kaki menyentuh lantai (Asumsi origin capsule di tengah)
        body.position.y = AVATAR_CONFIG.DEFAULT_HEIGHT / 2;

        // 4. Beri warna Material
        const material = new BABYLON.StandardMaterial(`mat-${user.uid}`, this.scene);
        material.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
        // Tambahkan sedikit emisi agar warna tetap terlihat di area gelap
        material.emissiveColor = BABYLON.Color3.FromHexString(colorHex).scale(0.2);
        body.material = material;

        // 5. Tambahkan Label Nama (GUI)
        // Fungsi addNameTag harus sudah menangani peletakan label di atas kepala
        this.addNameTag(body, user.displayName);

        // 6. Simpan ke daftar (PENTING untuk updateMovement nanti)
        this.avatars.set(user.uid, body);

        console.log(`✅ Avatar muncul: ${user.displayName} di [${body.position.x}, ${body.position.z}]`);
        return body;
    }

    /**
     * Label nama melayang di atas kepala
     */
    private addNameTag(parent: BABYLON.AbstractMesh, name: string) {
        const manager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        const rect = new GUI.Rectangle();
        rect.width = "150px";
        rect.height = "40px";
        rect.cornerRadius = 5;
        rect.color = "white";
        rect.thickness = 2;
        rect.background = "black";
        manager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name;
        rect.addControl(label);

        // Link tag ke mesh (melayang di atas kepala)
        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;
    }

    /**
     * Update posisi avatar dari network
     */
    public updateAvatar(uid: string, position: BABYLON.Vector3, rotation: BABYLON.Vector3) {
        const avatar = this.avatars.get(uid);
        if (avatar) {
            // Lerp (Linear Interpolation) biar gerakannya halus, nggak kaku kayak robot
            avatar.position = BABYLON.Vector3.Lerp(avatar.position, position, 0.2);
            avatar.rotation = BABYLON.Vector3.Lerp(avatar.rotation, rotation, 0.2);
        }
    }

    /**
     * Hapus avatar kalau user disconnect
     */
    public removeAvatar(uid: string) {
        const avatar = this.avatars.get(uid);
        if (avatar) {
            avatar.dispose(); // Hancurkan mesh dari memory
            this.avatars.delete(uid);
            console.log(`Avatar ${uid} sudah dimusnahkan, Ferguso!`);
        }
    }
}