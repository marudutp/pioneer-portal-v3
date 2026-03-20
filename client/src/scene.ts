import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders"; // Penting kalau mau masukin model 3D (GLB/GLTF)

export interface SceneData {
    scene: BABYLON.Scene;
    engine: BABYLON.Engine;
    canvas: HTMLCanvasElement;
}
// // 1. Fungsi Helper untuk Load Gedung (Internal saja)
// async function loadEnvironment(scene: Scene) {
//     try {
//         const result = await SceneLoader.ImportMeshAsync(
//             "",
//             "./assets/", // Pastikan auditorium.glb ada di /client/public/assets/
//             "auditorium.glb",
//             scene
//         );

//         // Atur agar lantai auditorium bisa nerima bayangan/tabrakan
//         result.meshes.forEach(mesh => {
//             mesh.checkCollisions = true;
//             // Jika kamu butuh mesh tertentu untuk whiteboard, bisa dicari di sini
//         });

//         console.log("🏛️ Gedung Auditorium Berhasil Dipasang!");
//     } catch (error) {
//         console.error("❌ Gagal muat auditorium.glb:", error);
//     }
// }
// /**
//  * Penata Panggung Ferguso: Mengatur dunia 3D Pioneer Portal
//  */
// export async function createPioneerScene(canvasId: string): Promise<SceneData> {
//     const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
//     const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
//     const scene = new BABYLON.Scene(engine);

//     // 1. Tambahkan Pencahayaan (Hemispheric Light)
//     const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
//     light.intensity = 0.7;

//     // 2. Tambahkan Kamera (ArcRotate agar gampang diputar-putar)
//     const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new BABYLON.Vector3(0, 0, 0), scene);
//     camera.attachControl(canvas, true);
//     camera.lowerRadiusLimit = 2; // Biar gak bisa zoom ampe tembus lantai
//     camera.upperRadiusLimit = 20;

//     // 3. Buat Lantai (Ground) - Tempat Avatar berpijak
//     const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
//     const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
//     groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Abu-abu gelap elegan
//     ground.material = groundMat;

//     // 4. Skybox (Opsional, biar gak kelihatan kosong melongpong)
//     const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 100.0 }, scene);
//     const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", scene);
//     skyboxMaterial.backFaceCulling = false;
//     skyboxMaterial.disableLighting = true;
//     skybox.material = skyboxMaterial;
//     skybox.infiniteDistance = true;

//     // 5. Jalankan Render Loop
//     engine.runRenderLoop(() => {
//         scene.render();
//     });

//     // 6. Handle Resize Window
//     window.addEventListener("resize", () => {
//         engine.resize();
//     });

//     return { scene, engine, canvas };
// }

import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // <--- WAJIB: Biar Babylon ngerti file .glb

// 1. Fungsi Helper untuk Load Gedung (Internal saja)
// async function loadEnvironment(scene: Scene) {
//     try {
//         const result = await SceneLoader.ImportMeshAsync(
//             "", 
//             "./assets/", // Pastikan auditorium.glb ada di /client/public/assets/
//             "classroom.glb", 
//             scene
//         );

//         // Atur agar lantai auditorium bisa nerima bayangan/tabrakan
//         result.meshes.forEach(mesh => {
//             mesh.checkCollisions = true;
//             // Jika kamu butuh mesh tertentu untuk whiteboard, bisa dicari di sini
//         });

//         console.log("🏛️ Gedung Auditorium Berhasil Dipasang!");
//     } catch (error) {
//         console.error("❌ Gagal muat auditorium.glb:", error);
//     }
// }

async function loadEnvironment(scene: Scene) {
    try {
        new HemisphericLight("light", new Vector3(0, 1, 0), scene);

        const fileName = "classroom.glb";

        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/assets/",
            fileName,
            scene
        );

        const root = result.meshes[0];

        // =========================
        // 1. AKTIFKAN COLLISION
        // =========================
        result.meshes.forEach(mesh => {
            mesh.checkCollisions = true;
        });

        // =========================
        // 2. HITUNG BOUNDING SEKALI
        // =========================
        const bounding = root.getHierarchyBoundingVectors(true);

        const center = bounding.min.add(bounding.max).scale(0.5);
        const size = bounding.max.subtract(bounding.min);

        // =========================
        // 3. CENTER MODEL
        // =========================
        root.position.subtractInPlace(center);
        console.log("🏛️ REAL SIZE:", size.toString);
        console.log("📏 HEIGHT:", size.y);
        // =========================
        // 4. GROUND ALIGN (biar tidak tenggelam)
        // =========================
        root.position.y -= bounding.min.y;

        // =========================
        // 5. (OPTIONAL) SCALE — HANYA JIKA PERLU
        // =========================
        const height = size.y;

        if (height > 20 || height < 1) {
            // const targetHeight = 3;
            // const scaleFactor = targetHeight / height;

            // root.scaling.scaleInPlace(scaleFactor);
            root.computeWorldMatrix(true);

            // console.log("⚖️ Auto scale applied:", scaleFactor);
        } else {
            console.log("✅ Model already correct scale (no scaling)");
        }

        // =========================
        // 6. CAMERA FIX
        // =========================
        const camera = scene.activeCamera as ArcRotateCamera;

        if (camera) {
            // camera.setTarget(Vector3.Zero());

            // const radius = size.length() * 0.6;
            // camera.radius = Math.max(5, radius);
            const center = bounding.min.add(bounding.max).scale(0.5);

            camera.setTarget(center);

            // BATASI radius (jangan auto liar)
            camera.radius = 12;

            console.log("🎥 Camera radius:", camera.radius);
        }

        console.log("🏛️ Environment loaded successfully");

    } catch (error) {
        console.error("❌ Load environment gagal:", error);
    }
}

// 2. Fungsi Utama yang kamu gunakan
export async function createPioneerScene(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Canvas dengan id ${canvasId} tidak ditemukan, Ferguso!`);
    }
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);

    // Setup Dasar (Kamera, Lampu)
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

    // --- PANGGIL LOAD ENVIRONMENT DI SINI ---
    await loadEnvironment(scene);
    // -----------------------------------------

    return { scene, engine, camera, canvas };
}