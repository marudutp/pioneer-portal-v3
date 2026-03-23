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

    // 🔥 Konstanta Tinggi Lantai:
    // Jika tinggi kapsul 1.8, posisi Y harus 0.9 supaya kaki di 0.
    private readonly GROUND_Y = 0.9;
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

        if (!anim || (this.currentAnim === targetKey && anim.isPlaying)) return;

        animMap.forEach(a => a.stop());
        anim.start(true);
        this.currentAnim = targetKey;
    }

    /**
     * MOVEMENT LOGIC
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        // Ambil arah kamera tapi buang komponen vertikalnya (Y = 0)
        let forward = camera.getForwardRay().direction;
        let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();

        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        if (deltaX !== 0 || deltaZ !== 0) {
            // 1. Gerakkan Avatar
            this.localAvatar.moveWithCollisions(moveVector.scale(speed));

            // 2. 🔥 FIX TENGGELAM: Paksa posisi Y tetap di level lantai
            this.localAvatar.position.y = this.GROUND_Y;

            // 3. Rotasi (Tanpa offset Math.PI karena sudah benar)
            const targetRot = Math.atan2(moveVector.x, moveVector.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            this.playLocalAnimation("walk");

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
            // Jaga tetap di lantai saat diam
            this.localAvatar.position.y = this.GROUND_Y;
        }
    }

    /**
     * 🔥 CREATE AVATAR (With Race Condition Protection)
     */
    // public createAvatar(user: UserData): BABYLON.AbstractMesh {
    //     // 1. 🔥 CEK KETAT GANDA (Jika sudah ada ATAU sedang loading, ABAIKAN)
    //     if (this.avatars.has(user.uid) || this.loadingAvatars.has(user.uid)) {
    //         return this.avatars.get(user.uid) || this.scene.getMeshByName("ctrl-" + user.uid)!;
    //     }

    //     // 2. Tandai sedang loading
    //     this.loadingAvatars.add(user.uid);
    //     console.log(`⏳ Loading avatar untuk: ${user.displayName} [${user.uid}]`);

    //     const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";

    //     // Buat dummy mesh sementara agar Babylon tidak error
    //     const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, {size: 0.1}, this.scene);
    //     dummy.isVisible = false;

    //     BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
    //         .then((result) => {
    //             const root = result.meshes[0];
    //             const visual = result.meshes.find(m => m.getTotalVertices() > 0);

    //             // ======================
    //             // 🔥 CONTROLLER (Capsule)
    //             // ======================
    //             const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
    //                 height: 1.8,
    //                 radius: 0.4
    //             }, this.scene);
    //             controller.isVisible = false;
    //             controller.checkCollisions = true;

    //             // Posisi awal (dari data server)
    //             controller.position.set(
    //                 user.x !== undefined ? user.x : 0,
    //                 1, // Tinggi kapsul 1.8, pivot di tengah, y=1 menapak tanah
    //                 user.z !== undefined ? user.z : 0
    //             );

    //             // Parent Mesh ke Controller
    //             root.parent = controller;
    //             root.position.y = -0.9; // Kaki tepat di dasar kapsul

    //             // Auto Scale
    //             if (visual) {
    //                 const bbox = visual.getBoundingInfo().boundingBox;
    //                 let height = bbox.extendSize.y * 2;
    //                 if (!height || height < 0.001) height = 1;
    //                 const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
    //                 root.scaling.setAll(scale);
    //             }

    //             // ======================
    //             // 🔥 ANIMATIONS (Register)
    //             // ======================
    //             const animMap = new Map<string, AnimationGroup>();
    //             result.animationGroups.forEach(anim => {
    //                 anim.stop();
    //                 // Aktifkan blending biar transisi halus
    //                 anim.enableBlending = true;
    //                 anim.blendingSpeed = 0.05; 
    //                 animMap.set(anim.name.toLowerCase(), anim);
    //             });
    //             this.animations.set(user.uid, animMap);

    //             // Jalankan Idle Default
    //             animMap.get("idle")?.start(true);

    //             // NameTag
    //             this.addNameTag(controller, user.uid, user.displayName);

    //             // ======================
    //             // 🔥 SIMPAN & OWNERSHIP
    //             // ======================
    //             this.avatars.set(user.uid, controller);

    //             // Hapus dari daftar loading (Selesai)
    //             this.loadingAvatars.delete(user.uid);

    //             // Jika ini ID saya, tandai sebagai localAvatar
    //             if (user.uid === this.localUserId) {
    //                 this.localAvatar = controller;
    //                 this.playLocalAnimation("idle");
    //                 console.log("🌟 Avatar Lokal Berhasil Dikuasai.");
    //             } else {
    //                 console.log(`👤 Avatar ${user.displayName} Join.`);
    //             }

    //             dummy.dispose();
    //         })
    //         .catch(err => {
    //             console.error("❌ Gagal load GLB:", err);
    //             this.loadingAvatars.delete(user.uid);
    //             dummy.dispose();
    //         });

    //     return dummy;
    // }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        if (this.avatars.has(user.uid) || this.loadingAvatars.has(user.uid)) {
            return this.avatars.get(user.uid) || this.scene.getMeshByName("ctrl-" + user.uid)!;
        }

        this.loadingAvatars.add(user.uid);
        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, { size: 0.1 }, this.scene);
        dummy.isVisible = false;

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene).then((result) => {
            const root = result.meshes[0];
            const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, { height: 1.8, radius: 0.4 }, this.scene);
            controller.isVisible = false;
            controller.checkCollisions = true;

            // 🔥 Set posisi awal menapak lantai
            controller.position.set(user.x || 0, this.GROUND_Y, user.z || 0);

            root.parent = controller;
            root.position.y = -0.9; // Pivot model ke dasar kapsul

            const animMap = new Map<string, AnimationGroup>();
            result.animationGroups.forEach(anim => {
                anim.stop();
                anim.enableBlending = true;
                anim.blendingSpeed = 0.05;
                animMap.set(anim.name.toLowerCase(), anim);
            });

            this.animations.set(user.uid, animMap);
            this.avatars.set(user.uid, controller);
            this.addNameTag(controller, user.uid, user.displayName);
            this.loadingAvatars.delete(user.uid);

            if (user.uid === this.localUserId) {
                this.localAvatar = controller;
                this.playLocalAnimation("idle");
            }
            dummy.dispose();
        });

        return dummy;
    }

    public updateAvatar(uid: string, data: any) {
        if (uid === this.localUserId) return;
        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        // 🔥 Paksa Y tetap di GROUND_Y juga untuk player lain
        const targetPos = new Vector3(data.x, this.GROUND_Y, data.z);
        avatar.position = Vector3.Lerp(avatar.position, targetPos, 0.3);

        if (data.ry !== undefined) {
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.3);
        }
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
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