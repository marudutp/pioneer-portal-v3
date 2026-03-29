import { loginWithGoogle } from "./auth/AuthManager";
import { createPioneerScene } from "./scene";
import { AvatarManager } from "./managers/AvatarManager";
import { VoiceManager } from "./managers/VoiceManager";
import { NetworkManager } from "./network/NetworkManager";
import * as BABYLON from "@babylonjs/core";
import { WhiteboardManager } from "./managers/WhiteboardManager";
import { WhiteboardUI } from "./managers/WhiteboardUI";
import { User } from "firebase/auth";
import { TEACHER_EMAILS } from "@shared/admin.config";
import { ROLES } from "@shared/constants";
import "@babylonjs/loaders/glTF";
import { NETWORK_EVENTS } from "@shared/constants";

// ... (Konfigurasi Draco & KTX2 tetap sama)
BABYLON.DracoCompression.Configuration = {
    decoder: {
        wasmUrl: "https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js",
        wasmBinaryUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.wasm",
        fallbackUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.js"
    }
};

(BABYLON.KhronosTextureContainer2 as any).URLConfig = {
    jsDecoderModule: "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
    wasmUASTCToASTC: "https://cdn.babylonjs.com/wasm/uastc_astc.wasm",
    wasmUASTCToBC7: "https://cdn.babylonjs.com/wasm/uastc_bc7.wasm",
    wasmUASTCToRGBA_UNORM: "https://cdn.babylonjs.com/wasm/uastc_rgba8_unorm.wasm",
    wasmUASTCToRGBA_SRGB: "https://cdn.babylonjs.com/wasm/uastc_rgba8_srgb.wasm",
    wasmMSCTranscoder: "https://cdn.babylonjs.com/wasm/msc_basis_transcoder.wasm",
    jsMSCTranscoder: "https://cdn.babylonjs.com/babylon.msc_basis_transcoder.js"
};

interface AppUser extends User {
    role: string;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
let isStarted = false;

async function bootstrap() {
    if (isStarted) return;

    // 1. UI Overlay
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.opacity = "0";
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);

    // 2. Auth
    const googleUser = await loginWithGoogle();
    if (!googleUser) return;
    const user = googleUser as AppUser;

    // 3. Tentukan Role (Cukup 1x saja)
    const myRole = TEACHER_EMAILS.includes(user.email || "") ? ROLES.TEACHER : ROLES.STUDENT;
    user.role = myRole;

    // 4. Inisialisasi Scene & Manager
    const { scene, engine, canvas } = await createPioneerScene("renderCanvas");
    const avatarManager = new AvatarManager(scene);
    const voiceManager = new VoiceManager(scene);
    const networkManager = new NetworkManager(SERVER_URL, avatarManager);
    // Setup heartbeat (kirim sinyal setiap 10 detik)
    setInterval(() => {
        if (networkManager.socket && networkManager.socket.connected && user.uid) {
            networkManager.socket.emit('heartbeat', {
                uid: user.uid,
                timestamp: Date.now()
            });
        }
    }, 10000);
    const wbManager = new WhiteboardManager(scene, networkManager, user.role);

    (networkManager as any).voiceManager = voiceManager;
    networkManager.setWhiteboardManager(wbManager);

    // 🔥 TAHAP 1: Kunci ID
    avatarManager.setLocalUserId(user.uid);
    networkManager.localUid = user.uid;

    // 5. Setup Network Listeners (Pasang antena SEBELUM join)
    await networkManager.startVoiceChat();

    // Terima daftar player lama
    networkManager.socket.on("current_players", (players: any[]) => {
        players.forEach(p => {
            if (p.uid !== user.uid) avatarManager.createAvatar(p);
        });
    });

    // Terima update posisi
    networkManager.socket.on("player_moved", (data: any) => {
        avatarManager.updateAvatar(data.uid, data);
    });

    // Terima orang baru join
    networkManager.socket.on("new_player", (userData: any) => {
        if (userData.uid !== user.uid) avatarManager.createAvatar(userData);
    });

    // Player keluar
    networkManager.socket.on("player_disconnected", (uid: string) => {
        avatarManager.removeAvatar(uid);
    });

    // 🔥 TAHAP 2: Join Jaringan
    networkManager.joinClass(user.uid, user.displayName || "User", myRole);

    // 🔥 TAHAP 3: Buat Avatar Lokal (HANYA 1 KALI DI SINI)
    await avatarManager.createAvatar({
        uid: user.uid,
        displayName: user.displayName || "Saya",
        role: myRole
    });
    // 🔥 TAMBAHKAN: Pastikan local avatar sudah terdaftar sebelum input aktif
    await new Promise(resolve => {
        const checkInterval = setInterval(() => {
            if (avatarManager.localAvatar) {
                clearInterval(checkInterval);
                resolve(true);
            }
        }, 100);
    });

    // 6. Input Handling
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
    if (isMobile) {
        setupMobileInput(scene, avatarManager, canvas, networkManager.socket);
    } else {
        setupKeyboardInput(scene, avatarManager, scene.activeCamera as BABYLON.Camera, networkManager.socket);
    }

    // 7. UI & Ready
    new WhiteboardUI(wbManager, user.role);
    networkManager.setReady();

    // 8. Render Loop
    isStarted = true;
    engine.runRenderLoop(() => { scene.render(); });

    // Audio Unlocker
    window.addEventListener("click", () => {
        if (BABYLON.Engine.audioEngine) BABYLON.Engine.audioEngine.unlock();
    }, { once: true });

    window.addEventListener("resize", () => { engine.resize(); });
}

// ... (Fungsi setupKeyboardInput & setupMobileInput tetap sama seperti kodemu)
function setupKeyboardInput(scene: BABYLON.Scene, avatarManager: AvatarManager, camera: BABYLON.Camera, socket: any) {
    const inputMap: any = {};
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, evt => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = true;
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, evt => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = false;
    }));
    scene.onBeforeRenderObservable.add(() => {
        if (!avatarManager.localAvatar) return;
        let dx = 0, dz = 0;
        if (inputMap["w"]) dz += 1; if (inputMap["s"]) dz -= 1;
        if (inputMap["a"]) dx -= 1; if (inputMap["d"]) dx += 1;
        avatarManager.handleAvatarMovement(dx, dz, camera, socket);
    });
}

function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
    console.log("📱 Setting up mobile controls...");

    // Tampilkan UI mobile
    const mobileUI = document.getElementById("mobile-controls");
    if (mobileUI) mobileUI.style.display = "flex";

    // 🔥 PERBAIKAN: Inisialisasi VirtualJoystick dengan canvas yang benar
    const leftJoy = new BABYLON.VirtualJoystick(true);
    const rightJoy = new BABYLON.VirtualJoystick(false);

    // 🔥 TAMBAHKAN: Atur canvas untuk joystick
    leftJoy.setJoystickSensibility(0.5);
    rightJoy.setJoystickSensibility(0.5);

    // 🔥 TAMBAHKAN: Pastikan canvas menerima touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });

    // 🔥 TAMBAHKAN: Variables untuk smoothing movement
    let moveDirection = { x: 0, z: 0 };
    let lastUpdateTime = Date.now();

    // 🔥 TAMBAHKAN: Fungsi untuk update movement
    function updateMovement() {
        if (!avatarManager.localAvatar) return;

        const now = Date.now();
        const deltaTime = Math.min(0.033, (now - lastUpdateTime) / 1000);
        lastUpdateTime = now;

        // Ambil input dari joystick
        let dx = leftJoy.deltaPosition.x;
        let dz = leftJoy.deltaPosition.y;

        // Smooth movement dengan threshold
        if (Math.abs(dx) < 0.1) dx = 0;
        if (Math.abs(dz) < 0.1) dz = 0;

        if (dx !== 0 || dz !== 0) {
            // Hitung arah gerakan berdasarkan kamera
            const camera = scene.activeCamera;
            if (camera) {
                const forward = camera.getForwardRay().direction;
                const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
                const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

                // Gabungkan input joystick dengan arah kamera
                const moveVector = moveDir.scale(dz).add(rightDir.scale(-dx));

                // Terapkan pergerakan
                const speed = 3.0 * deltaTime; // 3 unit per detik
                avatarManager.localAvatar.position.addInPlace(moveVector.scale(speed));

                // Update rotasi berdasarkan arah gerakan
                if (moveVector.length() > 0.01) {
                    const targetRot = Math.atan2(moveVector.x, moveVector.z);
                    avatarManager.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
                        avatarManager.localAvatar.rotation.y,
                        targetRot,
                        0.3
                    );
                }

                // Kirim update ke server
                if (socket && socket.connected) {
                    socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
                        uid: avatarManager.localUserId,
                        position: {
                            x: avatarManager.localAvatar.position.x,
                            y: avatarManager.localAvatar.position.y,
                            z: avatarManager.localAvatar.position.z
                        },
                        rotation: {
                            y: avatarManager.localAvatar.rotation.y
                        }
                    });
                }
            }
        }

        // Request next frame
        requestAnimationFrame(updateMovement);
    }

    // Start movement update loop
    updateMovement();

    // 🔥 TAMBAHKAN: Handle rotasi kamera dengan right joystick
    let lastRightX = 0;
    function updateRotation() {
        if (!avatarManager.localAvatar) return;

        const rightX = rightJoy.deltaPosition.x;
        if (Math.abs(rightX) > 0.1) {
            avatarManager.localAvatar.rotation.y += rightX * 0.05;
            lastRightX = rightX;
        }

        requestAnimationFrame(updateRotation);
    }

    updateRotation();

    console.log("✅ Mobile controls initialized");

    function addTouchMovementFallback(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
        let touchStart = { x: 0, y: 0 };
        let isTouching = false;

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                touchStart.x = e.touches[0].clientX;
                touchStart.y = e.touches[0].clientY;
                isTouching = true;
                console.log("Touch started for movement");
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isTouching || !avatarManager.localAvatar || !scene.activeCamera) return;

            const deltaX = e.touches[0].clientX - touchStart.x;
            const deltaY = e.touches[0].clientY - touchStart.y;

            // Konversi touch delta ke movement
            const camera = scene.activeCamera;
            const forward = camera.getForwardRay().direction;
            const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
            const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

            // Sensitivity
            const sensitivity = 0.005;
            const moveVector = moveDir.scale(-deltaY * sensitivity)
                .add(rightDir.scale(-deltaX * sensitivity));

            // Apply movement
            avatarManager.localAvatar.position.addInPlace(moveVector);

            // Update rotation
            if (moveVector.length() > 0.01) {
                const targetRot = Math.atan2(moveVector.x, moveVector.z);
                avatarManager.localAvatar.rotation.y = targetRot;
            }

            // Reset touch start untuk continuous movement
            touchStart.x = e.touches[0].clientX;
            touchStart.y = e.touches[0].clientY;

            // Send to server
            if (socket && socket.connected) {
                socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
                    uid: avatarManager.localUserId,
                    position: avatarManager.localAvatar.position,
                    rotation: { y: avatarManager.localAvatar.rotation.y }
                });
            }
        });

        canvas.addEventListener('touchend', () => {
            isTouching = false;
            console.log("Touch ended");
        });

        console.log("Touch movement fallback added");
    }
    // Panggil fungsi ini di setupMobileInput
    addTouchMovementFallback(scene, avatarManager, canvas, socket);
}

window.addEventListener("DOMContentLoaded", bootstrap);