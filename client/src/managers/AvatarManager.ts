import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ROLES, AVATAR_CONFIG } from "@shared/constants";
import { Vector3, Scalar, AnimationGroup, AbstractMesh } from "@babylonjs/core";

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
    private animations: Map<string, AnimationGroup> = new Map();
    private scene: BABYLON.Scene;
    private avatars: Map<string, BABYLON.AbstractMesh> = new Map();
    private guiElements: Map<string, GUI.Rectangle> = new Map();
    private uiManager: GUI.AdvancedDynamicTexture;
    public localAvatar: BABYLON.AbstractMesh | null = null;

    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    private stopAllAnimations() {
        this.animations.forEach(anim => {
            if (anim.isPlaying) anim.stop();
        });
    }

    private playLocalAnimation(name: string, loop: boolean) {
        const anim = this.animations.get(name);
        if (anim && !anim.isPlaying) {
            this.stopAllAnimations();
            anim.play(loop);
        }
    }

    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        if (!this.localAvatar || !camera) return;

        const movementSpeed = 0.15;
        const rotationSpeed = 0.15;

        let forward = camera.getForwardRay().direction;
        forward.y = 0;
        forward = forward.normalize();

        let right = Vector3.Cross(Vector3.Up(), forward).normalize();

        const moveDirection = forward.scale(deltaZ).add(right.scale(-deltaX));

        if (moveDirection.length() > 0.001) {

            this.localAvatar.moveWithCollisions(moveDirection.scale(movementSpeed));

            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRotation,
                rotationSpeed
            );

            this.playLocalAnimation("walk", true);

            if (socket) {
                socket.emit('player_move', {
                    uid: this.localAvatar.name,
                    x: this.localAvatar.position.x,
                    y: this.localAvatar.position.y,
                    z: this.localAvatar.position.z,
                    ry: this.localAvatar.rotation.y
                });
            }

        } else {
            this.playLocalAnimation("idle", true);
        }
    }

    // =========================================
    // 🔥 BAGIAN YANG DIUPDATE (AVATAR GLB)
    // =========================================
    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        if (this.avatars.has(user.uid)) {
            return this.avatars.get(user.uid)!;
        }

        const fileName = user.role === ROLES.TEACHER
            ? "final_yeti.glb"
            : "final_frog.glb";

        // dummy sementara (biar tidak crash karena async)
        const dummy = BABYLON.MeshBuilder.CreateBox("temp", {}, this.scene);

        BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "/assets/avatar/",
            fileName,
            this.scene
        ).then((result) => {

            // ======================
            // 🔥 PENTING: PAKAI ROOT
            // ======================
            const root = result.meshes[0];
            const visual = result.meshes.find(m => m.getTotalVertices() > 0);

            root.name = user.uid;

            // ======================
            // POSISI
            // ======================
            root.position.x = user.x || (Math.random() * 4 - 2);
            root.position.z = user.z || (Math.random() * 4 - 2);

            // ======================
            // AUTO SCALE (pakai visual mesh)
            // ======================
            if (visual) {
                const bbox = visual.getBoundingInfo().boundingBox;
                let height = bbox.extendSize.y * 2;

                if (!height || height < 0.001) height = 1;

                const targetHeight = 1.7;
                let scale = targetHeight / height;

                scale = Math.min(Math.max(scale, 0.5), 3);

                root.scaling.setAll(scale);
            }

            // ======================
            // GROUND FIX
            // ======================
            root.computeWorldMatrix(true);

            const bboxWorld = root.getHierarchyBoundingVectors(true);
            const footY = bboxWorld.min.y;

            root.position.y += -footY + 0.05;

            // ======================
            // COLLISION (WAJIB DI ROOT)
            // ======================
            root.ellipsoid = new BABYLON.Vector3(0.5, 1, 0.5);
            root.ellipsoidOffset = new BABYLON.Vector3(0, 1, 0);

            root.checkCollisions = true;
            root.applyGravity = true;

            // ======================
            // ANIMATIONS
            // ======================
            result.animationGroups.forEach(anim => {
                this.animations.set(anim.name.toLowerCase(), anim);
                anim.stop();
            });

            this.playLocalAnimation("idle", true);

            // ======================
            // NAMETAG (ke root)
            // ======================
            this.addNameTag(root, user.uid, user.displayName);

            // ======================
            // SIMPAN ROOT (PENTING)
            // ======================
            this.avatars.set(user.uid, root);

            // ======================
            // LOCAL AVATAR FIX
            // ======================
            if (user.uid === this.localAvatar?.name || !this.localAvatar) {
                this.localAvatar = root;
            }

            // ======================
            // HAPUS DUMMY
            // ======================
            dummy.dispose();

            console.log("✅ Avatar GLB READY & MOVEABLE:", fileName);
        });

        return dummy;
    }

    private addNameTag(parent: BABYLON.AbstractMesh, uid: string, name: string) {
        const rect = new GUI.Rectangle();
        rect.width = "150px";
        rect.height = "40px";
        rect.cornerRadius = 5;
        rect.color = "white";
        rect.thickness = 2;
        rect.background = "rgba(0,0,0,0.5)";
        this.uiManager.addControl(rect);

        const label = new GUI.TextBlock();
        label.text = name;
        label.fontSize = 14;
        rect.addControl(label);

        rect.linkWithMesh(parent);
        rect.linkOffsetY = -100;

        this.guiElements.set(uid, rect);
    }

    public updateAvatar(uid: string, position: any, rotation: any) {
        const avatar = this.avatars.get(uid);
        if (avatar && position) {
            const targetPos = new BABYLON.Vector3(position.x, position.y, position.z);

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
        const avatar = this.avatars.get(uid);
        if (avatar) {
            avatar.dispose();
            this.avatars.delete(uid);
        }

        const rect = this.guiElements.get(uid);
        if (rect) {
            rect.dispose();
            this.guiElements.delete(uid);
        }

        console.log(`Avatar ${uid} musnah total, Lur!`);
    }
}