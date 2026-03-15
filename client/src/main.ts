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

// Buat "KTP" baru untuk User kita
interface AppUser extends User {
    role: string;
}
// const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3000`;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

console.log("🚀 Menghubungkan ke Server di:", SERVER_URL);

let isStarted = false;


// Taruh di bawah baris import, di luar fungsi bootstrap atau setupInput
const inputMap: { [key: string]: boolean } = {};
async function bootstrap() {
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.opacity = "0";
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);

    if (isStarted) return;

    console.log("🚀 Memulai Pioneer Portal V3... Siapkan mental, Ferguso!");

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

    // 4. Aktifkan Mikrofon
    await networkManager.startVoiceChat();

    // 5. Join ke Jaringan (HANYA SATU KALI SAJA, PAKAI USER.ROLE)
    networkManager.joinClass(user.uid, user.displayName || "Anonim", user.role);

    // 6. Buat Avatar Lokal
    const myAvatar = avatarManager.createAvatar({
        uid: user.uid,
        displayName: user.displayName || "Saya",
        role: user.role // Pakai role asli dari email
    });
    avatarManager.localAvatar = myAvatar;

    // 7. Logika Pergerakan (PC/Keyboard)
    // setupInput(scene, myAvatar, (pos, rot) => {
    //     networkManager.sendMovement(pos, rot);
    // });

    // INI YANG BARU (Gunakan ini)
    setupInput(scene);

    // --- 7.5 LOGIKA MOBILE (JOYSTICK) ---
    // Deteksi lebih akurat untuk HP & Tablet (termasuk iPad Pro)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
    let leftJoystick: any = null;
    let rightJoystick: any = null;
    // DI MAIN.TS (Bagian bootstrap)

    if (isMobile) {
        leftJoystick = new BABYLON.VirtualJoystick(true);
        rightJoystick = new BABYLON.VirtualJoystick(false);
    }

    // 2. --- INI ADALAH SATU-SATUNYA OTAK PERGERAKAN (Taruh di sini) ---
    scene.onBeforeRenderObservable.add(() => {
        let inputX = 0;
        let inputY = 0;

        // Cek Keyboard (PC)
        if (inputMap["w"]) inputY = 1;
        if (inputMap["s"]) inputY = -1;
        if (inputMap["a"]) inputX = -1;
        if (inputMap["d"]) inputX = 1;

        // Cek Joystick (Jika Mobile & Ditekan)
        if (isMobile && leftJoystick && leftJoystick.pressed) {
            inputX = leftJoystick.deltaPosition.x;
            inputY = leftJoystick.deltaPosition.y;
        }

        // EKSEKUSI GERAKAN (Semua lewat satu pintu)
        // Kita tambahkan toleransi 0.05 supaya tidak gerak sendiri kalau joystick goyang dikit
        if (Math.abs(inputX) > 0.05 || Math.abs(inputY) > 0.05) {
            avatarManager.handleAvatarMovement(
                inputX,
                inputY,
                scene.activeCamera,
                networkManager.socket
            );
        } else {
            // Balik ke Idle kalau gak ada input
            avatarManager.handleAvatarMovement(0, 0, scene.activeCamera, networkManager.socket);
        }

        // Rotasi Kamera (Mobile)
        if (isMobile && rightJoystick && rightJoystick.pressed && avatarManager.localAvatar) {
            avatarManager.localAvatar.rotation.y += rightJoystick.deltaPosition.x * 0.05;
        }
    });


    // if (isMobile) {
    //     const mobileUI = document.getElementById('mobile-controls');
    //     if (mobileUI) mobileUI.style.display = 'flex';

    //     // Buat Joystick Kiri (Movement)
    //     const leftJoystick = new VirtualJoystick(true);
    //     leftJoystick.setJoystickSensibility(0.05);

    //     // Buat Joystick Kanan (Rotation)
    //     const rightJoystick = new VirtualJoystick(false);
    //     rightJoystick.reverseUpDown = true;

    //     // Masukkan ke dalam Render Loop
    //     scene.onBeforeRenderObservable.add(() => {
    //         if (leftJoystick.pressed) {
    //             // Pastikan panggil fungsi yang sudah kita perbaiki tadi
    //             // avatarManager.handleAvatarMovement(leftJoystick.deltaPosition.x, leftJoystick.deltaPosition.y);
    //             avatarManager.handleAvatarMovement(
    //                 leftJoystick.deltaPosition.x,
    //                 leftJoystick.deltaPosition.y,
    //                 scene.activeCamera,    // <--- Butuh setoran Kamera
    //                 (networkManager as any).socket  // <--- Butuh setoran Socket buat lapor ke server
    //             );
    //         }

    //         if (rightJoystick.pressed) {
    //             // PAKAI 'myAvatar' (sesuai variabel di langkah 6)
    //             myAvatar.rotation.y += rightJoystick.deltaPosition.x * 0.05;
    //         }
    //     });
    // }

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

    // Di akhir fungsi bootstrap()
    window.addEventListener("pointerdown", () => {
        // Paksa Babylon untuk menangkap pointer
        engine.enterPointerlock();
        console.log("📱 Mobile Input Unlocked!");
    }, { once: true });

    window.addEventListener("resize", () => {
        engine.resize();
    });
}
/**
 * Kontrol Gerakan Sederhana (WASD)
 */

// function setupInput(scene: BABYLON.Scene, mesh: BABYLON.AbstractMesh, onMove: (p: any, r: any) => void) {
//     const inputMap: any = {};
//     scene.actionManager = new BABYLON.ActionManager(scene);
//     scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
//         inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
//     }));
//     scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
//         inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
//     }));

//     // scene.onBeforeRenderObservable.add(() => {
//     //     let moved = false;
//     //     const speed = 0.1;

//     //     if (inputMap["w"]) { mesh.position.z += speed; moved = true; }
//     //     if (inputMap["s"]) { mesh.position.z -= speed; moved = true; }
//     //     if (inputMap["a"]) { mesh.position.x -= speed; moved = true; }
//     //     if (inputMap["d"]) { mesh.position.x += speed; moved = true; }

//     //     if (moved) {
//     //         onMove(mesh.position, mesh.rotation);
//     //     }
//     // });
// }

// VERSI BERSIH: Cukup terima 'scene' saja
function setupInput(scene: BABYLON.Scene) {
    // PENTING: Jangan pakai 'const' di sini! 
    // Biarkan dia pakai inputMap global yang sudah Om buat di paling atas file.

    scene.actionManager = new BABYLON.ActionManager(scene);

    // Deteksi Tombol Ditekan
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
            inputMap[evt.sourceEvent.key.toLowerCase()] = true;
        }
    ));

    // Deteksi Tombol Dilepas
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
            inputMap[evt.sourceEvent.key.toLowerCase()] = false;
        }
    ));

    // SEMUA KODE DI BAWAH INI (onBeforeRenderObservable) 
    // BOLEH DIHAPUS ATAU DI-COMMENT PERMANEN.
}

// Jalankan aplikasi setelah window load
window.addEventListener("DOMContentLoaded", bootstrap);