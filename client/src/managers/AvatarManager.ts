import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ROLES } from "@shared/constants";
import { Vector3, Scalar, AnimationGroup } from "@babylonjs/core";

export interface UserData {
    uid: string;
    displayName: string;
    role: string;
    x?: number;
    z?: number;
    position?: BABYLON.Vector3;
    rotation?: BABYLON.Vector3;
}

export class AvatarManager {
    private animations: Map<string, Map<string, AnimationGroup>> = new Map();
    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private uiManager: GUI.AdvancedDynamicTexture;

    // 🔥 Proteksi Ganda (Race Condition): Mencatat ID yang sedang loading
    private loadingAvatars: Set<string> = new Set();

    public localAvatar: BABYLON.AbstractMesh | null = null;
    public localUserId: string = ""; // Harus di-set via setLocalUserId() di main.ts
    private currentAnim: string = "";

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    // WAJIB DIPANGGIL DI main.ts SETELAH LOGIN/CONNECT
    public setLocalUserId(uid: string) {
        this.localUserId = uid;
        console.log("🆔 SAYA ADALAH:", uid);
    }

    /**
     * 🔥 ANIMATION SYSTEM FIX (With Blending)
     */
    private playLocalAnimation(name: string) {
        if (!this.localUserId) return;
        const animMap = this.animations.get(this.localUserId);
        if (!animMap) return;

        const targetKey = name.toLowerCase(); 
        const anim = animMap.get(targetKey);
        
        if (!anim) return;
        if (this.currentAnim === targetKey && anim.isPlaying) return;

        // Stop semua anim avatar ini dengan blending halus
        animMap.forEach(a => { if (a.isPlaying && a !== anim) a.stop(); });

        anim.start(true);
        this.currentAnim = targetKey;
    }

    /**
     * MOVEMENT LOGIC
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        // HANYA gerakkan jika localUserId dan localAvatar sudah terhubung
        if (!this.localAvatar || !this.localUserId || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.2; // Sedikit dinaikkan biar responsif

        let forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward.normalize();
        let right = Vector3.Cross(Vector3.Up(), forward).normalize();
        const move = forward.scale(deltaZ).add(right.scale(-deltaX));

        const isMoving = deltaX !== 0 || deltaZ !== 0;

        if (isMoving) {
            this.localAvatar.moveWithCollisions(move.scale(speed));

            // ======================
            // 🔥 FIX JALAN MUNDUR
            // ======================
            // Tambahkan Math.PI (180 derajat) ke targetRot jika GLB menghadap ke belakang
            const targetRot = Math.atan2(move.x, move.z) + Math.PI;

            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            this.playLocalAnimation("walk"); 

            // KIRIM KE SERVER: Gunakan localUserId yang valid
            if (socket && socket.connected) {
                socket.emit("player_move", {
                    uid: this.localUserId, 
                    x: this.localAvatar.position.x,
                    y: this.localAvatar.position.y,
                    z: this.localAvatar.position.z,
                    ry: this.localAvatar.rotation.y
                });
            }
        } else {
            this.playLocalAnimation("idle");
        }
    }

    /**
     * 🔥 CREATE AVATAR (With Race Condition Protection)
     */
    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // 1. 🔥 CEK KETAT GANDA (Jika sudah ada ATAU sedang loading, ABAIKAN)
        if (this.avatars.has(user.uid) || this.loadingAvatars.has(user.uid)) {
            return this.avatars.get(user.uid) || this.scene.getMeshByName("ctrl-" + user.uid)!;
        }

        // 2. Tandai sedang loading
        this.loadingAvatars.add(user.uid);
        console.log(`⏳ Loading avatar untuk: ${user.displayName} [${user.uid}]`);

        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        
        // Buat dummy mesh sementara agar Babylon tidak error
        const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, {size: 0.1}, this.scene);
        dummy.isVisible = false;

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
            .then((result) => {
                const root = result.meshes[0];
                const visual = result.meshes.find(m => m.getTotalVertices() > 0);

                // ======================
                // 🔥 CONTROLLER (Capsule)
                // ======================
                const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
                    height: 1.8,
                    radius: 0.4
                }, this.scene);
                controller.isVisible = false;
                controller.checkCollisions = true;

                // Posisi awal (dari data server)
                controller.position.set(
                    user.x !== undefined ? user.x : 0,
                    1, // Tinggi kapsul 1.8, pivot di tengah, y=1 menapak tanah
                    user.z !== undefined ? user.z : 0
                );

                // Parent Mesh ke Controller
                root.parent = controller;
                root.position.y = -0.9; // Kaki tepat di dasar kapsul

                // Auto Scale
                if (visual) {
                    const bbox = visual.getBoundingInfo().boundingBox;
                    let height = bbox.extendSize.y * 2;
                    if (!height || height < 0.001) height = 1;
                    const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
                    root.scaling.setAll(scale);
                }

                // ======================
                // 🔥 ANIMATIONS (Register)
                // ======================
                const animMap = new Map<string, AnimationGroup>();
                result.animationGroups.forEach(anim => {
                    anim.stop();
                    // Aktifkan blending biar transisi halus
                    anim.enableBlending = true;
                    anim.blendingSpeed = 0.05; 
                    animMap.set(anim.name.toLowerCase(), anim);
                });
                this.animations.set(user.uid, animMap);

                // Jalankan Idle Default
                animMap.get("idle")?.start(true);

                // NameTag
                this.addNameTag(controller, user.uid, user.displayName);

                // ======================
                // 🔥 SIMPAN & OWNERSHIP
                // ======================
                this.avatars.set(user.uid, controller);

                // Hapus dari daftar loading (Selesai)
                this.loadingAvatars.delete(user.uid);

                // Jika ini ID saya, tandai sebagai localAvatar
                if (user.uid === this.localUserId) {
                    this.localAvatar = controller;
                    this.playLocalAnimation("idle");
                    console.log("🌟 Avatar Lokal Berhasil Dikuasai.");
                } else {
                    console.log(`👤 Avatar ${user.displayName} Join.`);
                }

                dummy.dispose();
            })
            .catch(err => {
                console.error("❌ Gagal load GLB:", err);
                this.loadingAvatars.delete(user.uid);
                dummy.dispose();
            });

        return dummy;
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        // Hapus nametag lama jika ada (mencegah ganda visual)
        this.guiElements.get(uid)?.dispose();

        const rect = new GUI.Rectangle();
        rect.width = "160px"; rect.height = "40px";
        rect.cornerRadius = 8; rect.color = "white";
        rect.background = "rgba(0,0,0,0.5)";
        this.uiManager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name; label.fontSize = 14; label.color = "white";
        rect.addControl(label);

        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;
        this.guiElements.set(uid, rect);
    }

    /**
     * 🌍 UPDATE DARI SERVER (Multiplayer)
     */
    public updateAvatar(uid: string, data: any) {
        // Jangan update diri sendiri agar tidak mental
        if (uid === this.localUserId) return;

        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        const targetPos = new BABYLON.Vector3(data.x, data.y, data.z);
        if (!isNaN(targetPos.x)) {
            // Update posisi smooth (Lerp lebih cepat biar gak lag)
            avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.4);
        }

        if (data.ry !== undefined) {
            // Update rotasi smooth
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.4);
        }

        // --- Logika Animasi Orang Lain (Multiplayer) ---
        // Kamu bisa tambahkan logika di sini jika posisi orang lain pindah 
        // secara signifikan (> 0.05), jalankan anim "walk" untuk mereka di layar kamu.
    }

    public removeAvatar(uid: string) {
        this.avatars.get(uid)?.dispose();
        this.avatars.delete(uid);
        this.guiElements.get(uid)?.dispose();
        this.guiElements.delete(uid);
        this.animations.delete(uid);
        this.loadingAvatars.delete(uid); // Pastikan state loading bersih
        console.log(`Avatar ${uid} keluar.`);
    }
}