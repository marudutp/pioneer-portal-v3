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
}

export class AvatarManager {
    private animations: Map<string, Map<string, AnimationGroup>> = new Map();
    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private uiManager: GUI.AdvancedDynamicTexture;
    private loadingAvatars: Set<string> = new Set();

    public localAvatar: BABYLON.AbstractMesh | null = null;
    public localUserId: string = "";
    private currentAnim: string = "";

    // 🔥 GROUND_Y = 0.91 (0.9 adalah setengah tinggi kapsul 1.8, 
    // + 0.01 adalah jarak aman agar tidak 'stuck' di lantai)
    private readonly GROUND_Y = 0.95;

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

        // Stop animasi lain sebelum menjalankan yang baru
        animMap.forEach(a => { if (a !== anim) a.stop(); });
        anim.start(true);
        this.currentAnim = targetKey;
    }

    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        // Hitung arah gerak (abaikan Y kamera)
        let forward = camera.getForwardRay().direction;
        let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();

        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        if (deltaX !== 0 || deltaZ !== 0) {
            // 1. Gerakkan dengan tabrakan
            this.localAvatar.moveWithCollisions(moveVector.scale(speed));

            // 2. 🔥 KUNCI POSISI Y (Anti-Tenggelam)
            this.localAvatar.position.y = this.GROUND_Y;

            // 3. Rotasi halus
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
            this.localAvatar.position.y = this.GROUND_Y; // Jaga tetap di lantai
        }
    }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // Proteksi ganda agar tidak ada avatar kembar
        if (this.avatars.has(user.uid) || this.loadingAvatars.has(user.uid)) {
            return this.avatars.get(user.uid) || this.scene.getMeshByName("ctrl-" + user.uid)!;
        }

        this.loadingAvatars.add(user.uid);
        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        const dummy = BABYLON.MeshBuilder.CreateBox("temp_" + user.uid, { size: 0.1 }, this.scene);
        dummy.isVisible = false;

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene).then((result) => {
            const root = result.meshes[0];

            // 🔥 COLLIDER SETUP (Capsule)
            const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
                height: 1.8,
                radius: 0.4
            }, this.scene);

            controller.isVisible = false;
            controller.checkCollisions = true;

            // 🔥 RAHASIA ANTI-STUCK: Atur Ellipsoid sedikit lebih kecil dari kapsulnya
            // agar tidak 'nyangkut' di pori-pori mesh lantai
            // controller.ellipsoid = new Vector3(0.35, 0.85, 0.35);
            // controller.ellipsoidOffset = new Vector3(0, 0, 0);
            controller.ellipsoid = new Vector3(0.3, 0.8, 0.3);
            controller.ellipsoidOffset = new Vector3(0, 0, 0);

            controller.position.set(user.x || 0, this.GROUND_Y, user.z || 0);

            root.parent = controller;
            root.position.y = -0.9; // Kaki di dasar kapsul

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

        // Lerp posisi player lain (Y dikunci ke GROUND_Y)
        const targetPos = new Vector3(data.x, this.GROUND_Y, data.z);
        avatar.position = Vector3.Lerp(avatar.position, targetPos, 0.3);

        if (data.ry !== undefined) {
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.3);
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
        this.loadingAvatars.delete(uid);
    }
}