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

    public localAvatar: BABYLON.AbstractMesh | null = null;
    public localUserId: string = ""; 
    private currentAnim: string = "";

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    /**
     * 🔥 FUNGSI YANG HILANG (FIXED)
     */
    public setLocalUserId(uid: string) {
        this.localUserId = uid;
        console.log("🆔 Local User ID terdaftar:", uid);
    }

    private playLocalAnimation(name: string) {
        if (!this.localUserId) return;
        const animMap = this.animations.get(this.localUserId);
        if (!animMap) return;

        const targetKey = name.toLowerCase(); 
        const anim = animMap.get(targetKey);
        
        if (!anim) {
            console.warn("❌ Animasi tidak ditemukan:", targetKey);
            return;
        }

        if (this.currentAnim === targetKey) return;

        // Berhenti hanya untuk avatar lokal ini
        animMap.forEach(a => a.stop());

        anim.start(true);
        this.currentAnim = targetKey;
        console.log("🎬 PLAYING:", targetKey);
    }

    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const speed = 0.15;
        const rotationSpeed = 0.15;

        let forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward = forward.normalize();

        let right = Vector3.Cross(Vector3.Up(), forward).normalize();
        const move = forward.scale(deltaZ).add(right.scale(-deltaX));

        const isMoving = deltaX !== 0 || deltaZ !== 0;

        if (isMoving) {
            this.localAvatar.moveWithCollisions(move.scale(speed));

            const targetRot = Math.atan2(move.x, move.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            this.playLocalAnimation("walk");

            if (socket) {
                // ✅ Gunakan localUserId, jangan gunakan name capsule (ctrl-uid)
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

    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        if (this.avatars.has(user.uid)) {
            return this.avatars.get(user.uid)!;
        }

        const fileName = user.role === ROLES.TEACHER ? "final_yeti.glb" : "final_frog.glb";
        const dummy = BABYLON.MeshBuilder.CreateBox("temp", {size: 0.1}, this.scene);

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
            .then((result) => {
                const root = result.meshes[0];
                const visual = result.meshes.find(m => m.getTotalVertices() > 0);

                const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
                    height: 1.8,
                    radius: 0.4
                }, this.scene);
                controller.isVisible = false;
                controller.checkCollisions = true;

                controller.position.set(user.x || 0, 1, user.z || 0);
                root.parent = controller;
                root.position.y = -0.9;

                if (visual) {
                    const bbox = visual.getBoundingInfo().boundingBox;
                    let height = bbox.extendSize.y * 2;
                    if (!height || height < 0.001) height = 1;
                    const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
                    root.scaling.setAll(scale);
                }

                const animMap = new Map<string, AnimationGroup>();
                result.animationGroups.forEach(anim => {
                    anim.stop();
                    animMap.set(anim.name.toLowerCase(), anim);
                });
                this.animations.set(user.uid, animMap);

                this.avatars.set(user.uid, controller);
                this.addNameTag(controller, user.uid, user.displayName);

                if (user.uid === this.localUserId) {
                    this.localAvatar = controller;
                    this.playLocalAnimation("idle");
                } else {
                    // Jalankan idle untuk orang lain
                    animMap.get("idle")?.start(true);
                }

                dummy.dispose();
                console.log(`✅ Avatar ${user.displayName} SIAP`);
            });

        return dummy;
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        const rect = new GUI.Rectangle();
        rect.width = "150px"; rect.height = "40px";
        rect.cornerRadius = 5; rect.color = "white";
        rect.background = "rgba(0,0,0,0.5)";
        this.uiManager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name; label.fontSize = 14; label.color = "white";
        rect.addControl(label);

        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;
        this.guiElements.set(uid, rect);
    }

    public updateAvatar(uid: string, data: any) {
        if (uid === this.localUserId) return;
        const avatar = this.avatars.get(uid);
        if (!avatar || !data) return;

        const targetPos = new BABYLON.Vector3(data.x, data.y, data.z);
        if (!isNaN(targetPos.x)) {
            avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.3);
        }

        if (data.ry !== undefined) {
            avatar.rotation.y = Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.3);
        }
    }

    public removeAvatar(uid: string) {
        this.avatars.get(uid)?.dispose();
        this.avatars.delete(uid);
        this.guiElements.get(uid)?.dispose();
        this.guiElements.delete(uid);
        this.animations.delete(uid);
    }
}