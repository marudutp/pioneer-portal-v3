import { loginWithGoogle } from "./auth/AuthManager";
import { createPioneerScene } from "./scene";
import { AvatarManager } from "./managers/AvatarManager";
import { VoiceManager } from "./managers/VoiceManager";
import { NetworkManager } from "./network/NetworkManager";
import * as BABYLON from "@babylonjs/core";
import { WhiteboardManager } from "./managers/WhiteboardManager";
import { WhiteboardUI } from "./managers/WhiteboardUI";
import { User } from "firebase/auth"; // Atau library auth yang kamu pakai
import { TEACHER_EMAILS } from "@shared/admin.config";
import { ROLES } from "@shared/constants";
import { VirtualJoystick } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

// =========================
// 🔥 GLOBAL OPTIMIZATION SETUP (WAJIB DI ATAS)
// =========================
BABYLON.DracoCompression.Configuration = {
    decoder: {
        wasmUrl: "https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js",
        wasmBinaryUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.wasm",
        fallbackUrl: "https://cdn.babylonjs.com/draco_decoder_gltf.js"
    }
};

// 🔥 KTX2 FIX (INI YANG SERING MISS)
(BABYLON.KhronosTextureContainer2 as any).URLConfig = {
    jsDecoderModule: "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
    wasmUASTCToASTC: "https://cdn.babylonjs.com/wasm/uastc_astc.wasm",
    wasmUASTCToBC7: "https://cdn.babylonjs.com/wasm/uastc_bc7.wasm",
    wasmUASTCToRGBA_UNORM: "https://cdn.babylonjs.com/wasm/uastc_rgba8_unorm.wasm",
    wasmUASTCToRGBA_SRGB: "https://cdn.babylonjs.com/wasm/uastc_rgba8_srgb.wasm",
    wasmMSCTranscoder: "https://cdn.babylonjs.com/wasm/msc_basis_transcoder.wasm",
    jsMSCTranscoder: "https://cdn.babylonjs.com/babylon.msc_basis_transcoder.js"
};
// Buat "KTP" baru untuk User kita
interface AppUser extends User {
    role: string;
}
// const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3000`;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

console.log("🚀 Menghubungkan ke Server di:", SERVER_URL);

let isStarted = false;



async function bootstrap() {
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.opacity = "0";
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);

    if (isStarted) return;

    console.log("🚀 Memulai Pioneer Portal V3...");

    // 1. Fase Autentikasi
    const googleUser = await loginWithGoogle();
    if (!googleUser) return;

    const user = googleUser as AppUser;

    // LOGIKA PENENTUAN ROLE (Sudah Benar)
    user.role = TEACHER_EMAILS.includes(user.email || "")
        ? ROLES.TEACHER
        : ROLES.STUDENT;

    console.log(`Selamat Datang, ${user.displayName}! Anda masuk sebagai: ${user.role}`);



    // 2. Inisialisasi Panggung
    const { scene, engine, canvas } = await createPioneerScene("renderCanvas");

    // 3. Inisialisasi Para Manajer
    const avatarManager = new AvatarManager(scene);
    const voiceManager = new VoiceManager(scene);
    const networkManager = new NetworkManager(SERVER_URL, avatarManager);
    const wbManager = new WhiteboardManager(scene, networkManager, user.role);

    // Hubungkan Manager ke Network
    (networkManager as any).voiceManager = voiceManager;
    networkManager.setWhiteboardManager(wbManager); // <--- HARUS DI SINI

    // 🔥 PENTING: Set Local User ID DULU sebelum join/create avatar
    avatarManager.localUserId = user.uid;
    console.log("🆔 Local ID Set:", user.uid);

    // 4. Aktifkan Mikrofon
    await networkManager.startVoiceChat();

    // 5. Join ke Jaringan (HANYA SATU KALI SAJA, PAKAI USER.ROLE)
    networkManager.joinClass(user.uid, user.displayName || "Anonim", user.role);

    // 6. Buat Avatar Lokal
    // Karena localUserId sudah di-set di atas, fungsi ini akan otomatis 
    // mengisi avatarManager.localAvatar setelah GLB selesai load.
    avatarManager.createAvatar({
        uid: user.uid,
        displayName: user.displayName || "Saya",
        role: user.role
    });

    // ❌ HAPUS LOGIKA setInterval YANG LAMA (checkAvatarReady)

    // 7. Logika Pergerakan (PC/Keyboard)
    setupInput(
        scene,
        avatarManager,
        scene.activeCamera as BABYLON.Camera,
        networkManager.socket
    );

    // --- 7.5 LOGIKA MOBILE (JOYSTICK) ---
    // Deteksi lebih akurat untuk HP & Tablet (termasuk iPad Pro)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);

    // chatgpt edit 15032026
    if (isMobile) {

        const mobileUI = document.getElementById("mobile-controls");
        if (mobileUI) mobileUI.style.display = "flex";
        BABYLON.VirtualJoystick.Canvas = canvas;
        const leftJoystick = new BABYLON.VirtualJoystick(true);
        const rightJoystick = new BABYLON.VirtualJoystick(false);

        leftJoystick.setJoystickSensibility(0.15);
        rightJoystick.setJoystickSensibility(0.15);

        scene.onBeforeRenderObservable.add(() => {

            if (leftJoystick.pressed && avatarManager.localAvatar) {
                // console.log("JOYSTICK ACTIVE", leftJoystick.deltaPosition);
                // Kita gunakan sensitivitas joystick sebagai input delta (0 ke 1)
                const moveX = leftJoystick.deltaPosition.x;
                const moveY = leftJoystick.deltaPosition.y; 

                avatarManager.handleAvatarMovement(
                    moveX,
                    moveY,
                    scene.activeCamera,
                    networkManager.socket
                );
            }

            if (rightJoystick.pressed && avatarManager.localAvatar) {
                // Untuk memutar pandangan kamera/avatar
                avatarManager.localAvatar.rotation.y +=
                    rightJoystick.deltaPosition.x * 0.05;
            }

        });
    }

    // 8. Munculkan UI Whiteboard
    new WhiteboardUI(wbManager, user.role);

    // 9. Tanda Scene Siap
    networkManager.setReady();

    // 10. Jalankan Render Loop
    isStarted = true;
    engine.runRenderLoop(() => {
        scene.render();
    });

    console.log("Pioneer Portal V3 Berhasil Mengudara! Bummm!");

    // Audio Unlocker
    window.addEventListener("click", () => {
        if (BABYLON.Engine.audioEngine) {
            BABYLON.Engine.audioEngine.unlock();
            console.log("🔊 Audio Unlocked!");
        }
    }, { once: true });

    window.addEventListener("resize", () => {
        engine.resize();
    });
}
/**
 * Kontrol Gerakan (WASD)
 */
function setupInput(
    scene: BABYLON.Scene,
    avatarManager: AvatarManager, // ✅ Gunakan tipe asli
    camera: BABYLON.Camera,
    socket: any
) {
    console.log("✅ setupInput aktif");
    const inputMap: any = {};

    scene.actionManager = new BABYLON.ActionManager(scene);

    scene.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
            BABYLON.ActionManager.OnKeyDownTrigger,
            evt => inputMap[evt.sourceEvent.key.toLowerCase()] = true
        )
    );

    scene.actionManager.registerAction(
        new BABYLON.ExecuteCodeAction(
            BABYLON.ActionManager.OnKeyUpTrigger,
            evt => inputMap[evt.sourceEvent.key.toLowerCase()] = false
        )
    );

    scene.onBeforeRenderObservable.add(() => {

        if (!avatarManager.localAvatar) return;

        let deltaX = 0;
        let deltaZ = 0;

        if (inputMap["w"]) deltaZ += 1;
        if (inputMap["s"]) deltaZ -= 1;
        if (inputMap["a"]) deltaX -= 1;
        if (inputMap["d"]) deltaX += 1;

        avatarManager.handleAvatarMovement(
            deltaX,
            deltaZ,
            camera,
            socket
        );
    });
}
// Jalankan aplikasi setelah window load
window.addEventListener("DOMContentLoaded", bootstrap);