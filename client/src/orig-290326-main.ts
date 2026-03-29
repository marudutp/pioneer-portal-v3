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
    const mobileUI = document.getElementById("mobile-controls");
    if (mobileUI) mobileUI.style.display = "flex";
    BABYLON.VirtualJoystick.Canvas = canvas;
    const leftJoy = new BABYLON.VirtualJoystick(true);
    const rightJoy = new BABYLON.VirtualJoystick(false);
    scene.onBeforeRenderObservable.add(() => {
        if (!avatarManager.localAvatar) return;
        if (leftJoy.pressed) avatarManager.handleAvatarMovement(leftJoy.deltaPosition.x, leftJoy.deltaPosition.y, scene.activeCamera, socket);
        if (rightJoy.pressed) avatarManager.localAvatar.rotation.y += rightJoy.deltaPosition.x * 0.05;
    });
}

window.addEventListener("DOMContentLoaded", bootstrap);