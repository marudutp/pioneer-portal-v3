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

    public localAvatar: BABYLON.AbstractMesh | null = null;
    private currentAnim: string = "";
    public localUserId: string = "";
    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
    }

    // ======================
    // 🔥 ANIMATION SYSTEM FIX
    // ======================
    // private stopAllAnimations() {
    //     this.animations.forEach(anim => anim.stop());
    // }
    private stopAllAnimations() {
        this.animations.forEach(animMap => {
            animMap.forEach(anim => {
                anim.stop();
            });
        });
    }

    // private playLocalAnimation(name: string) {
    //     const anim = this.animations.get(name.toLowerCase());
    //     if (!anim) return;

    //     if (this.currentAnim === name) return;

    //     this.stopAllAnimations();
    //     anim.start(true);
    //     this.currentAnim = name;
    // }

    // private playLocalAnimation(name: string) {
    //     if (!this.localAvatar) return;

    //     const animMap = this.animations.get(this.localAvatar.name);
    //     if (!animMap) return;

    //     const anim = animMap.get(name.toLowerCase());
    //     if (!anim) return;

    //     if (this.currentAnim === name) return;

    //     animMap.forEach(a => a.stop());

    //     anim.start(true);
    //     this.currentAnim = name;
    // }

    private playLocalAnimation(name: string) {
        if (!this.localAvatar) return;

        // const animMap = this.animations.get(this.localAvatar.name);
        const animMap = this.animations.get(this.localUserId);
        if (!animMap) return;

        // const anim = animMap.get(name.toLowerCase());
        const anim = animMap.get(name);
        if (!anim) {
            console.warn("❌ Anim tidak ditemukan:", name);
            return;
        }

        if (this.currentAnim === name) return;

        // 🔥 stop hanya anim avatar ini
        animMap.forEach(a => a.stop());

        anim.start(true);
        this.currentAnim = name;

        console.log("🎬 PLAY:", name);
    }

    // ======================
    // MOVEMENT
    // ======================
    // public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
    //     if (!this.localAvatar || !camera) return;

    //     const speed = 0.15;
    //     const rotationSpeed = 0.15;

    //     let forward = camera.getForwardRay().direction;
    //     forward.y = 0;
    //     forward = forward.normalize();

    //     let right = Vector3.Cross(Vector3.Up(), forward).normalize();

    //     const move = forward.scale(deltaZ).add(right.scale(-deltaX));

    //     if (move.length() > 0.001) {

    //         this.localAvatar.moveWithCollisions(move.scale(speed));

    //         const targetRot = Math.atan2(move.x, move.z);
    //         this.localAvatar.rotation.y = Scalar.LerpAngle(
    //             this.localAvatar.rotation.y,
    //             targetRot,
    //             rotationSpeed
    //         );

    //         this.playLocalAnimation("walk");

    //         if (socket) {
    //             socket.emit("player_move", {
    //                 uid: this.localAvatar.name,
    //                 x: this.localAvatar.position.x,
    //                 y: this.localAvatar.position.y,
    //                 z: this.localAvatar.position.z,
    //                 ry: this.localAvatar.rotation.y
    //             });
    //         }

    //     } else {
    //         this.playLocalAnimation("idle");
    //     }
    //     // console.log("🔥 MOVEMENT CALLED", deltaX, deltaZ);
    // }

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

            console.log("🎬 WALK TRIGGER");

            this.localAvatar.moveWithCollisions(move.scale(speed));

            const targetRot = Math.atan2(move.x, move.z);
            this.localAvatar.rotation.y = Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            this.playLocalAnimation("Walk");

            if (socket) {
                socket.emit("player_move", {
                    uid: this.localAvatar.name,
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

    // ======================
    // 🔥 CREATE AVATAR (FINAL)
    // ======================


    // public createAvatar(user: UserData): BABYLON.AbstractMesh {
    //     if (this.avatars.has(user.uid)) {
    //         return this.avatars.get(user.uid)!;
    //     }

    //     const fileName = user.role === ROLES.TEACHER
    //         ? "final_yeti.glb"
    //         : "final_frog.glb";

    //     const dummy = BABYLON.MeshBuilder.CreateBox("temp", {}, this.scene);

    //     BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
    //         .then((result) => {

    //             console.log("🎬 Animations:", result.animationGroups.map(a => a.name));

    //             // const root = result.meshes[0];
    //             // const visual = result.meshes.find(m => m.getTotalVertices() > 0);

    //             // root.name = user.uid;

    //             // // posisi
    //             // root.position.x = user.x || (Math.random() * 4 - 2);
    //             // root.position.z = user.z || (Math.random() * 4 - 2);

    //             // // scale
    //             // if (visual) {
    //             //     const bbox = visual.getBoundingInfo().boundingBox;
    //             //     let height = bbox.extendSize.y * 2;
    //             //     if (!height || height < 0.001) height = 1;

    //             //     const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
    //             //     root.scaling.setAll(scale);
    //             // }

    //             // // ground fix
    //             // root.computeWorldMatrix(true);
    //             // const bounds = root.getHierarchyBoundingVectors(true);
    //             // root.position.y += -bounds.min.y + 0.05;

    //             // // collision
    //             // root.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4);
    //             // root.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
    //             // root.checkCollisions = false;

    //             // // ======================
    //             // // 🔥 REGISTER ANIMATIONS
    //             // // ======================
    //             // this.animations.clear();

    //             // result.animationGroups.forEach(anim => {
    //             //     this.animations.set(anim.name.toLowerCase(), anim);
    //             //     anim.stop();
    //             // });

    //             // this.playLocalAnimation("idle");

    //             // // nametag
    //             // this.addNameTag(root, user.uid, user.displayName);
    //             const root = result.meshes[0];
    //             // ======================
    //             // 🔥 FIX OFFSET AVATAR
    //             // ======================
    //             root.position.y = 1;
    //             // 🔥 BUAT CONTROLLER
    //             const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
    //                 height: 2,
    //                 radius: 0.4
    //             }, this.scene);

    //             controller.isVisible = false;

    //             // posisi awal
    //             controller.position.x = user.x || (Math.random() * 4 - 2);
    //             controller.position.z = user.z || (Math.random() * 4 - 2);

    //             // 🔥 PARENT GLB KE CONTROLLER
    //             root.parent = controller;

    //             // ======================
    //             // COLLISION DI CONTROLLER
    //             // ======================
    //             controller.checkCollisions = true;
    //             // // ======================
    //             // // 🔥 REGISTER ANIMATIONS
    //             // // ======================
    //             this.animations.clear();

    //             result.animationGroups.forEach(anim => {
    //                 this.animations.set(anim.name.toLowerCase(), anim);
    //                 anim.stop();
    //             });



    //             // nametag tetap ke controller
    //             this.addNameTag(controller, user.uid, user.displayName);
    //             // this.avatars.set(user.uid, root);
    //             // this.localAvatar = root;
    //             // ======================
    //             // SIMPAN CONTROLLER (BUKAN ROOT)
    //             // ======================
    //             this.avatars.set(user.uid, controller);
    //             this.localAvatar = controller;
    //             dummy.dispose();

    //             console.log("✅ Avatar READY & ANIMATION WORKING");
    //         });

    //     return dummy;
    // }


    public createAvatar(user: UserData): BABYLON.AbstractMesh {
        if (this.avatars.has(user.uid)) {
            return this.avatars.get(user.uid)!;
        }

        const fileName = user.role === ROLES.TEACHER
            ? "final_yeti.glb"
            : "final_frog.glb";

        const dummy = BABYLON.MeshBuilder.CreateBox("temp", {}, this.scene);

        BABYLON.SceneLoader.ImportMeshAsync("", "/assets/avatar/", fileName, this.scene)
            .then((result) => {

                console.log("🎬 Animations:", result.animationGroups.map(a => a.name));

                const root = result.meshes[0];
                const visual = result.meshes.find(m => m.getTotalVertices() > 0);

                // ======================
                // 🔥 CONTROLLER
                // ======================
                const controller = BABYLON.MeshBuilder.CreateCapsule("ctrl-" + user.uid, {
                    height: 2,
                    radius: 0.4
                }, this.scene);

                controller.isVisible = false;

                controller.position.x = user.x || (Math.random() * 4 - 2);
                controller.position.z = user.z || (Math.random() * 4 - 2);

                // ======================
                // 🔥 PARENT
                // ======================
                root.parent = controller;

                // ======================
                // 🔥 SCALE
                // ======================
                if (visual) {
                    const bbox = visual.getBoundingInfo().boundingBox;
                    let height = bbox.extendSize.y * 2;
                    if (!height || height < 0.001) height = 1;

                    const scale = Math.min(Math.max(1.7 / height, 0.5), 3);
                    root.scaling.setAll(scale);
                }

                // ======================
                // 🔥 OFFSET (PENTING)
                // ======================
                root.position.y = 0; // bukan +1

                // ======================
                // COLLISION
                // ======================
                controller.checkCollisions = true;

                // ======================
                // 🔥 ANIMATIONS
                // ======================

                // this.animations.clear();

                // result.animationGroups.forEach(anim => {
                //     anim.stop();
                //     this.animations.set(anim.name.toLowerCase(), anim);
                // });

                const animMap = new Map<string, AnimationGroup>();

                result.animationGroups.forEach(anim => {
                    anim.stop();
                    animMap.set(anim.name.toLowerCase(), anim);
                });

                this.animations.set(user.uid, animMap);

                // paksa idle
                // const idle = this.animations.get("idle");
                // if (idle) {
                //     idle.start(true);
                //     this.currentAnim = "idle";
                // }

                // const animMap = this.animations.get(user.uid);
                const idle = animMap?.get("idle");

                if (idle) {
                    idle.start(true);
                }

                // ======================
                // NAMETAG
                // ======================
                this.addNameTag(controller, user.uid, user.displayName);

                // ======================
                // SIMPAN
                // ======================
                this.avatars.set(user.uid, controller);

                // 🔥 FIX OWNERSHIP
                if (user.uid === this.localUserId) {
                    this.localAvatar = controller;
                }

                dummy.dispose();

                console.log("✅ Avatar FINAL SIAP");
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
        if (!avatar || !position) return;

        const target = new BABYLON.Vector3(position.x, position.y, position.z);

        if (!isNaN(target.x)) {
            avatar.position = BABYLON.Vector3.Lerp(avatar.position, target, 0.2);
        }

        if (rotation) {
            const rot = new BABYLON.Vector3(rotation.x, rotation.y, rotation.z);
            avatar.rotation = BABYLON.Vector3.Lerp(avatar.rotation, rot, 0.2);
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

        console.log(`Avatar ${uid} musnah total`);
    }
}