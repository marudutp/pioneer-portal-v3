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
    // private animations: Map<string, AnimationGroup> = new Map();
    private animations: Map<string, Map<string, AnimationGroup>> = new Map();

    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private uiManager: GUI.AdvancedDynamicTexture;

    // 🔥 Proteksi Ganda (Race Condition): Mencatat ID yang sedang loading
    private loadingAvatars: Set<string> = new Set();

    public localAvatar: BABYLON.AbstractMesh | null = null;
    private currentAnimName: string = ""; // Menyimpan kunci asli (lowercase)
    public localUserId: string = "";

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    /**
     * 🔥 FUNGSI PEMUTAR ANIMASI (FIXED + TYPO TOLERANT)
     */
    private playLocalAnimation(name: string) {
        if (!this.localAvatar || !this.localUserId) return;

        const animMap = this.animations.get(this.localUserId);
        if (!animMap) return;

        // Force lowercase agar konsisten ("Walk" jadi "walk")
        const searchKey = name.toLowerCase(); 
        
        // FUZZY SEARCH: Cari key yang mengandung kata 'walk' atau 'idle'
        // Ini buat jaga-jaga kalau namanya "Armature|walk" atau "walking"
        const actualKey = Array.from(animMap.keys()).find(k => k.includes(searchKey));
        
        if (!actualKey) {
            console.warn(`❌ Animasi "${name}" tidak ditemukan di model ini.`);
            return;
        }

        const anim = animMap.get(actualKey);
        if (!anim) return;

        // Jangan restart jika animasi sama sedang berjalan
        if (this.currentAnimName === actualKey && anim.isPlaying) return;

        // Stop semua anim avatar ini dengan blending halus
        animMap.forEach(a => {
            if (a.isPlaying && a !== anim) {
                a.stop(); 
            }
        });

        // Jalankan animasi baru
        anim.start(true);
        this.currentAnimName = actualKey;

        console.log(`🎬 Berhasil Memutar: ${actualKey}`);
    }

    /**
     * MOVEMENT LOGIC
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        // HANYA gerakkan jika localAvatar sudah terhubung dengan ID yang benar
        if (!this.localAvatar || !this.localUserId || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        let forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward = forward.normalize();

        let right = Vector3.Cross(Vector3.Up(), forward).normalize();
        const move = forward.scale(deltaZ).add(right.scale(-deltaX));

        const isMoving = deltaX !== 0 || deltaZ !== 0;

        if (isMoving) {
            // Kita cetak log untuk memastikan event berjalan
            // console.log("🎬 WALK TRIGGERED");

            this.localAvatar.moveWithCollisions(move.scale(speed));

            const targetRot = Math.atan2(move.x, move.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            // Ganti jadilowercase "walk" agar match dengan pencarian
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
        // 1. Cek apakah sudah ada di scene (Mesh utuh)
        if (this.avatars.has(user.uid)) {
            return this.avatars.get(user.uid)!;
        }

        // 2. 🔥 Cek apakah SEDANG loading (Cegah Ganda Visual/Merge 3 Kepala)
        if (this.loadingAvatars.has(user.uid)) {
            console.warn(`⏳ Avatar ${user.displayName} [${user.uid}] sedang loading. Mengabaikan permintaan ganda.`);
            // Return dummy box temporary agar bootstrap di main.ts tidak error
            return this.scene.getMeshByName("temp_dummy_" + user.uid) || 
                   BABYLON.MeshBuilder.CreateBox("temp_dummy_" + user.uid, {size: 0.1}, this.scene);
        }

        // 3. Tandai sedang loading
        this.loadingAvatars.add(user.uid);
        console.log(`⏳ Loading avatar untuk: ${user.displayName} [${user.uid}]`);

        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, {size: 0.1}, this.scene);

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
            .then((result) => {
                const root = result.meshes[0];
                const visual = result.meshes.find(m => m.getTotalVertices() > 0);

                // CONTROLLER (Capsule)
                const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
                    height: 1.8,
                    radius: 0.4
                }, this.scene);
                controller.isVisible = false;
                controller.checkCollisions = true;

                // Posisi awal (dari data server atau acak)
                controller.position.set(user.x || 0, 1, user.z || 0);

                // PARENTING GLB KE CONTROLLER
                root.parent = controller;
                root.position.y = -0.9; // Pivot model tepat di dasar kapsul

                // Auto Scale
                if (visual) {
                    const bbox = visual.getBoundingInfo().boundingBox;
                    let height = bbox.extendSize.y * 2;
                    if (!height || height < 0.001) height = 1;
                    const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
                    root.scaling.setAll(scale);
                }

                // ANIMATIONS REGISTER
                const animMap = new Map<string, AnimationGroup>();
                result.animationGroups.forEach(anim => {
                    anim.stop();
                    animMap.set(anim.name.toLowerCase(), anim);
                });
                this.animations.set(user.uid, animMap);

                // Jalankan Idle Default
                const idle = animMap.get("idle");
                if (idle) idle.start(true);

                // NAMETAG
                this.addNameTag(controller, user.uid, user.displayName);

                // SIMPAN KE MAP UTAMA
                this.avatars.set(user.uid, controller);

                // 🔥 Hapus dari daftar loading (Selesai)
                this.loadingAvatars.delete(user.uid);

                // 🔥 OWNERSHIP FIX: Jika ID ini sama dengan ID saya
                if (user.uid === this.localUserId) {
                    this.localAvatar = controller;
                    this.currentAnimName = "idle";
                    console.log(`🌟 Berhasil menguasai avatar: ${user.displayName} [${user.uid}]`);
                } else {
                    console.log(`👤 Avatar musuh join: ${user.displayName} [${user.uid}]`);
                }

                dummy.dispose();
                // Hapus dummy box temporary jika ada
                this.scene.getMeshByName("temp_dummy_" + user.uid)?.dispose();
            })
            .catch(err => {
                console.error("❌ Gagal load GLB:", err);
                this.loadingAvatars.delete(user.uid); // Reset state jika error
                dummy.dispose();
            });

        return dummy;
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        // Hapus nametag lama jika ada (mencegah ganda visual visual)
        this.guiElements.get(uid)?.dispose();

        const rect = new GUI.Rectangle("tag-" + uid);
        rect.width = "160px"; rect.height = "40px";
        rect.cornerRadius = 8; rect.color = "white";
        rect.thickness = 2; rect.background = "rgba(0,0,0,0.5)";
        this.uiManager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name; label.fontSize = 14; label.color = "white";
        rect.addControl(label);

        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;

        this.guiElements.set(uid, rect);
    }

    public updateAvatar(uid: string, position: any, rotation: any) {
        // JANGAN UPDATE DIRI SENDIRI DARI NETWORK (BIAR TIDAK MENTAL)
        if (uid === this.localUserId) return;

        const avatar = this.avatars.get(uid);
        if (!avatar || !position) return;

        const targetPos = new BABYLON.Vector3(position.x, position.y, position.z);
        if (!isNaN(targetPos.x)) {
            avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.2);
        }

        if (rotation) {
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, rotation.ry || 0, 0.2);
        }
    }

    public removeAvatar(uid: string) {
        this.avatars.get(uid)?.dispose();
        this.avatars.delete(uid);
        this.guiElements.get(uid)?.dispose();
        this.guiElements.delete(uid);
        this.animations.delete(uid);
        this.loadingAvatars.delete(uid);
    }
}