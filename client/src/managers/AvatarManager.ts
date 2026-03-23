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

    // 🔥 Kunci posisi Y agar kaki menapak (asumsi lantai di y=0)
    private readonly GROUND_Y = 0.9; 

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    public setLocalUserId(uid: string) {
        this.localUserId = uid;
    }

    private playAnimation(uid: string, name: string) {
        const animMap = this.animations.get(uid);
        if (!animMap) return;

        const targetKey = name.toLowerCase(); 
        const anim = animMap.get(targetKey);
        
        // Proteksi agar tidak memutar animasi yang sama berulang kali (gemetar)
        if (!anim || (uid === this.localUserId && this.currentAnim === targetKey && anim.isPlaying)) return;

        // Stop semua anim di avatar ini, jalankan anim baru
        animMap.forEach(a => { if (a !== anim) a.stop(); });
        anim.start(true);
        
        // Simpan state animasi saat ini (untuk local player)
        if (uid === this.localUserId) this.currentAnim = targetKey;
    }

    /**
     * 🔥 LOGIKA PERGERAKAN: Lepas Collision (Anti-Stuck)
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        // Ambil arah horizontal kamera
        let forward = camera.getForwardRay().direction;
        let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();
        
        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        if (deltaX !== 0 || deltaZ !== 0) {
            // 🔥 BYPASS COLLISION: Langsung tambah posisi agar tidak stuck
            this.localAvatar.position.addInPlace(moveVector.scale(speed));
            
            // 🔥 ANTI-TENGGELAM: Paksa Y tetap di GROUND_Y setiap frame
            this.localAvatar.position.y = this.GROUND_Y;

            // 🔥 FIX JALAN MUNDUR: Offset 180 derajat (Math.PI)
            const targetRot = Math.atan2(moveVector.x, moveVector.z) + Math.PI;
            this.localAvatar.rotation.y = Scalar.LerpAngle(this.localAvatar.rotation.y, targetRot, rotationSpeed);

            this.playAnimation(this.localUserId, "walk");

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
            this.playAnimation(this.localUserId, "idle");
            this.localAvatar.position.y = this.GROUND_Y;
        }
    }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // Anti-Duplikat visual saat loading (kepala tumpang tindih)
        if (this.avatars.has(user.uid) || this.loadingAvatars.has(user.uid)) {
            return this.avatars.get(user.uid) || this.scene.getMeshByName("ctrl-" + user.uid)!;
        }

        this.loadingAvatars.add(user.uid);
        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, {size: 0.1}, this.scene);
        dummy.isVisible = false;

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene).then((result) => {
            const root = result.meshes[0];
            const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, { height: 1.8, radius: 0.4 }, this.scene);
            
            controller.isVisible = false;
            // 🔥 LEPAS COLLISION: Biar tidak stuck saat spawn pertama kali
            controller.checkCollisions = false; 

            // 🔥 ANTI-TUMPUK: Ambil posisi koordinat terakhir dari server (user.x/z)
            // Jika tidak ada data server (koordinat 0), beri posisi random agar tidak saling tindih di pusat
            const startX = (user.x !== undefined && user.x !== 0) ? user.x : (Math.random() * 4 - 2);
            const startZ = (user.z !== undefined && user.z !== 0) ? user.z : (Math.random() * 4 - 2);
            const startRY = user.ry !== undefined ? user.ry : 0;

            controller.position.set(startX, this.GROUND_Y, startZ);
            controller.rotation.y = startRY;

            root.parent = controller;
            root.position.y = -0.9; // Pivot kaki di dasar kapsul

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
                this.playAnimation(user.uid, "idle");
                console.log("🌟 Avatar Lokal Siap di:", controller.position.toString());
            } else {
                // Orang lain join, set idle di layar kita
                this.playAnimation(user.uid, "idle");
            }
            dummy.dispose();
        });

        return dummy;
    }

    /**
     * 🔥 FIX SINKRONISASI: Terima data pergerakan orang lain
     */
    public updateAvatar(uid: string, data: any) {
        // 🔥 SINKRONISASI FIX: Jangan update diri sendiri agar tab tidak bentrok
        if (uid === this.localUserId) return; 

        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        const targetPos = new Vector3(data.x, this.GROUND_Y, data.z);
        
        // Hitung jarak pindah untuk trigger animasi "walk" orang lain di layarmu
        const distance = Vector3.Distance(avatar.position, targetPos);

        // 1. Update posisi & rotasi player lain (Smooth Lerp)
        avatar.position = Vector3.Lerp(avatar.position, targetPos, 0.4);
        if (data.ry !== undefined) {
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.4);
        }

        // 2. 🔥 REMOTE WALK: Jika dia pindah posisi > 0.05 unit, putar anim walk di layarmu
        if (distance > 0.05) {
            this.playAnimation(uid, "walk");
        } else {
            // Jika diam, set kembali ke idle
            this.playAnimation(uid, "idle");
        }
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        if (this.guiElements.has(uid)) return;
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