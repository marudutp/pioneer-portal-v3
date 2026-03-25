import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ROLES } from "@shared/constants";
import { Vector3, Scalar, AnimationGroup } from "@babylonjs/core";
import { NETWORK_EVENTS } from "@shared/constants";
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
    private activeAvatarUid: string | null = null; // Tambahkan ini
    // Tambahkan properti ini di class AvatarManager
    private lastServerUpdate: number = 0;
    private lastMovementState: boolean = false;
    // 🔥 Kunci Y agar kaki tetap menapak (Anti-Tenggelam)
    private readonly GROUND_Y = 0.9;
    // 🔥 TAMBAHKAN: Property untuk tracking
    private lastKnownPositions: Map<string, BABYLON.Vector3> = new Map();
    private currentAnimNames: Map<string, string> = new Map();
    private lastKnownRotations: Map<string, number> = new Map();
    private getCurrentAnimName(uid: string): string {
        return this.currentAnimNames.get(uid) || "idle";
    }
    private movementHistory: Map<string, { positions: BABYLON.Vector3[], timestamps: number[] }> = new Map();
    private setCurrentAnimName(uid: string, animName: string) {
        this.currentAnimNames.set(uid, animName);
    }
    constructor(scene: BABYLON.Scene) {
        this.scene = scene;
        this.uiManager = GUI.AdvancedDynamicTexture.CreateFullscreenUI("GlobalUI");
        // 🔥 TAMBAHKAN: Listener untuk visibility change
        this.setupVisibilityListener();
    }

    public setLocalUserId(uid: string) {
        this.localUserId = uid;
    }

    private setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.localUserId) {
                console.log(`🟢 Tab aktif: ${this.localUserId}`);
                this.activeAvatarUid = this.localUserId;

                // Broadcast bahwa tab ini aktif
                if (this.localAvatar) {
                    this.broadcastActiveState();
                }
            }
        });
    }
    private broadcastActiveState() {
        // Kirim sinyal ke server bahwa avatar ini aktif
        if (this.localAvatar && this.localUserId) {
            // Trigger movement update untuk memberi tahu server
            setTimeout(() => {
                this.handleAvatarMovement(0, 0, null, null);
            }, 100);
        }
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


    // public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
    //     // 🔥 PERBAIKAN: Cek apakah avatar ini adalah yang aktif di tab ini
    //     if (!this.localAvatar || !camera) return;

    //     // 🔥 PERBAIKAN: Pastikan hanya avatar yang visible di tab ini yang bergerak
    //     if (document.visibilityState !== 'visible') {
    //         // Tab tidak aktif, jangan gerakkan avatar
    //         return;
    //     }

    //     const speed = 0.15;
    //     const rotationSpeed = 0.15;

    //     let forward = camera.getForwardRay().direction;
    //     let moveDir = new Vector3(forward.x, 0, forward.z).normalize();
    //     let rightDir = Vector3.Cross(Vector3.Up(), moveDir).normalize();
    //     const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

    //     if (deltaX !== 0 || deltaZ !== 0) {
    //         this.localAvatar.position.addInPlace(moveVector.scale(speed));
    //         this.localAvatar.position.y = this.GROUND_Y;

    //         const targetRot = Math.atan2(moveVector.x, moveVector.z);
    //         this.localAvatar.rotation.y = Scalar.LerpAngle(this.localAvatar.rotation.y, targetRot, rotationSpeed);

    //         this.playLocalAnimation("walk");

    //         if (socket && socket.connected) {
    //             socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
    //                 uid: this.localUserId,
    //                 position: {
    //                     x: this.localAvatar.position.x,
    //                     y: this.localAvatar.position.y,
    //                     z: this.localAvatar.position.z
    //                 },
    //                 rotation: {
    //                     y: this.localAvatar.rotation.y
    //                 }
    //             });
    //         }
    //     } else {
    //         this.playLocalAnimation("idle");
    //         this.localAvatar.position.y = this.GROUND_Y;
    //     }
    // }

    // AvatarManager.ts - Handle Avatar Movement dengan Dynamic Throttle

    /**
     * HANDLE AVATAR MOVEMENT - VERSION FINAL
     * Dengan dynamic throttle untuk optimasi network
     */
    public handleAvatarMovement(deltaX: number, deltaZ: number, camera: any, socket: any) {
        // Validasi dasar
        if (!this.localAvatar || !camera) return;

        // 🔥 KUNCI: Hanya tab aktif yang bisa gerak
        if (document.visibilityState !== 'visible') return;

        // Throttle tracking
        const now = Date.now();
        if (!this.lastServerUpdate) this.lastServerUpdate = now;
        if (!this.lastMovementState) this.lastMovementState = false;

        // Konstanta pergerakan
        const speed = 0.15;
        const rotationSpeed = 0.15;

        // Hitung arah gerakan berdasarkan kamera
        let forward = camera.getForwardRay().direction;
        let moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
        let rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();
        const moveVector = moveDir.scale(deltaZ).add(rightDir.scale(-deltaX));

        const isMoving = Math.abs(deltaX) > 0.01 || Math.abs(deltaZ) > 0.01;

        // ============================================
        // UPDATE POSISI & ROTASI LOKAL
        // ============================================
        if (isMoving) {
            // Update posisi
            this.localAvatar.position.addInPlace(moveVector.scale(speed));
            this.localAvatar.position.y = this.GROUND_Y;

            // Update rotasi (face movement direction)
            const targetRot = Math.atan2(moveVector.x, moveVector.z);
            this.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
                this.localAvatar.rotation.y,
                targetRot,
                rotationSpeed
            );

            // Play walk animation
            this.playLocalAnimation("walk");

            // ============================================
            // DYNAMIC THROTTLE: Kirim update saat bergerak
            // Rate: 20x per detik (50ms interval)
            // ============================================
            if (socket && socket.connected && (now - this.lastServerUpdate >= 50)) {
                this.sendPositionUpdate(socket);
                this.lastServerUpdate = now;
                this.lastMovementState = true;
            }
        } else {
            // Tidak bergerak
            this.playLocalAnimation("idle");
            this.localAvatar.position.y = this.GROUND_Y;

            // ============================================
            // DYNAMIC THROTTLE: Update lebih jarang saat idle
            // Rate: 2x per detik (500ms interval)
            // Atau saat baru berhenti bergerak
            // ============================================
            const justStopped = this.lastMovementState === true;
            const throttleTime = justStopped ? 100 : 500; // Langsung update saat berhenti

            if (socket && socket.connected && (now - this.lastServerUpdate >= throttleTime)) {
                this.sendPositionUpdate(socket);
                this.lastServerUpdate = now;
                this.lastMovementState = false;
            }
        }

        // ============================================
        // BOUNDARY CHECK (Opsional: batasi area gerak)
        // ============================================
        const boundary = 15; // Batas area 15 unit
        if (Math.abs(this.localAvatar.position.x) > boundary) {
            this.localAvatar.position.x = Math.sign(this.localAvatar.position.x) * boundary;
        }
        if (Math.abs(this.localAvatar.position.z) > boundary) {
            this.localAvatar.position.z = Math.sign(this.localAvatar.position.z) * boundary;
        }
    }

    /**
     * SEND POSITION UPDATE KE SERVER
     * Extract method untuk menghindari duplikasi kode
     */
    private sendPositionUpdate(socket: any) {
        if (!socket || !socket.connected) return;
        if (!this.localAvatar) return;

        // Validasi posisi (hindari NaN atau Infinity)
        const posX = isFinite(this.localAvatar.position.x) ? this.localAvatar.position.x : 0;
        const posY = isFinite(this.localAvatar.position.y) ? this.localAvatar.position.y : this.GROUND_Y;
        const posZ = isFinite(this.localAvatar.position.z) ? this.localAvatar.position.z : 0;
        const rotY = isFinite(this.localAvatar.rotation.y) ? this.localAvatar.rotation.y : 0;

        socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
            uid: this.localUserId,
            position: {
                x: posX,
                y: posY,
                z: posZ
            },
            rotation: {
                y: rotY
            }
        });
    }




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
            controller.checkCollisions = false;

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
                this.activeAvatarUid = user.uid;
                this.playLocalAnimation("idle");
                console.log("🌟 Avatar Lokal Siap di:", controller.position.toString());

                // 🔥 TAMBAHKAN: Broadcast aktif setelah avatar siap
                this.broadcastActiveState();
            } else {
                // // Avatar remote - pastikan idle animation berjalan
                // const idleAnim = animMap.get("idle");
                // if (idleAnim) idleAnim.start(true);
                // 🔥 TAMBAHKAN: Pastikan remote avatar mulai dengan idle
                setTimeout(() => {
                    const animMap = this.animations.get(user.uid);
                    if (animMap) {
                        const idleAnim = animMap.get("idle");
                        if (idleAnim) {
                            animMap.forEach(anim => {
                                if (anim !== idleAnim && anim.isPlaying) anim.stop();
                            });
                            idleAnim.start(true);
                            this.currentAnimNames.set(user.uid, "idle");
                        }
                    }
                }, 100); // Beri waktu sedikit untuk loading selesai
            }
            dummy.dispose();
        }).catch(err => {
            console.error(`❌ Gagal load avatar untuk ${user.uid}:`, err);
            this.loadingAvatars.delete(user.uid);
            dummy.dispose();
        });

        return dummy;
    }



    // public updateAvatar(uid: string, data: any) {
    //     // 🔥 PERBAIKAN: Jangan abaikan update, tapi filter berdasarkan active state
    //     if (uid === this.localUserId) {
    //         // Update dari server untuk diri sendiri? Abaikan
    //         return;
    //     }

    //     const avatar = this.avatars.get(uid);
    //     if (!avatar || !data) return;

    //     // 🔥 PERBAIKAN: Cek apakah avatar ini adalah yang sedang aktif di tab lain
    //     // Jika ya, update posisi mereka dengan halus
    //     const targetPos = new BABYLON.Vector3(data.x, this.GROUND_Y, data.z);
    //     const distance = BABYLON.Vector3.Distance(avatar.position, targetPos);

    //     // Update posisi
    //     avatar.position = BABYLON.Vector3.Lerp(avatar.position, targetPos, 0.3);

    //     if (data.ry !== undefined) {
    //         avatar.rotation.y = BABYLON.Scalar.LerpAngle(avatar.rotation.y, data.ry, 0.3);
    //     }

    //     // Animasi untuk avatar remote
    //     const animMap = this.animations.get(uid);
    //     if (animMap) {
    //         const isMoving = distance > 0.02;
    //         const animName = isMoving ? "walk" : "idle";
    //         const targetKey = Array.from(animMap.keys()).find(k => k.includes(animName));

    //         if (targetKey) {
    //             const anim = animMap.get(targetKey);
    //             if (anim && !anim.isPlaying) {
    //                 animMap.forEach(a => a.stop());
    //                 anim.start(true);
    //             }
    //         }
    //     }
    // }

    // AvatarManager.ts - updateAvatar method
    // AvatarManager.ts - Final Version

    // Tambahkan properti ini di dalam class AvatarManager (di bagian atas bersama properti lainnya)


    private lastUpdateTime: Map<string, number> = new Map();

    /**
     * UPDATE AVATAR - VERSION FINAL
     * Untuk avatar remote (bukan lokal)
     * Menangani update posisi, rotasi, dan animasi dengan deteksi gerakan yang akurat
     */
    public updateAvatar(uid: string, data: any) {
        // JANGAN update avatar lokal lewat network
        if (uid === this.localUserId) {
            return;
        }

        const avatar = this.avatars.get(uid);
        if (!avatar || !data) {
            return;
        }

        // Ekstrak data posisi
        const targetPos = new BABYLON.Vector3(
            data.x,
            this.GROUND_Y,
            data.z
        );

        const targetRot = data.ry !== undefined ? data.ry : avatar.rotation.y;

        // ============================================
        // 1. DETEKSI PERGERAKAN NYATA (PAKAI HISTORY)
        // ============================================
        let isReallyMoving = false;
        let averageSpeed = 0;

        // Ambil atau buat history untuk user ini
        let history = this.movementHistory.get(uid);
        if (!history) {
            history = { positions: [], timestamps: [] };
            this.movementHistory.set(uid, history);
        }

        // Simpan posisi terbaru dengan timestamp
        const now = Date.now();
        history.positions.push(targetPos.clone());
        history.timestamps.push(now);

        // Hanya simpan 5 history terakhir (cukup untuk deteksi)
        if (history.positions.length > 5) {
            history.positions.shift();
            history.timestamps.shift();
        }

        // Hitung kecepatan rata-rata dari history
        if (history.positions.length >= 2) {
            let totalDistance = 0;
            let totalTime = 0;

            for (let i = 1; i < history.positions.length; i++) {
                const dist = BABYLON.Vector3.Distance(
                    history.positions[i - 1],
                    history.positions[i]
                );
                const timeDiff = (history.timestamps[i] - history.timestamps[i - 1]) / 1000;
                totalDistance += dist;
                totalTime += timeDiff;
            }

            averageSpeed = totalTime > 0 ? totalDistance / totalTime : 0;

            // 🔥 KUNCI: Gerakan nyata jika kecepatan > 0.3 unit per detik
            // Ini akan mencegah getaran kecil memicu animasi walk
            isReallyMoving = averageSpeed > 0.3;
        }

        // ============================================
        // 2. UPDATE POSISI (DENGAN LOGIKA CERDAS)
        // ============================================
        const currentPos = avatar.position.clone();
        const distanceToTarget = BABYLON.Vector3.Distance(currentPos, targetPos);

        if (isReallyMoving) {
            // BENAR-BENAR BERGERAK: Gunakan lerp untuk gerakan halus
            // Gunakan faktor lerp yang lebih kecil untuk gerakan yang lebih halus
            const lerpFactor = Math.min(0.4, distanceToTarget * 0.1);
            avatar.position = BABYLON.Vector3.Lerp(currentPos, targetPos, lerpFactor);
        } else {
            // DIAM: Langsung snap ke posisi (biar tidak ada getaran)
            avatar.position = targetPos;
        }

        // ============================================
        // 3. UPDATE ROTASI (DENGAN LOGIKA CERDAS)
        // ============================================
        const rotDiff = Math.abs(avatar.rotation.y - targetRot);
        const isRotating = rotDiff > 0.05;

        if (isRotating && isReallyMoving) {
            // Bergerak dan berputar: lerp halus
            avatar.rotation.y = BABYLON.Scalar.LerpAngle(
                avatar.rotation.y,
                targetRot,
                0.3
            );
        } else if (isRotating && !isReallyMoving) {
            // Diam tapi berputar (standby rotation): lerp lebih cepat
            avatar.rotation.y = BABYLON.Scalar.LerpAngle(
                avatar.rotation.y,
                targetRot,
                0.5
            );
        } else if (!isRotating) {
            // Tidak berputar: langsung snap
            avatar.rotation.y = targetRot;
        }

        // ============================================
        // 4. UPDATE ANIMASI (BERDASARKAN DETEKSI GERAKAN)
        // ============================================
        const animMap = this.animations.get(uid);
        if (animMap) {
            // Dapatkan animasi yang sedang berjalan
            let currentAnim = this.currentAnimNames.get(uid);
            if (!currentAnim) {
                currentAnim = "idle";
                this.currentAnimNames.set(uid, "idle");
            }

            // Tentukan animasi target berdasarkan deteksi gerakan
            let targetAnimName = "idle";

            if (isReallyMoving) {
                // Benar-benar bergerak: jalan
                targetAnimName = "walk";
            } else {
                // Diam: idle
                targetAnimName = "idle";
            }

            // HANYA ganti animasi jika berbeda dari yang sedang berjalan
            if (targetAnimName !== currentAnim) {
                // Cari animasi yang cocok (case insensitive)
                const targetKey = Array.from(animMap.keys()).find(key =>
                    key.toLowerCase().includes(targetAnimName) ||
                    targetAnimName.includes(key.toLowerCase())
                );

                if (targetKey) {
                    const targetAnim = animMap.get(targetKey);
                    if (targetAnim) {
                        // Stop semua animasi yang sedang berjalan
                        animMap.forEach((anim, key) => {
                            if (anim !== targetAnim && anim.isPlaying) {
                                anim.stop();
                            }
                        });

                        // Start animasi baru
                        targetAnim.start(true, 1.0, 1.0, 0);

                        // Update current anim name
                        this.currentAnimNames.set(uid, targetAnimName);

                        // Debug (opsional, bisa dihapus)
                        if (targetAnimName === "walk") {
                            console.log(`🚶 ${uid} mulai berjalan (kecepatan: ${averageSpeed.toFixed(2)})`);
                        }
                    }
                }
            }
        }

        // ============================================
        // 5. SIMPAN DATA UNTUK REFERENSI BERIKUTNYA
        // ============================================
        this.lastKnownPositions.set(uid, targetPos.clone());
        this.lastKnownRotations.set(uid, targetRot);
        this.lastUpdateTime.set(uid, now);
    }

    /**
     * CLEANUP - Hapus data saat avatar di-remove
     */
    public removeAvatar(uid: string) {
        // Hapus mesh avatar
        const avatar = this.avatars.get(uid);
        if (avatar) {
            avatar.dispose();
        }

        // Hapus GUI element
        const guiElement = this.guiElements.get(uid);
        if (guiElement) {
            guiElement.dispose();
        }

        // Hapus semua data tracking
        this.avatars.delete(uid);
        this.guiElements.delete(uid);
        this.animations.delete(uid);
        this.lastKnownPositions.delete(uid);
        this.lastKnownRotations.delete(uid);
        this.currentAnimNames.delete(uid);
        this.movementHistory.delete(uid);
        this.lastUpdateTime.delete(uid);
        this.loadingAvatars.delete(uid);
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

    // public removeAvatar(uid: string) {
    //     this.avatars.get(uid)?.dispose();
    //     this.avatars.delete(uid);
    //     this.guiElements.get(uid)?.dispose();
    //     this.guiElements.delete(uid);
    //     this.animations.delete(uid);
    // }
}