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
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private loadingAvatars: Set<string> = new Set();
    private scene: BABYLON.Scene;
    private uiManager: GUI.AdvancedDynamicTexture;

    public localAvatar: BABYLON.AbstractMesh | null = null;
    public localUserId: string = ""; 
    private currentAnim: string = "";

    // 🔥 Konstanta Tinggi: Setengah dari tinggi kapsul (1.8 / 2 = 0.9)
    // Ditambah 0.02 sebagai buffer agar tidak bergesekan (stuck) dengan lantai.
    private readonly GROUND_Y = 0.92; 

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

    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        let forward = camera.getForwardRay().direction;
        let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();

        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        if (deltaX !== 0 || deltaZ !== 0) {
            // 1. Gerakkan
            this.localAvatar.moveWithCollisions(moveVector.scale(speed));

            // 2. 🔥 FIX TENGGELAM: Kunci Y setiap frame
            this.localAvatar.position.y = this.GROUND_Y;

            // 3. 🔥 FIX JALAN MUNDUR: Offset 180 derajat (Math.PI)
            const targetRot = Math.atan2(moveVector.x, moveVector.z) + Math.PI;

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
            this.localAvatar.position.y = this.GROUND_Y;
        }
    }

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        // Anti-Duplikat: Cek jika sudah ada atau sedang loading
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
            controller.checkCollisions = true;
            
            // 🔥 Anti-Stuck: Ellipsoid sedikit lebih ramping dari mesh
            controller.ellipsoid = new Vector3(0.35, 0.85, 0.35);

            controller.position.set(user.x || 0, this.GROUND_Y, user.z || 0);
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
            }
            dummy.dispose();
        });

        return dummy;
    }

    public updateAvatar(uid: string, data: any) {
        // 🔥 SINKRONISASI FIX: Jangan update diri sendiri agar tab tidak bentrok
        if (uid === this.localUserId) return;

        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        avatar.position = Vector3.Lerp(avatar.position, new Vector3(data.x, this.GROUND_Y, data.z), 0.3);
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