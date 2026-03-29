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
// 🔥 EXPOSE KE GLOBAL WINDOW agar bisa dipanggil dari NetworkManager
// 🔥 Deklarasi global untuk window.updateCapacityUI
declare global {
    interface Window {
        updateCapacityUI?: (current: number, max: number) => void;
    }
}

// 🔥 DEFINE DAN REGISTER FUNGSI UPDATE UI
function setupCapacityUI() {
    // Fungsi untuk update UI
    const updateCapacityUI = (current: number, max: number) => {
        const currentEl = document.getElementById('current-capacity');
        const maxEl = document.getElementById('max-capacity');

        if (currentEl) {
            currentEl.innerText = current.toString();
            console.log(`📊 [UI Update] Kapasitas: ${current}/${max}`);
        } else {
            console.error("❌ Element #current-capacity tidak ditemukan di DOM!");
        }

        if (maxEl) {
            maxEl.innerText = max.toString();
        }

        // Optional: Update juga di panel lain
        const capacityPanel = document.getElementById('capacity-panel');
        if (capacityPanel) {
            capacityPanel.style.border = current >= max ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)';
        }
    };

    // Register ke global window agar bisa diakses dari NetworkManager
    (window as any).updateCapacityUI = updateCapacityUI;

    // Set initial value
    updateCapacityUI(0, 10);

    console.log("✅ Capacity UI system initialized");

    return updateCapacityUI;
}
async function bootstrap() {
    // 1. Setup capacity UI terlebih dahulu
    const updateCapacityUI = setupCapacityUI();
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
    // 🔥 PANGGIL SAAT INITIAL LOAD (set nilai awal)
    updateCapacityUI(0, 10);
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
        setupMobileCamera(scene, canvas);
    } else {
        setupKeyboardInput(scene, avatarManager, scene.activeCamera as BABYLON.Camera, networkManager.socket);
    }

    // 8. Minta update kapasitas setelah join
    setInterval(() => {
        if (networkManager.socket && networkManager.socket.connected) {
            networkManager.socket.emit('admin_request_stats');
            console.log("📊 Periodic capacity request");

            // 🔥 Log current state untuk debugging
            console.log("Current UI capacity:", {
                current: document.getElementById('current-capacity')?.innerText,
                max: document.getElementById('max-capacity')?.innerText
            });
        }
    }, 3000);
    
    setTimeout(() => {
        if (networkManager.socket && networkManager.socket.connected) {
            networkManager.socket.emit('admin_request_stats');
            console.log("📊 Meminta update kapasitas dari server...");
        }
    }, 1000);

    // 9. Event listener untuk capacity update dari server (opsional, sebagai backup)
    if (networkManager.socket) {
        networkManager.socket.on('capacityUpdate', (data: any) => {
            console.log("📊 [Main] Capacity update received:", data);
            updateCapacityUI(data.current, data.max);
        });
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

// 🔥 Function untuk update kapasitas di UI
function updateCapacityUI(current: number, max: number) {
    const currentEl = document.getElementById('current-capacity');
    const maxEl = document.getElementById('max-capacity');

    if (currentEl) {
        currentEl.innerText = current.toString();
        console.log(`📊 UI Kapasitas diupdate: ${current}/${max}`);
    } else {
        console.warn("⚠️ Element #current-capacity tidak ditemukan di DOM");
    }

    if (maxEl) {
        maxEl.innerText = max.toString();
    }
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

// function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
//     console.log("📱 Setting up mobile controls...");

//     // Tampilkan UI mobile
//     const mobileUI = document.getElementById("mobile-controls");
//     if (mobileUI) mobileUI.style.display = "flex";

//     // 🔥 PERBAIKAN: Inisialisasi VirtualJoystick dengan canvas yang benar
//     const leftJoy = new BABYLON.VirtualJoystick(true);
//     const rightJoy = new BABYLON.VirtualJoystick(false);

//     // 🔥 TAMBAHKAN: Atur canvas untuk joystick
//     leftJoy.setJoystickSensibility(0.5);
//     rightJoy.setJoystickSensibility(0.5);

//     // 🔥 TAMBAHKAN: Pastikan canvas menerima touch events
//     canvas.addEventListener('touchstart', (e) => {
//         e.preventDefault();
//     }, { passive: false });

//     canvas.addEventListener('touchmove', (e) => {
//         e.preventDefault();
//     }, { passive: false });

//     // 🔥 TAMBAHKAN: Variables untuk smoothing movement
//     let moveDirection = { x: 0, z: 0 };
//     let lastUpdateTime = Date.now();

//     // 🔥 TAMBAHKAN: Fungsi untuk update movement
//     function updateMovement() {
//         if (!avatarManager.localAvatar) return;

//         const now = Date.now();
//         const deltaTime = Math.min(0.033, (now - lastUpdateTime) / 1000);
//         lastUpdateTime = now;

//         // Ambil input dari joystick
//         let dx = leftJoy.deltaPosition.x;
//         let dz = leftJoy.deltaPosition.y;

//         // Smooth movement dengan threshold
//         if (Math.abs(dx) < 0.1) dx = 0;
//         if (Math.abs(dz) < 0.1) dz = 0;

//         if (dx !== 0 || dz !== 0) {
//             // Hitung arah gerakan berdasarkan kamera
//             const camera = scene.activeCamera;
//             if (camera) {
//                 const forward = camera.getForwardRay().direction;
//                 const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
//                 const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

//                 // Gabungkan input joystick dengan arah kamera
//                 const moveVector = moveDir.scale(dz).add(rightDir.scale(-dx));

//                 // Terapkan pergerakan
//                 const speed = 3.0 * deltaTime; // 3 unit per detik
//                 avatarManager.localAvatar.position.addInPlace(moveVector.scale(speed));

//                 // Update rotasi berdasarkan arah gerakan
//                 if (moveVector.length() > 0.01) {
//                     const targetRot = Math.atan2(moveVector.x, moveVector.z);
//                     avatarManager.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
//                         avatarManager.localAvatar.rotation.y,
//                         targetRot,
//                         0.3
//                     );
//                 }

//                 // Kirim update ke server
//                 if (socket && socket.connected) {
//                     socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
//                         uid: avatarManager.localUserId,
//                         position: {
//                             x: avatarManager.localAvatar.position.x,
//                             y: avatarManager.localAvatar.position.y,
//                             z: avatarManager.localAvatar.position.z
//                         },
//                         rotation: {
//                             y: avatarManager.localAvatar.rotation.y
//                         }
//                     });
//                 }
//             }
//         }

//         // Request next frame
//         requestAnimationFrame(updateMovement);
//     }

//     // Start movement update loop
//     updateMovement();

//     // 🔥 TAMBAHKAN: Handle rotasi kamera dengan right joystick
//     let lastRightX = 0;
//     function updateRotation() {
//         if (!avatarManager.localAvatar) return;

//         const rightX = rightJoy.deltaPosition.x;
//         if (Math.abs(rightX) > 0.1) {
//             avatarManager.localAvatar.rotation.y += rightX * 0.05;
//             lastRightX = rightX;
//         }

//         requestAnimationFrame(updateRotation);
//     }

//     updateRotation();

//     console.log("✅ Mobile controls initialized");

//     function addTouchMovementFallback(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
//         let touchStart = { x: 0, y: 0 };
//         let isTouching = false;

//         canvas.addEventListener('touchstart', (e) => {
//             e.preventDefault();
//             if (e.touches.length === 1) {
//                 touchStart.x = e.touches[0].clientX;
//                 touchStart.y = e.touches[0].clientY;
//                 isTouching = true;
//                 console.log("Touch started for movement");
//             }
//         });

//         canvas.addEventListener('touchmove', (e) => {
//             e.preventDefault();
//             if (!isTouching || !avatarManager.localAvatar || !scene.activeCamera) return;

//             const deltaX = e.touches[0].clientX - touchStart.x;
//             const deltaY = e.touches[0].clientY - touchStart.y;

//             // Konversi touch delta ke movement
//             const camera = scene.activeCamera;
//             const forward = camera.getForwardRay().direction;
//             const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
//             const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

//             // Sensitivity
//             const sensitivity = 0.005;
//             const moveVector = moveDir.scale(-deltaY * sensitivity)
//                 .add(rightDir.scale(-deltaX * sensitivity));

//             // Apply movement
//             avatarManager.localAvatar.position.addInPlace(moveVector);

//             // Update rotation
//             if (moveVector.length() > 0.01) {
//                 const targetRot = Math.atan2(moveVector.x, moveVector.z);
//                 avatarManager.localAvatar.rotation.y = targetRot;
//             }

//             // Reset touch start untuk continuous movement
//             touchStart.x = e.touches[0].clientX;
//             touchStart.y = e.touches[0].clientY;

//             // Send to server
//             if (socket && socket.connected) {
//                 socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
//                     uid: avatarManager.localUserId,
//                     position: avatarManager.localAvatar.position,
//                     rotation: { y: avatarManager.localAvatar.rotation.y }
//                 });
//             }
//         });

//         canvas.addEventListener('touchend', () => {
//             isTouching = false;
//             console.log("Touch ended");
//         });

//         console.log("Touch movement fallback added");
//     }
//     // Panggil fungsi ini di setupMobileInput
//     addTouchMovementFallback(scene, avatarManager, canvas, socket);
// }
// main.ts - Ganti fungsi setupMobileInput dengan versi ini

function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
    console.log("📱 Setting up mobile controls with debug...");

    // Tampilkan UI mobile
    const mobileUI = document.getElementById("mobile-controls");
    if (mobileUI) mobileUI.style.display = "flex";

    // 🔥 Buat joystick dengan parameter yang benar
    // Parameter: (boolean leftJoystick, float leftJoystickSensibility?)
    const leftJoystick = new BABYLON.VirtualJoystick(true);
    leftJoystick.setJoystickSensibility(0.5);

    const rightJoystick = new BABYLON.VirtualJoystick(false);
    rightJoystick.setJoystickSensibility(0.5);

    // 🔥 Store ke window untuk debugging
    (window as any).leftJoystick = leftJoystick;
    (window as any).rightJoystick = rightJoystick;

    // 🔥 Tambahkan visual feedback untuk joystick
    const debugJoystick = document.createElement('div');
    debugJoystick.style.position = 'fixed';
    debugJoystick.style.bottom = '150px';
    debugJoystick.style.left = '20px';
    debugJoystick.style.width = '100px';
    debugJoystick.style.height = '100px';
    debugJoystick.style.border = '3px solid red';
    debugJoystick.style.borderRadius = '50px';
    debugJoystick.style.backgroundColor = 'rgba(255,0,0,0.2)';
    debugJoystick.style.zIndex = '9999';
    debugJoystick.style.pointerEvents = 'none';
    document.body.appendChild(debugJoystick);

    // Variables untuk movement
    let lastUpdateTime = performance.now();
    let lastEmitTime = 0;

    // 🔥 Movement loop dengan requestAnimationFrame
    function updateMovement() {
        if (!avatarManager.localAvatar) {
            requestAnimationFrame(updateMovement);
            return;
        }

        const now = performance.now();
        let deltaTime = (now - lastUpdateTime) / 1000;
        if (deltaTime > 0.033) deltaTime = 0.033; // Cap at 30fps
        lastUpdateTime = now;

        // 🔥 Ambil input joystick dengan threshold yang lebih sensitif
        let moveX = leftJoystick.deltaPosition.x;
        let moveZ = leftJoystick.deltaPosition.y;

        // Debug log setiap 1 detik
        if (Math.random() < 0.02) {
            console.log(`🎮 Joystick: x=${moveX.toFixed(2)}, z=${moveZ.toFixed(2)}, pressed=${leftJoystick.pressed}`);

            // Update visual feedback
            if (leftJoystick.pressed) {
                const xOffset = moveX * 40;
                const zOffset = moveZ * 40;
                debugJoystick.style.transform = `translate(${xOffset}px, ${zOffset}px)`;
                debugJoystick.style.backgroundColor = 'rgba(0,255,0,0.5)';
                debugJoystick.style.borderColor = 'lime';
            } else {
                debugJoystick.style.transform = 'translate(0px, 0px)';
                debugJoystick.style.backgroundColor = 'rgba(255,0,0,0.2)';
                debugJoystick.style.borderColor = 'red';
            }
        }

        // 🔥 Threshold lebih rendah untuk lebih sensitif
        const isMoving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;

        if (isMoving && scene.activeCamera) {
            const camera = scene.activeCamera;

            // Dapatkan arah kamera
            const forward = camera.getForwardRay().direction;
            const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
            const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

            // 🔥 Movement speed lebih cepat untuk tablet
            const speed = 4.0 * deltaTime; // 4 units per second
            const moveVector = moveDir.scale(moveZ).add(rightDir.scale(-moveX));

            // Apply movement
            avatarManager.localAvatar.position.addInPlace(moveVector.scale(speed));

            // 🔥 Update rotasi lebih responsif
            if (moveVector.length() > 0.01) {
                const targetRot = Math.atan2(moveVector.x, moveVector.z);
                // Gunakan lerp yang lebih cepat (0.5 instead of 0.3)
                avatarManager.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
                    avatarManager.localAvatar.rotation.y,
                    targetRot,
                    0.5
                );
            }

            // Kirim ke server dengan throttle
            if (socket && socket.connected && (now - lastEmitTime > 33)) { // 30fps
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
                lastEmitTime = now;
            }
        }

        requestAnimationFrame(updateMovement);
    }

    // 🔥 Rotation loop dengan sensitivitas lebih tinggi
    function updateRotation() {
        if (!avatarManager.localAvatar) {
            requestAnimationFrame(updateRotation);
            return;
        }

        const rotX = rightJoystick.deltaPosition.x;

        if (Math.abs(rotX) > 0.05) {
            // 🔥 Rotation speed lebih cepat (0.1 instead of 0.03)
            avatarManager.localAvatar.rotation.y += rotX * 0.1;
            console.log(`🔄 Rotation: ${rotX.toFixed(2)} -> y=${avatarManager.localAvatar.rotation.y.toFixed(2)}`);
        }

        requestAnimationFrame(updateRotation);
    }

    // Start loops
    updateMovement();
    updateRotation();

    // 🔥 Force canvas to accept touch events
    canvas.style.touchAction = 'none';
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log("✅ Touch detected on canvas, touches:", e.touches.length);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });

    console.log("✅ Mobile controls initialized with increased sensitivity");

    // 🔥 Test movement with button
    const testBtn = document.createElement('button');
    testBtn.textContent = 'Test Move +1';
    testBtn.style.position = 'fixed';
    testBtn.style.bottom = '100px';
    testBtn.style.right = '10px';
    testBtn.style.zIndex = '9999';
    testBtn.style.padding = '10px';
    testBtn.style.backgroundColor = '#4ade80';
    testBtn.style.border = 'none';
    testBtn.style.borderRadius = '5px';
    testBtn.onclick = () => {
        if (avatarManager.localAvatar) {
            avatarManager.localAvatar.position.x += 1;
            console.log("Test movement: position now", avatarManager.localAvatar.position);
        }
    };
    document.body.appendChild(testBtn);
}

// function setupMobileCamera(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
//     console.log("📱 Setting up mobile camera controls...");

//     const camera = scene.activeCamera as BABYLON.ArcRotateCamera;
//     if (!camera) {
//         console.warn("Camera not found!");
//         return;
//     }

//     // 🔥 Konfigurasi camera untuk mobile
//     camera.pinchPrecision = 200; // Sensitivity for pinch zoom
//     camera.panningSensibility = 1000;
//     camera.wheelPrecision = 50;

//     // 🔥 Enable touch controls
//     camera.attachControl(canvas, true);

//     // 🔥 Set camera limits untuk menghindari view yang terlalu ekstrim
//     camera.lowerRadiusLimit = 5;
//     camera.upperRadiusLimit = 20;
//     camera.lowerAlphaLimit = -Math.PI / 2;
//     camera.upperAlphaLimit = Math.PI / 2;

//     // 🔥 Tambahkan debug indicator
//     const cameraDebug = document.createElement('div');
//     cameraDebug.style.position = 'fixed';
//     cameraDebug.style.bottom = '10px';
//     cameraDebug.style.right = '10px';
//     cameraDebug.style.backgroundColor = 'rgba(0,0,0,0.5)';
//     cameraDebug.style.color = 'white';
//     cameraDebug.style.padding = '5px';
//     cameraDebug.style.fontSize = '10px';
//     cameraDebug.style.zIndex = '9999';
//     cameraDebug.style.borderRadius = '3px';
//     document.body.appendChild(cameraDebug);

//     // Update debug info
//     setInterval(() => {
//         cameraDebug.innerHTML = `Camera: α=${camera.alpha.toFixed(1)} β=${camera.beta.toFixed(1)}`;
//     }, 500);

//     console.log("✅ Mobile camera controls enabled");
// }

// main.ts - Tambahkan fungsi ini

function setupMobileCamera(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
    console.log("📱 Setting up mobile camera controls...");

    const camera = scene.activeCamera as BABYLON.ArcRotateCamera;
    if (!camera) {
        console.warn("⚠️ Camera not found, creating new one...");
        // Create new camera if not exists
        const newCamera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 3,
            10,
            BABYLON.Vector3.Zero(),
            scene
        );
        newCamera.attachControl(canvas, true);
        scene.activeCamera = newCamera;
    }

    // 🔥 Konfigurasi camera untuk mobile
    camera.pinchPrecision = 200;
    camera.panningSensibility = 500;
    camera.wheelPrecision = 50;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 15;
    camera.lowerAlphaLimit = -Math.PI;
    camera.upperAlphaLimit = Math.PI;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2;

    // 🔥 Enable touch controls
    camera.attachControl(canvas, true);

    // 🔥 Set camera target ke avatar lokal setelah siap
    const checkAvatar = setInterval(() => {
        const avatarManager = (window as any).avatarManager;
        if (avatarManager && avatarManager.localAvatar) {
            camera.target = avatarManager.localAvatar.position;
            clearInterval(checkAvatar);
            console.log("✅ Camera target set to local avatar");
        }
    }, 100);

    console.log("✅ Mobile camera configured");
}
window.addEventListener("DOMContentLoaded", bootstrap);