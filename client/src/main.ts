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
//     console.log("📱 Setting up mobile controls with debug...");

//     // Tampilkan UI mobile
//     const mobileUI = document.getElementById("mobile-controls");
//     if (mobileUI) mobileUI.style.display = "flex";

//     // 🔥 Buat joystick dengan parameter yang benar
//     // Parameter: (boolean leftJoystick, float leftJoystickSensibility?)
//     const leftJoystick = new BABYLON.VirtualJoystick(true);
//     leftJoystick.setJoystickSensibility(0.5);

//     const rightJoystick = new BABYLON.VirtualJoystick(false);
//     rightJoystick.setJoystickSensibility(0.5);

//     // 🔥 Store ke window untuk debugging
//     (window as any).leftJoystick = leftJoystick;
//     (window as any).rightJoystick = rightJoystick;

//     // 🔥 Tambahkan visual feedback untuk joystick
//     const debugJoystick = document.createElement('div');
//     debugJoystick.style.position = 'fixed';
//     debugJoystick.style.bottom = '150px';
//     debugJoystick.style.left = '20px';
//     debugJoystick.style.width = '100px';
//     debugJoystick.style.height = '100px';
//     debugJoystick.style.border = '3px solid red';
//     debugJoystick.style.borderRadius = '50px';
//     debugJoystick.style.backgroundColor = 'rgba(255,0,0,0.2)';
//     debugJoystick.style.zIndex = '9999';
//     debugJoystick.style.pointerEvents = 'none';
//     document.body.appendChild(debugJoystick);

//     // Variables untuk movement
//     let lastUpdateTime = performance.now();
//     let lastEmitTime = 0;

//     // 🔥 Movement loop dengan requestAnimationFrame
//     function updateMovement() {
//         if (!avatarManager.localAvatar) {
//             requestAnimationFrame(updateMovement);
//             return;
//         }

//         const now = performance.now();
//         let deltaTime = (now - lastUpdateTime) / 1000;
//         if (deltaTime > 0.033) deltaTime = 0.033; // Cap at 30fps
//         lastUpdateTime = now;

//         // 🔥 Ambil input joystick dengan threshold yang lebih sensitif
//         let moveX = leftJoystick.deltaPosition.x;
//         let moveZ = leftJoystick.deltaPosition.y;

//         // Debug log setiap 1 detik
//         if (Math.random() < 0.02) {
//             console.log(`🎮 Joystick: x=${moveX.toFixed(2)}, z=${moveZ.toFixed(2)}, pressed=${leftJoystick.pressed}`);

//             // Update visual feedback
//             if (leftJoystick.pressed) {
//                 const xOffset = moveX * 40;
//                 const zOffset = moveZ * 40;
//                 debugJoystick.style.transform = `translate(${xOffset}px, ${zOffset}px)`;
//                 debugJoystick.style.backgroundColor = 'rgba(0,255,0,0.5)';
//                 debugJoystick.style.borderColor = 'lime';
//             } else {
//                 debugJoystick.style.transform = 'translate(0px, 0px)';
//                 debugJoystick.style.backgroundColor = 'rgba(255,0,0,0.2)';
//                 debugJoystick.style.borderColor = 'red';
//             }
//         }

//         // 🔥 Threshold lebih rendah untuk lebih sensitif
//         const isMoving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;

//         if (isMoving && scene.activeCamera) {
//             const camera = scene.activeCamera;

//             // Dapatkan arah kamera
//             const forward = camera.getForwardRay().direction;
//             const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
//             const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

//             // 🔥 Movement speed lebih cepat untuk tablet
//             const speed = 4.0 * deltaTime; // 4 units per second
//             const moveVector = moveDir.scale(moveZ).add(rightDir.scale(-moveX));

//             // Apply movement
//             avatarManager.localAvatar.position.addInPlace(moveVector.scale(speed));

//             // 🔥 Update rotasi lebih responsif
//             if (moveVector.length() > 0.01) {
//                 const targetRot = Math.atan2(moveVector.x, moveVector.z);
//                 // Gunakan lerp yang lebih cepat (0.5 instead of 0.3)
//                 avatarManager.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
//                     avatarManager.localAvatar.rotation.y,
//                     targetRot,
//                     0.5
//                 );
//             }

//             // Kirim ke server dengan throttle
//             if (socket && socket.connected && (now - lastEmitTime > 33)) { // 30fps
//                 socket.emit(NETWORK_EVENTS.AVATAR_UPDATE, {
//                     uid: avatarManager.localUserId,
//                     position: {
//                         x: avatarManager.localAvatar.position.x,
//                         y: avatarManager.localAvatar.position.y,
//                         z: avatarManager.localAvatar.position.z
//                     },
//                     rotation: {
//                         y: avatarManager.localAvatar.rotation.y
//                     }
//                 });
//                 lastEmitTime = now;
//             }
//         }

//         requestAnimationFrame(updateMovement);
//     }

//     // 🔥 Rotation loop dengan sensitivitas lebih tinggi
//     function updateRotation() {
//         if (!avatarManager.localAvatar) {
//             requestAnimationFrame(updateRotation);
//             return;
//         }

//         const rotX = rightJoystick.deltaPosition.x;

//         if (Math.abs(rotX) > 0.05) {
//             // 🔥 Rotation speed lebih cepat (0.1 instead of 0.03)
//             avatarManager.localAvatar.rotation.y += rotX * 0.1;
//             console.log(`🔄 Rotation: ${rotX.toFixed(2)} -> y=${avatarManager.localAvatar.rotation.y.toFixed(2)}`);
//         }

//         requestAnimationFrame(updateRotation);
//     }

//     // Start loops
//     updateMovement();
//     updateRotation();

//     // 🔥 Force canvas to accept touch events
//     canvas.style.touchAction = 'none';
//     canvas.addEventListener('touchstart', (e) => {
//         e.preventDefault();
//         console.log("✅ Touch detected on canvas, touches:", e.touches.length);
//     }, { passive: false });

//     canvas.addEventListener('touchmove', (e) => {
//         e.preventDefault();
//     }, { passive: false });

//     console.log("✅ Mobile controls initialized with increased sensitivity");

//     // 🔥 Test movement with button
//     const testBtn = document.createElement('button');
//     testBtn.textContent = 'Test Move +1';
//     testBtn.style.position = 'fixed';
//     testBtn.style.bottom = '100px';
//     testBtn.style.right = '10px';
//     testBtn.style.zIndex = '9999';
//     testBtn.style.padding = '10px';
//     testBtn.style.backgroundColor = '#4ade80';
//     testBtn.style.border = 'none';
//     testBtn.style.borderRadius = '5px';
//     testBtn.onclick = () => {
//         if (avatarManager.localAvatar) {
//             avatarManager.localAvatar.position.x += 1;
//             console.log("Test movement: position now", avatarManager.localAvatar.position);
//         }
//     };
//     document.body.appendChild(testBtn);
// }
// main.ts - Ganti fungsi updateMovement di dalam setupMobileInput

function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
    console.log("📱 Setting up mobile controls with improved stopping...");

    const mobileUI = document.getElementById("mobile-controls");
    if (mobileUI) mobileUI.style.display = "flex";

    const leftJoystick = new BABYLON.VirtualJoystick(true);
    leftJoystick.setJoystickSensibility(0.5);

    const rightJoystick = new BABYLON.VirtualJoystick(false);
    rightJoystick.setJoystickSensibility(0.5);

    (window as any).leftJoystick = leftJoystick;
    (window as any).rightJoystick = rightJoystick;

    // Variables untuk movement
    let lastUpdateTime = performance.now();
    let lastEmitTime = 0;
    let wasMoving = false;

    // 🔥 DEADZONE: Nilai di bawah ini dianggap 0 (berhenti)
    const DEADZONE = 0.1;

    function updateMovement() {
        if (!avatarManager.localAvatar) {
            requestAnimationFrame(updateMovement);
            return;
        }

        const now = performance.now();
        let deltaTime = (now - lastUpdateTime) / 1000;
        if (deltaTime > 0.033) deltaTime = 0.033;
        lastUpdateTime = now;

        // 🔥 Ambil input joystick dan terapkan deadzone
        let moveX = leftJoystick.deltaPosition.x;
        let moveZ = leftJoystick.deltaPosition.y;

        // 🔥 TERAPKAN DEADZONE - Nilai kecil dianggap 0
        if (Math.abs(moveX) < DEADZONE) moveX = 0;
        if (Math.abs(moveZ) < DEADZONE) moveZ = 0;

        const isMoving = moveX !== 0 || moveZ !== 0;

        // 🔥 DETEKSI PERUBAHAN STATUS (bergerak -> berhenti)
        if (wasMoving && !isMoving) {
            console.log("🛑 Avatar stopped");
            // Kirim update posisi terakhir saat berhenti
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

        if (isMoving && scene.activeCamera) {
            const camera = scene.activeCamera;

            const forward = camera.getForwardRay().direction;
            const moveDir = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
            const rightDir = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), moveDir).normalize();

            // 🔥 Speed normal (tidak ada momentum, langsung berhenti)
            const speed = 3.5 * deltaTime;
            const moveVector = moveDir.scale(moveZ).add(rightDir.scale(-moveX));

            avatarManager.localAvatar.position.addInPlace(moveVector.scale(speed));

            // Update rotasi
            if (moveVector.length() > 0.01) {
                const targetRot = Math.atan2(moveVector.x, moveVector.z);
                avatarManager.localAvatar.rotation.y = BABYLON.Scalar.LerpAngle(
                    avatarManager.localAvatar.rotation.y,
                    targetRot,
                    0.4
                );
            }

            // Kirim ke server dengan throttle
            if (socket && socket.connected && (now - lastEmitTime > 33)) {
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

        wasMoving = isMoving;
        requestAnimationFrame(updateMovement);
    }

    // Rotation loop
    function updateRotation() {
        if (!avatarManager.localAvatar) {
            requestAnimationFrame(updateRotation);
            return;
        }

        let rotX = rightJoystick.deltaPosition.x;

        // 🔥 Terapkan deadzone juga untuk rotasi
        if (Math.abs(rotX) < DEADZONE) rotX = 0;

        if (rotX !== 0) {
            // 🔥 Rotation speed yang responsif
            avatarManager.localAvatar.rotation.y += rotX * 0.08;
        }

        requestAnimationFrame(updateRotation);
    }

    updateMovement();
    updateRotation();

    // 🔥 Tambahkan indikator visual deadzone
    const deadzoneIndicator = document.createElement('div');
    deadzoneIndicator.style.position = 'fixed';
    deadzoneIndicator.style.bottom = '150px';
    deadzoneIndicator.style.left = '20px';
    deadzoneIndicator.style.width = '100px';
    deadzoneIndicator.style.height = '100px';
    deadzoneIndicator.style.border = '3px solid rgba(255,255,0,0.5)';
    deadzoneIndicator.style.borderRadius = '50px';
    deadzoneIndicator.style.backgroundColor = 'rgba(0,0,0,0.3)';
    deadzoneIndicator.style.zIndex = '9999';
    deadzoneIndicator.style.pointerEvents = 'none';
    document.body.appendChild(deadzoneIndicator);

    // Update visual indicator
    setInterval(() => {
        if (leftJoystick) {
            const x = leftJoystick.deltaPosition.x;
            const z = leftJoystick.deltaPosition.y;
            const distance = Math.sqrt(x * x + z * z);

            if (distance > DEADZONE) {
                const xOffset = x * 40;
                const zOffset = z * 40;
                deadzoneIndicator.style.transform = `translate(${xOffset}px, ${zOffset}px)`;
                deadzoneIndicator.style.backgroundColor = 'rgba(0,255,0,0.5)';
                deadzoneIndicator.style.borderColor = 'lime';
            } else {
                deadzoneIndicator.style.transform = 'translate(0px, 0px)';
                deadzoneIndicator.style.backgroundColor = 'rgba(0,0,0,0.3)';
                deadzoneIndicator.style.borderColor = 'rgba(255,255,0,0.5)';
            }
        }
    }, 50);

    canvas.style.touchAction = 'none';
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    console.log("✅ Mobile controls with deadzone and stop detection");
}



// function setupMobileCamera(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
//     console.log("📱 Setting up mobile camera controls...");

//     const camera = scene.activeCamera as BABYLON.ArcRotateCamera;
//     if (!camera) {
//         console.warn("⚠️ Camera not found, creating new one...");
//         // Create new camera if not exists
//         const newCamera = new BABYLON.ArcRotateCamera(
//             "camera",
//             -Math.PI / 2,
//             Math.PI / 3,
//             10,
//             BABYLON.Vector3.Zero(),
//             scene
//         );
//         newCamera.attachControl(canvas, true);
//         scene.activeCamera = newCamera;
//     }

//     // 🔥 Konfigurasi camera untuk mobile
//     camera.pinchPrecision = 200;
//     camera.panningSensibility = 500;
//     camera.wheelPrecision = 50;
//     camera.lowerRadiusLimit = 3;
//     camera.upperRadiusLimit = 15;
//     camera.lowerAlphaLimit = -Math.PI;
//     camera.upperAlphaLimit = Math.PI;
//     camera.lowerBetaLimit = 0.1;
//     camera.upperBetaLimit = Math.PI / 2;

//     // 🔥 Enable touch controls
//     camera.attachControl(canvas, true);

//     // 🔥 Set camera target ke avatar lokal setelah siap
//     const checkAvatar = setInterval(() => {
//         const avatarManager = (window as any).avatarManager;
//         if (avatarManager && avatarManager.localAvatar) {
//             camera.target = avatarManager.localAvatar.position;
//             clearInterval(checkAvatar);
//             console.log("✅ Camera target set to local avatar");
//         }
//     }, 100);

//     console.log("✅ Mobile camera configured");
// }

// main.ts - Ganti fungsi setupMobileCamera

function setupMobileCamera(scene: BABYLON.Scene, canvas: HTMLCanvasElement) {
    addCameraTouchFeedback(canvas);
    console.log("📱 Setting up 360-degree mobile camera...");

    let camera = scene.activeCamera as BABYLON.ArcRotateCamera;

    // 🔥 Jika camera tidak ada atau bukan ArcRotateCamera, buat baru
    if (!camera || !(camera instanceof BABYLON.ArcRotateCamera)) {
        console.log("Creating new ArcRotateCamera for 360 rotation...");
        camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 2,  // alpha (horizontal rotation)
            Math.PI / 3,    // beta (vertical rotation)
            12,             // radius (distance)
            BABYLON.Vector3.Zero(),
            scene
        );
        scene.activeCamera = camera;
    }

    // 🔥 KONFIGURASI UNTUK 360 DERAJAT PENUH
    // Hapus semua limit agar bisa 360 derajat
    camera.lowerAlphaLimit = null;    // Tidak ada batas kiri
    camera.upperAlphaLimit = null;    // Tidak ada batas kanan (360 derajat)
    camera.lowerBetaLimit = 0.1;      // Batas bawah (jangan sampai melihat ke bawah tanah)
    camera.upperBetaLimit = Math.PI / 1.8; // Batas atas (sekitar 80 derajat)
    camera.lowerRadiusLimit = 3;       // Jarak minimal zoom
    camera.upperRadiusLimit = 20;      // Jarak maksimal zoom

    // 🔥 Sensitivitas untuk touch
    camera.pinchPrecision = 200;       // Zoom sensitivity
    camera.panningSensibility = 500;   // Pan sensitivity
    camera.wheelPrecision = 50;        // Wheel sensitivity

    // 🔥 Kecepatan rotasi untuk touch
    camera.angularSensibilityX = 2000;  // Horizontal rotation speed
    camera.angularSensibilityY = 2000;  // Vertical rotation speed

    // 🔥 ATTACH CONTROL KE CANVAS (ini yang paling penting!)
    // Parameter kedua: true = prevent default touch events
    camera.attachControl(canvas, true);

    // 🔥 Set target ke avatar lokal (akan diupdate nanti)
    const updateCameraTarget = () => {
        const avatarManager = (window as any).avatarManager;
        if (avatarManager && avatarManager.localAvatar) {
            camera.target = avatarManager.localAvatar.position;
            console.log("✅ Camera target set to avatar at:", camera.target);
            return true;
        }
        return false;
    };

    // Coba update target segera
    if (!updateCameraTarget()) {
        // Jika avatar belum siap, tunggu
        const interval = setInterval(() => {
            if (updateCameraTarget()) {
                clearInterval(interval);
            }
        }, 100);

        // Timeout setelah 5 detik
        setTimeout(() => clearInterval(interval), 5000);
    }

    // 🔥 Update camera target setiap frame agar mengikuti avatar
    scene.onBeforeRenderObservable.add(() => {
        const avatarManager = (window as any).avatarManager;
        if (avatarManager && avatarManager.localAvatar && camera.target) {
            // Update target ke posisi avatar
            camera.target = avatarManager.localAvatar.position;
        }
    });

    // 🔥 Tambahkan debug info untuk camera
    const cameraDebug = document.createElement('div');
    cameraDebug.style.position = 'fixed';
    cameraDebug.style.bottom = '10px';
    cameraDebug.style.right = '10px';
    cameraDebug.style.backgroundColor = 'rgba(0,0,0,0.7)';
    cameraDebug.style.color = '#0ff';
    cameraDebug.style.padding = '5px';
    cameraDebug.style.fontSize = '10px';
    cameraDebug.style.fontFamily = 'monospace';
    cameraDebug.style.zIndex = '9999';
    cameraDebug.style.borderRadius = '3px';
    document.body.appendChild(cameraDebug);

    // Update debug info setiap detik
    setInterval(() => {
        cameraDebug.innerHTML = `Camera: α=${camera.alpha.toFixed(1)}° β=${camera.beta.toFixed(1)}° r=${camera.radius.toFixed(1)}`;
    }, 1000);

    console.log("✅ 360-degree mobile camera ready!");
    console.log("Camera controls: 1 finger drag = rotate, pinch = zoom");
}
function addCameraTouchFeedback(canvas: HTMLCanvasElement) {
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouching = false;

    const feedback = document.createElement('div');
    feedback.style.position = 'fixed';
    feedback.style.top = '50%';
    feedback.style.left = '50%';
    feedback.style.width = '50px';
    feedback.style.height = '50px';
    feedback.style.borderRadius = '25px';
    feedback.style.backgroundColor = 'rgba(255,255,255,0.5)';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.display = 'none';
    feedback.style.zIndex = '9999';
    feedback.style.pointerEvents = 'none';
    document.body.appendChild(feedback);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isTouching = true;
            feedback.style.display = 'block';
            feedback.style.backgroundColor = 'rgba(0,255,255,0.5)';
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (isTouching && e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;
            feedback.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        }
    });

    canvas.addEventListener('touchend', () => {
        isTouching = false;
        feedback.style.display = 'none';
        feedback.style.transform = 'translate(-50%, -50%)';
    });

    console.log("✅ Camera touch feedback added");
}
window.addEventListener("DOMContentLoaded", bootstrap);