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

// Buat "KTP" baru untuk User kita
interface AppUser extends User {
    role: string;
}
const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

let isStarted = false;

// async function bootstrap() {
//     const overlay = document.getElementById("ui-overlay");
//     if (overlay) overlay.style.opacity = "0"; // Animasi pudar
//     setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);
//     if (isStarted) return; // Guard agar tidak running ganda saat Vite HMR refresh

//     console.log("Memulai Pioneer Portal V3... Siapkan mental, Ferguso!");

//     // 1. Fase Autentikasi (Pintu Gerbang)
//     // const user = await loginWithGoogle();
//     // if (!user) {
//     //     alert("Wajib login Google untuk masuk kelas!");
//     //     return;
//     // }
//     const googleUser = await loginWithGoogle();
//     if (!googleUser) return;

//     // Casting ke AppUser agar kita bisa menyuntikkan properti .role
//     const user = googleUser as AppUser;

//     // LOGIKA PENENTUAN ROLE (Proper & Dynamic)
//     user.role = TEACHER_EMAILS.includes(user.email || "")
//         ? ROLES.TEACHER
//         : ROLES.STUDENT;

//     console.log(`Selamat Datang, ${user.displayName}! Anda masuk sebagai: ${user.role}`);


//     // 2. Inisialisasi Panggung (Babylon Scene)
//     const { scene, engine, canvas } = await createPioneerScene("renderCanvas");


//     // 3. Inisialisasi Para Manajer
//     const avatarManager = new AvatarManager(scene);
//     const voiceManager = new VoiceManager(scene);
//     const networkManager = new NetworkManager(SERVER_URL, avatarManager);
//     const wbManager = new WhiteboardManager(scene, networkManager, user.role);

//     // Kirim referensi voiceManager ke network agar bisa pasang stream suara
//     // (Bisa juga via setter di NetworkManager)
//     (networkManager as any).voiceManager = voiceManager;
//     // 2. AKTIFKAN MIKROFON (Agar tidak perlu ketik manual di console!)
//     // Pastikan variabel networkManager sudah terdefinisi sebelumnya
//     await networkManager.startVoiceChat();

//     // 4. Join ke Jaringan dengan UID & Role
//     // Logic Role: Siapa cepat dia Guru (bisa dimodifikasi sesuai UID admin)
//     const role = "student"; // Default, server nanti yang validasi/assign
//     networkManager.joinClass(user.uid, user.displayName || "Siswa Misterius", role);

//     // 5. Buat Avatar Lokal (Diri Sendiri)
//     const myAvatar = avatarManager.createAvatar({
//         uid: user.uid,
//         displayName: user.displayName || "Saya",
//         role: role
//     });

//     // Simpan referensi lokal di manager
//     avatarManager.localAvatar = myAvatar;

//     // 6. Logika Pergerakan (Input Keyboard)
//     setupInput(scene, myAvatar, (pos, rot) => {
//         networkManager.sendMovement(pos, rot);
//     });

//     // // 1. Inisialisasi Whiteboard (Gunakan kode yang sudah didesain awal tadi!)
//     // const wbManager = new WhiteboardManager(scene, networkManager, user.role);
//     // // 2. Berikan referensi ke NetworkManager agar sinkronisasi jalan
//     // networkManager.setWhiteboardManager(wbManager);

//     // // 3. Munculkan UI (Guru: Spidol & Hapus, Murid: Simpan)
//     // new WhiteboardUI(wbManager, user.role);
//     // Sekarang panggil manager tanpa error merah!

//     new WhiteboardUI(wbManager, user.role);
//     networkManager.setWhiteboardManager(wbManager);
//     // // 7. Tanda Scene Siap (Proses Saved Offer)
//     networkManager.setReady();
//     // Kirim ke network
//     networkManager.joinClass(user.uid, user.displayName || "Anonim", user.role);


//     isStarted = true;
//     // main.ts
//     engine.runRenderLoop(() => {
//         scene.render(); // Tanpa ini, layar akan tetap hitam selamanya!
//     });
//     console.log("Pioneer Portal V3 Berhasil Mengudara! Bummm!");

//     // main.ts
//     window.addEventListener("click", () => {
//         if (BABYLON.Engine.audioEngine) {
//             BABYLON.Engine.audioEngine.unlock();
//             console.log("🔊 Audio Unlocked!");
//         }
//     }, { once: true });
//     // Di main.ts
//     window.addEventListener("resize", () => {
//         engine.resize();
//     });
// }
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

    // 7. Logika Pergerakan
    setupInput(scene, myAvatar, (pos, rot) => {
        networkManager.sendMovement(pos, rot);
    });

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
 * Kontrol Gerakan Sederhana (WASD)
 */
function setupInput(scene: BABYLON.Scene, mesh: BABYLON.AbstractMesh, onMove: (p: any, r: any) => void) {
    const inputMap: any = {};
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
    }));

    scene.onBeforeRenderObservable.add(() => {
        let moved = false;
        const speed = 0.1;

        if (inputMap["w"]) { mesh.position.z += speed; moved = true; }
        if (inputMap["s"]) { mesh.position.z -= speed; moved = true; }
        if (inputMap["a"]) { mesh.position.x -= speed; moved = true; }
        if (inputMap["d"]) { mesh.position.x += speed; moved = true; }

        if (moved) {
            onMove(mesh.position, mesh.rotation);
        }
    });
}

// Jalankan aplikasi setelah window load
window.addEventListener("DOMContentLoaded", bootstrap);