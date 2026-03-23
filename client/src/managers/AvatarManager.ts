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
    ry?: number;
}

export class AvatarManager {
    private animations: Map<string, Map<string, AnimationGroup>> = new Map();
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private loadingAvatars: Set<string> = new Set();
    private scene: BABYLON.Scene;
    private uiManager: GUI.AdvancedDynamicTexture;

    public localAvatar: BABYLON.AbstractMesh | null = null;
    public localUserId: string = "";
    private currentAnim: string = "";

    // 🔥 Kunci Y agar kaki tetap menapak (Anti-Tenggelam)
    private readonly GROUND_Y = 0.9;

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    public setLocalUserId(uid: string) {
        this.localUserId = uid;
    }

    private playLocalAnimation(name: string) {
        if (!this.localUserId) return;
        const animMap = this.animations.get(this.localUserId);
        if (!animMap) return;

        const targetKey = name.toLowerCase();
        const anim = animMap.get(targetKey);

        if (!anim || (this.currentAnim === targetKey && anim.isPlaying)) return;

        animMap.forEach(a => { if (a !== anim) a.stop(); });
        anim.start(true);
        this.currentAnim = targetKey;
    }

    /**
     * 🔥 LOGIKA PERGERAKAN: Lepas Collision (Anti-Stuck)
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        // Ambil arah horizontal saja
        let forward = camera.getForwardRay().direction;
        let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();
        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        if (deltaX !== 0 || deltaZ !== 0) {
            // 🔥 BYPASS COLLISION: Gunakan addInPlace agar tidak macet
            this.localAvatar.position.addInPlace(moveVector.scale(speed));

            // 🔥 PAKSA Y: Tetap di level lantai
            this.localAvatar.position.y = this.GROUND_Y;

            // 🔥 FIX JALAN MUNDUR: Coba tanpa Math.PI jika sebelumnya mundur, 
            // atau gunakan Math.PI jika model butuh diputar 180 derajat.
            const targetRot = Math.atan2(moveVector.x, moveVector.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(this.localAvatar.rotation.y, targetRot, rotationSpeed);

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
            this.localAvatar.position.y = this.GROUND_Y;
        }
    }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // Anti-Duplikat
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
            // 🔥 LEPAS COLLISION: Biar tidak stuck saat loading pertama
            controller.checkCollisions = false;

            // 🔥 ANTI-TUMPUK: Ambil posisi koordinat terakhir dari server (user.x/z)
            // Jika tidak ada data server, beri posisi random agar tidak saling tindih
            const startX = user.x !== undefined ? user.x : (Math.random() * 6 - 3);
            const startZ = user.z !== undefined ? user.z : (Math.random() * 6 - 3);
            const startRY = user.ry !== undefined ? user.ry : 0;

            controller.position.set(startX, this.GROUND_Y, startZ);
            controller.rotation.y = startRY;

            root.parent = controller;
            root.position.y = -0.9;

            const animMap = new Map<string, AnimationGroup>();
            result.animationGroups.forEach(anim => {
                anim.stop();
                anim.enableBlending = true;
                animMap.set(anim.name.toLowerCase(), anim);
            });

            this.animations.set(user.uid, animMap);
            this.avatars.set(user.uid, controller);
            this.addNameTag(controller, user.uid, user.displayName);
            this.loadingAvatars.delete(user.uid);

            if (user.uid === this.localUserId) {
                this.localAvatar = controller;
                this.playLocalAnimation("idle");
                console.log("🌟 Avatar Lokal Siap di:", controller.position.toString());
            } else {
                animMap.get("idle")?.start(true);
            }
            dummy.dispose();
        });

        return dummy;
    }

    // public updateAvatar(uid: string, data: any) {
    //     if (uid === this.localUserId) return; 
    //     const avatar = this.avatars.get(uid);
    //     if (!avatar) return;

    //     // Update posisi halus player lain (Sync posisi terakhir dari server)
    //     const targetPos = new Vector3(data.x, this.GROUND_Y, data.z);
    //     avatar.position = Vector3.Lerp(avatar.position, targetPos, 0.4);

    //     if (data.ry !== undefined) {
    //         avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.4);
    //     }
    // }

    // public updateAvatar(uid: string, data: any) {
    //     // 🔥 PROTEKSI: Jangan update diri sendiri
    //     if (uid === this.localUserId) return;

    //     const avatar = this.avatars.get(uid);
    //     if (!avatar || !data) return;

    //     const targetPos = new Vector3(data.x, this.GROUND_Y, data.z);

    //     // Hitung jarak pindah untuk trigger animasi "walk" orang lain
    //     const distance = Vector3.Distance(avatar.position, targetPos);

    //     // 1. Geser Posisi (Lerp)
    //     avatar.position = Vector3.Lerp(avatar.position, targetPos, 0.4);

    //     // 2. Geser Rotasi
    //     if (data.ry !== undefined) {
    //         avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.4);
    //     }

    //     // 3. 🔥 REMOTE ANIMATION: Jika orang lain pindah > 0.02 unit, suruh dia "walk"
    //     const animMap = this.animations.get(uid);
    //     if (animMap) {
    //         const animName = distance > 0.02 ? "walk" : "idle";
    //         const targetAnim = Array.from(animMap.keys()).find(k => k.includes(animName));
    //         if (targetAnim) {
    //             const anim = animMap.get(targetAnim);
    //             if (anim && !anim.isPlaying) {
    //                 animMap.forEach(a => a.stop());
    //                 anim.start(true);
    //             }
    //         }
    //     }
    // }

    public updateAvatar(uid: string, data: any) {
        // Jangan gerakkan diri sendiri lewat sinyal server
        if (uid === this.localUserId) return;

        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        // 1. Tentukan target posisi (Y dikunci di GROUND_Y agar tidak tenggelam)
        const targetPos = new BABYLON.Vector3(data.x, this.GROUND_Y, data.z);

        // 2. Hitung jarak untuk deteksi animasi
        const distance = BABYLON.Vector3.Distance(avatar.position, targetPos);

        // 3. Update Posisi & Rotasi secara halus (Lerp)
        avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.4);

        if (data.ry !== undefined) {
            avatar.rotation.y = BABYLON.Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.4);
        }

        // 4. 🔥 LOGIKA ANTI-BEDUK: Jika kawan pindah > 0.02, putar animasi jalan
        const animMap = this.animations.get(uid);
        if (animMap) {
            const isMoving = distance > 0.02;
            const animName = isMoving ? "walk" : "idle";

            // Cari nama animasi yang mirip (lowercase)
            const targetKey = Array.from(animMap.keys()).find(k => k.includes(animName));
            if (targetKey) {
                const anim = animMap.get(targetKey);
                if (anim && !anim.isPlaying) {
                    animMap.forEach(a => a.stop());
                    anim.start(true);
                }
            }
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
    }
}