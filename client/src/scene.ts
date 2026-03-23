import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

async function loadEnvironment(scene: Scene) {
    try {
        // Kita hapus pembuatan lampu di sini karena sudah ada di createPioneerScene
        const fileName = "classroom.glb";

        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/assets/",
            fileName,
            scene
        );

        const root = result.meshes[0];

        // ==========================================
        // 1. AKTIFKAN COLLISION PADA TIAP MESH GEDUNG
        // ==========================================
        // result.meshes.forEach(mesh => {
        //     // Hanya aktifkan collision untuk mesh yang punya bentuk (vertices)
        //     if (mesh.getTotalVertices() > 0) {
        //         mesh.checkCollisions = true;
        //     }
        // });
        // Di dalam file scene.ts bagian loadEnvironment
        result.meshes.forEach(mesh => {
            // 1. Cek apakah mesh punya data visual (vertices)
            if (mesh.getTotalVertices() > 0) {
                const name = mesh.name.toLowerCase();

                // 2. 🔥 PROTEKSI: Abaikan mesh transparan atau pembatas yang sering bikin macet
                if (name.includes("physics") || name.includes("boundary") || name.includes("limit")) {
                    mesh.checkCollisions = false;
                    mesh.isVisible = false; // Pastikan dia gak ganggu
                } else {
                    mesh.checkCollisions = true;
                }
            }
        });

        // ==========================================
        // 2. SCALING & POSITIONING (PENTING!)
        // ==========================================
        const bounding = root.getHierarchyBoundingVectors(true);
        const height = bounding.max.y - bounding.min.y;

        const targetHeight = 10;
        const scaleFactor = targetHeight / height;

        root.scaling.setAll(scaleFactor);

        // Paksa hitung ulang posisi setelah scaling
        root.computeWorldMatrix(true);

        // 🔥 FIX TENGGELAM: Pastikan lantai gedung tepat di Y = 0
        // Kita geser root-nya supaya titik terendah (lantai) ada di nol
        const newBounding = root.getHierarchyBoundingVectors(true);
        root.position.y = -newBounding.min.y;

        // 3. SETUP KAMERA
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.setTarget(new Vector3(0, 1.5, 0)); // Fokus ke level mata avatar
            camera.radius = 8;
            camera.beta = Math.PI / 2.5;
            camera.lowerRadiusLimit = 2;
            camera.upperRadiusLimit = 20;
        }

        console.log("🏛️ Environment loaded & Collisions activated!");

    } catch (error) {
        console.error("❌ Load environment gagal:", error);
    }
}

export async function createPioneerScene(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Canvas dengan id ${canvasId} tidak ditemukan!`);
    }

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);

    // ==========================================
    // 🔥 FITUR SAKTI: GLOBAL COLLISION & GRAVITY
    // ==========================================
    scene.collisionsEnabled = true; // WAJIB: Tanpa ini, checkCollisions di mesh tidak guna
    scene.gravity = new Vector3(0, -0.15, 0); // Gravitasi biar avatar tetap napak

    // Setup Dasar
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, new Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, true);

    // Lampu Tunggal (Cukup satu saja agar tidak terlalu terang)
    new HemisphericLight("light", new Vector3(0, 1, 0), scene);

    // Panggil Load Environment
    await loadEnvironment(scene);

    return { scene, engine, camera, canvas };
}