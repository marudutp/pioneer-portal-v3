import { loginWithGoogle } from "./auth/AuthManager";
import { createPioneerScene } from "./scene";
import { AvatarManager } from "./managers/AvatarManager";
import { VoiceManager } from "./managers/VoiceManager";
import { NetworkManager } from "./network/NetworkManager";
import * as BABYLON from "@babylonjs/core";
import { WhiteboardManager } from "./managers/WhiteboardManager";
import { WhiteboardUI } from "./managers/WhiteboardUI";
import { TEACHER_EMAILS } from "@shared/admin.config";
import { ROLES } from "@shared/constants";
import "@babylonjs/loaders/glTF";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
let isStarted = false;

async function bootstrap() {
    if (isStarted) return;

    // 1. UI Transition
    const overlay = document.getElementById("ui-overlay");
    if (overlay) overlay.style.opacity = "0";
    setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);

    // 2. Auth & Role
    const user = await loginWithGoogle();
    if (!user) return;
    const role = TEACHER_EMAILS.includes(user.email || "") ? ROLES.TEACHER : ROLES.STUDENT;

    // 3. Scene & Managers
    const { scene, engine, canvas } = await createPioneerScene("renderCanvas");
    const avatarManager = new AvatarManager(scene);
    const networkManager = new NetworkManager(SERVER_URL, avatarManager);
    const voiceManager = new VoiceManager(scene);
    const wbManager = new WhiteboardManager(scene, networkManager, role);

    (networkManager as any).voiceManager = voiceManager;
    networkManager.setWhiteboardManager(wbManager);

    // 🔥 URUTAN SAKTI: Set ID -> Join -> Create
    avatarManager.setLocalUserId(user.uid);
    await networkManager.startVoiceChat();
    networkManager.joinClass(user.uid, user.displayName || "User", role);

    // Buat avatar lokal (Hanya 1x di sini)
    avatarManager.createAvatar({
        uid: user.uid,
        displayName: user.displayName || "Saya",
        role: role
    });

    // 4. Input Setup
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
    if (isMobile) {
        setupMobileInput(scene, avatarManager, canvas, networkManager.socket);
    } else {
        setupKeyboardInput(scene, avatarManager, scene.activeCamera as BABYLON.Camera, networkManager.socket);
    }

    new WhiteboardUI(wbManager, role);
    networkManager.setReady();

    isStarted = true;
    engine.runRenderLoop(() => { scene.render(); });
    
    window.addEventListener("resize", () => engine.resize());
}

function setupKeyboardInput(scene: BABYLON.Scene, avatarManager: AvatarManager, camera: BABYLON.Camera, socket: any) {
    const inputMap: any = {};
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, e => inputMap[e.sourceEvent.key.toLowerCase()] = true));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, e => inputMap[e.sourceEvent.key.toLowerCase()] = false));

    scene.onBeforeRenderObservable.add(() => {
        if (!avatarManager.localAvatar) return;
        let dx = 0, dz = 0;
        if (inputMap["w"]) dz += 1; if (inputMap["s"]) dz -= 1;
        if (inputMap["a"]) dx -= 1; if (inputMap["d"]) dx += 1;
        avatarManager.handleAvatarMovement(dx, dz, camera, socket);
    });
}

function setupMobileInput(scene: BABYLON.Scene, avatarManager: AvatarManager, canvas: any, socket: any) {
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