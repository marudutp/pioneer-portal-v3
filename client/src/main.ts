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

// ==========================================
// 🔥 GLOBAL OPTIMIZATION & DECODER SETUP
// ==========================================
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

    // 1. UI Overlay Handling
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.opacity = "0";
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);

    console.log("🚀 Memulai Pioneer Portal V3 - Final Sync...");

    // 2. Fase Autentikasi
    const googleUser = await loginWithGoogle();
    if (!googleUser) return;

    const user = googleUser as AppUser;
    user.role = TEACHER_EMAILS.includes(user.email || "") ? ROLES.TEACHER : ROLES.STUDENT;

    // 3. Inisialisasi Engine & Scene
    const { scene, engine, canvas } = await createPioneerScene("renderCanvas");

    // 4. Inisialisasi Manager
    const avatarManager = new AvatarManager(scene);
    const voiceManager = new VoiceManager(scene);
    const networkManager = new NetworkManager(SERVER_URL, avatarManager);
    const wbManager = new WhiteboardManager(scene, networkManager, user.role);

    (networkManager as any).voiceManager = voiceManager;
    networkManager.setWhiteboardManager(wbManager);

    // 🔥 TAHAP 1: Kunci ID Lokal agar manager tahu siapa "SAYA"
    avatarManager.setLocalUserId(user.uid);

    // 5. Setup Network & Sync Player Lain
    await networkManager.startVoiceChat();

    // 🔥 TAHAP 2: Sinkronisasi Posisi Terakhir dari Server
    // Saat kita baru masuk, server kasih daftar player yang sudah lari duluan
    networkManager.socket.on("current_players", (players: any[]) => {
        players.forEach(p => {
            // Kita render mereka di koordinat x, z terakhir yang dicatat server
            // Proteksi: Jangan buat avatar lokal lagi di sini
            if (p.uid !== user.uid) {
                avatarManager.createAvatar(p);
            }
        });
    });

    // Menerima update posisi real-time dari player lain
    networkManager.socket.on("player_moved", (data: any) => {
        avatarManager.updateAvatar(data.uid, data);
    });

    // B. Terima info saat ada orang baru join (Xabi masuk, Marudut harus render Xabi)
    networkManager.socket.on("new_player", (userData: any) => {
        avatarManager.createAvatar(userData);
    });

    // // Join ke jaringan
    // networkManager.joinClass(user.uid, user.displayName || "User", user.role);
    // 4. Player keluar
    networkManager.socket.on("player_disconnected", (uid: string) => {
        avatarManager.removeAvatar(uid);
    });

    // 5. Join Class dan kirim data diri ke server
    networkManager.joinClass(user.uid, user.displayName || "User", user.role);

    // 6. Buat Avatar Lokal SAYA (Hanya 1x panggil di sini)
    // avatarManager.createAvatar({ uid: user.uid, displayName: user.displayName, role: role });


    // 6. Buat Avatar Lokal (Hanya 1x panggil di sini)
    avatarManager.createAvatar({
        uid: user.uid,
        displayName: user.displayName || "Saya",
        role: user.role
    });

    // 7. Input Handling (PC & Mobile)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);

    if (isMobile) {
        setupMobileInput(scene, avatarManager, canvas, networkManager.socket);
    } else {
        setupKeyboardInput(scene, avatarManager, scene.activeCamera as BABYLON.Camera, networkManager.socket);
    }

    // 8. Whiteboard & Ready
    new WhiteboardUI(wbManager, user.role);
    networkManager.setReady();

    // 9. Render Loop
    isStarted = true;
    engine.runRenderLoop(() => {
        scene.render();
    });

    // Audio & Window Handling
    window.addEventListener("click", () => {
        if (BABYLON.Engine.audioEngine) BABYLON.Engine.audioEngine.unlock();
    }, { once: true });

    window.addEventListener("resize", () => { engine.resize(); });
}

/**
 * ⌨️ KONTROL KEYBOARD (WASD)
 */
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

        let deltaX = 0;
        let deltaZ = 0;

        if (inputMap["w"]) deltaZ += 1;
        if (inputMap["s"]) deltaZ -= 1;
        if (inputMap["a"]) deltaX -= 1;
        if (inputMap["d"]) deltaX += 1;

        avatarManager.handleAvatarMovement(deltaX, deltaZ, camera, socket);
    });
}

/**
 * 📱 KONTROL MOBILE (JOYSTICK)
 */
function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: HTMLCanvasElement, socket: any) {
    const mobileUI = document.getElementById("mobile-controls");
    if (mobileUI) mobileUI.style.display = "flex";

    BABYLON.VirtualJoystick.Canvas = canvas;
    const leftJoystick = new BABYLON.VirtualJoystick(true);
    const rightJoystick = new BABYLON.VirtualJoystick(false);

    leftJoystick.setJoystickSensibility(0.15);
    rightJoystick.setJoystickSensibility(0.15);

    scene.onBeforeRenderObservable.add(() => {
        if (!avatarManager.localAvatar) return;

        if (leftJoystick.pressed) {
            avatarManager.handleAvatarMovement(
                leftJoystick.deltaPosition.x,
                leftJoystick.deltaPosition.y,
                scene.activeCamera,
                socket
            );
        }

        if (rightJoystick.pressed) {
            avatarManager.localAvatar.rotation.y += rightJoystick.deltaPosition.x * 0.05;
        }
    });
}

window.addEventListener("DOMContentLoaded", bootstrap);