import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    ActionManager, SceneLoader, AnimationGroup, ISceneLoaderAsyncResult,
    ExecuteCodeAction
} from "@babylonjs/core";
import "@babylonjs/loaders"; // <--- Tambahkan ini agar bisa baca .glb / .gltf
import { AdvancedDynamicTexture, Button, Control, StackPanel, TextBlock } from "@babylonjs/gui";

import { io, Socket } from "socket.io-client";

interface RemotePlayerData {
    id: string;
    x: number;
    y: number;
    z: number;
    model: string;
    role: string; // <--- Ini yang bikin merah kalau tidak ada
    isMoving: boolean;
}

export class ClassroomScene {

    private engine: Engine;
    public scene: Scene;
    private socket: Socket;
    private players: Map<string, Mesh> = new Map();
    private myAvatar!: Mesh;
    private inputMap: any = {};

    private uiTexture!: AdvancedDynamicTexture;

    // TAMBAHKAN DUA BARIS INI
    private idleAnim: AnimationGroup | undefined;
    private walkAnim: AnimationGroup | undefined;

    // constructor(canvas: HTMLCanvasElement) {
    //     // 1. Inisialisasi Engine & Scene
    //     this.engine = new Engine(canvas, true);
    //     this.scene = new Scene(this.engine);

    //     // 2. Koneksi ke Server (Pastikan server.ts di port 3000 sudah jalan)
    //     this.socket = io("http://localhost:3000");

    //     this.setupCamera(canvas);
    //     this.createEnvironment();
    //     // PASTIKAN BARIS INI ADA:
    //     this.createAvatarMenu();
    //     this.setupInput();
    //     this.handleNetwork();

    //     // 3. Render Loop
    //     this.engine.runRenderLoop(() => {
    //         this.updateMovement();
    //         this.scene.render();
    //     });

    //     window.addEventListener("resize", () => this.engine.resize());
    // }

    constructor(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);
        // this.socket = io("http://localhost:3000");
        this.socket = io("http://192.168.0.103:3000");

        this.setupCamera(canvas);
        this.createEnvironment();

        // 1. AKTIFKAN MENU KEMBALI
        this.createAvatarMenu();

        // 2. Render Loop
        this.engine.runRenderLoop(() => {
            if (this.myAvatar) {
                this.updateMovement();
            }
            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    }


    // FUNGSI BARU: Untuk menangani alur async yang tidak bisa di constructor
    private async initializeGame(modelName: string) {
        try {
            // A. Muat Mesh Avatar dahulu
            const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
            this.myAvatar = result.meshes[0] as Mesh;
            this.myAvatar.position.set(0, 0, 0);
            this.myAvatar.rotationQuaternion = null;


            // B. BARU PANGGIL Dokter Bedah Animasi dengan mengirimkan 'result'
            // Ini akan memperbaiki masalah Root Motion (maju-mundur)
            await this.loadAndFixAnimationsWalkAndIdle(result);

            // C. Aktifkan Input & Kamera setelah semuanya siap
            this.setupInput();
            const camera = this.scene.activeCamera as ArcRotateCamera;
            if (camera) camera.lockedTarget = this.myAvatar;

            console.log("Pioneer Portal: Avatar & Animasi In-Place Siap!");

        } catch (error) {
            console.error("Gagal inisialisasi avatar:", error);
        }
    }

    private async testSingleAvatar(modelName: string) {
        // 1. Muat Mesh
        const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
        this.myAvatar = result.meshes[0] as Mesh;
        this.myAvatar.position.set(0, 0, 0);
        this.myAvatar.rotationQuaternion = null;

        await this.loadAndFixAnimationsWalkAndIdle(result);

        // 2. Muat Animasi
        const [idleRes, walkRes] = await Promise.all([
            SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene),
            SceneLoader.ImportAnimationsAsync("./", "walk.glb", this.scene) // File locomotion Anda
        ]);

        // MATIKAN SEMUA ANIMASI MASTER (Sangat Penting!)
        [...idleRes.animationGroups, ...walkRes.animationGroups].forEach(ag => ag.stop());

        const skeleton = result.skeletons[0];

        // 3. Fungsi Pembuat "Jiwa" In-Place
        const createInPlaceAnim = (sourceGroup: any, name: string) => {
            const newGroup = new AnimationGroup(name, this.scene);
            sourceGroup.targetedAnimations.forEach((ta: any) => {
                const targetNode = skeleton.bones.find(b => b.name === ta.target.name)?.getTransformNode();

                if (targetNode) {
                    // LOCKDOWN: Jika animasi mencoba memindahkan posisi (Locomotion biasanya di Hips)
                    // Kita abaikan saja. Kita hanya mau ayunan tulangnya (Rotation).
                    if (ta.animation.targetProperty === "position") return;

                    newGroup.addTargetedAnimation(ta.animation, targetNode);
                }
            });
            return newGroup;
        };

        this.idleAnim = createInPlaceAnim(idleRes.animationGroups[0], "TestIdle");
        this.walkAnim = createInPlaceAnim(walkRes.animationGroups[0], "TestWalk");

        // Jalankan awal
        this.idleAnim.play(true);
    }
    private createAvatarMenu() {
        // 1. Buat FullScreen UI
        this.uiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // 2. Wadah tombol (StackPanel) agar rapi vertikal
        const panel = new StackPanel();
        panel.width = "220px";
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.uiTexture.addControl(panel);

        // Judul Menu
        const header = new TextBlock();
        header.text = "Pilih Avatar Anda";
        header.height = "50px";
        header.color = "white";
        header.fontSize = 24;
        panel.addControl(header);

        // Tombol Avatar 1
        const btn1 = Button.CreateSimpleButton("btn1", "Gunakan Avatar A");
        this.styleButton(btn1);
        btn1.onPointerUpObservable.add(() => {
            this.joinClass("avatar_a.glb");
        });
        panel.addControl(btn1);

        // Tombol Avatar 2
        const btn2 = Button.CreateSimpleButton("btn2", "Gunakan Avatar B");
        this.styleButton(btn2);
        btn2.onPointerUpObservable.add(() => {
            this.joinClass("avatar_b.glb");
        });
        panel.addControl(btn2);
    }

    private styleButton(btn: Button) {
        btn.width = "200px";
        btn.height = "40px";
        btn.color = "white";
        btn.background = "#2ecc71";
        btn.cornerRadius = 10;
        btn.paddingBottom = "10px";
    }
    private async joinClass(modelName: string) {
        // Hapus menu UI
        if (this.uiTexture) this.uiTexture.dispose();

        // Jalankan inisialisasi avatar & animasi
        await this.initializeGame(modelName);

        // Aktifkan jaringan
        this.handleNetwork();

        // Beritahu server
        // const myRole = "siswa";
        // this.socket.emit("join", { avatarModel: modelName, role: myRole });
        // Kirim join tanpa menentukan role sendiri
        this.socket.emit("join", { avatarModel: modelName });
    }

    private setupCamera(canvas: HTMLCanvasElement) {
        const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 15, new Vector3(0, 0, 0), this.scene);
        camera.attachControl(canvas, true);
        // Baris ini akan membuat kamera selalu melihat ke kotak hijau Anda
        camera.lockedTarget = this.myAvatar;
    }

    private async createEnvironment() {
        new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

        // Lantai Dasar
        // const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);
        // const groundMat = new StandardMaterial("groundMat", this.scene);
        // groundMat.diffuseColor = new Color3(0.1, 0.1, 0.2);
        // ground.material = groundMat;

        // MEMANGGIL DESAIN DARI BABYLON EDITOR
        // Pastikan file classroom.glb ada di folder client/public/
        try {
            const result = await SceneLoader.ImportMeshAsync(
                "",
                "./",
                "classroom.glb",
                this.scene
            );

            // Jika desain Anda terlalu besar/kecil, atur di sini
            result.meshes.forEach(mesh => {
                mesh.scaling = new Vector3(0.2, 0.2, 0.2); // Contoh jika ingin mengecilkan

                // Jika ingin meja/kursi bisa ditabrak (Collision)
                // KODE SAKTI VERSI 2 (Hanya mengatur posisi, bukan merusak skala)
                const rootMesh = result.meshes[0];
                if (rootMesh) {
                    // Geser model secara keseluruhan agar lantainya pas di koordinat 0
                    // Jika kotak hijau masih tenggelam, ubah -0.5 menjadi angka lain (misal -1.0)
                    rootMesh.position.y = -0.9;
                }

                console.log("Ruang auditorium siap digunakan!");
                mesh.checkCollisions = true;
            });

            console.log("Ruang kelas berhasil dimuat!");
        } catch (error) {
            console.error("Gagal memuat ruang kelas:", error);

            // Fallback: Jika file belum ada, buat lantai biru dulu
            const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);
            const groundMat = new StandardMaterial("groundMat", this.scene);
            groundMat.diffuseColor = new Color3(0.1, 0.1, 0.2);
            ground.material = groundMat;
        }

        // Avatar Kita (HIJAU)
        // this.myAvatar = MeshBuilder.CreateBox("localPlayer", { size: 1 }, this.scene);
        // this.myAvatar.position.y = 0.5;
        // const myMat = new StandardMaterial("myMat", this.scene);
        // myMat.diffuseColor = Color3.Green();
        // this.myAvatar.material = myMat;
    }

    private setupInput() {
        // Menangkap input keyboard WASD
        this.scene.actionManager = new ActionManager(this.scene);
        this.scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
        }));
        this.scene.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, (evt) => {
            this.inputMap[evt.sourceEvent.key.toLowerCase()] = evt.sourceEvent.type === "keydown";
        }));
    }

    // private updateMovement() {
    //     let moved = false;
    //     const speed = 0.1;

    //     if (this.inputMap["w"]) { this.myAvatar.position.z += speed; moved = true; }
    //     if (this.inputMap["s"]) { this.myAvatar.position.z -= speed; moved = true; }
    //     if (this.inputMap["a"]) { this.myAvatar.position.x -= speed; moved = true; }
    //     if (this.inputMap["d"]) { this.myAvatar.position.x += speed; moved = true; }

    //     // Jika bergerak, kirim posisi ke server
    //     if (moved) {
    //         this.socket.emit("move", {
    //             x: this.myAvatar.position.x,
    //             y: this.myAvatar.position.y,
    //             z: this.myAvatar.position.z
    //         });
    //     }
    // }

    // private async loadSelectedAvatar(modelName: string) {
    //     if (this.myAvatar) this.myAvatar.dispose();

    //     try {
    //         const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);

    //         // Ready Player Me biasanya punya __root__ di meshes[0]
    //         this.myAvatar = result.meshes[0] as Mesh;
    //         this.myAvatar.name = "localPlayer";

    //         // Atur posisi agar tidak tenggelam di auditorium
    //         // this.myAvatar.position.set(0, 0.8, 0);
    //         this.myAvatar.position.y = Math.PI;

    //         // Penting: Pastikan kamera mengunci ke avatar baru ini
    //         // const camera = this.scene.activeCamera as ArcRotateCamera;
    //         // if (camera) {
    //         //     camera.lockedTarget = this.myAvatar;
    //         // }
    //         // Di akhir fungsi loadSelectedAvatar
    //         const camera = this.scene.activeCamera as ArcRotateCamera;
    //         if (camera) {
    //             camera.lockedTarget = this.myAvatar;
    //             // Jika ingin kamera di belakang karakter:
    //             camera.alpha = -Math.PI / 2;
    //             camera.beta = Math.PI / 3;
    //         }

    //         console.log("Avatar Ready Player Me siap!");
    //     } catch (error) {
    //         console.error("Gagal load avatar:", error);
    //     }
    // }

    // private updateMovement() {
    //     if (!this.myAvatar || !this.idleAnim || !this.walkAnim) return;

    //     let moved = false;
    //     const speed = 0.05;

    //     const isMoving = (
    //         this.inputMap["w"] || this.inputMap["arrowup"] ||
    //         this.inputMap["s"] || this.inputMap["arrowdown"] ||
    //         this.inputMap["a"] || this.inputMap["arrowleft"] ||
    //         this.inputMap["d"] || this.inputMap["arrowright"]
    //     );

    //     // 1. Logika Pergerakan & Rotasi
    //     if (this.inputMap["w"] || this.inputMap["arrowup"]) {
    //         this.myAvatar.position.z += speed;
    //         this.myAvatar.rotation.y = Math.PI;
    //         moved = true;
    //     } else if (this.inputMap["s"] || this.inputMap["arrowdown"]) {
    //         this.myAvatar.position.z -= speed;
    //         this.myAvatar.rotation.y = 0;
    //         moved = true;
    //     } else if (this.inputMap["a"] || this.inputMap["arrowleft"]) {
    //         this.myAvatar.position.x -= speed;
    //         this.myAvatar.rotation.y = Math.PI / 2;
    //         moved = true;
    //     } else if (this.inputMap["d"] || this.inputMap["arrowright"]) {
    //         this.myAvatar.position.x += speed;
    //         this.myAvatar.rotation.y = -Math.PI / 2;
    //         moved = true;
    //     }

    //     // 2. LOGIKA SAKTI ANIMASI LOKAL
    //     if (isMoving) {
    //         if (!this.walkAnim.isPlaying) {
    //             this.idleAnim.stop();
    //             this.walkAnim.start(true);
    //         }
    //     } else {

    //         if (!this.idleAnim.isPlaying) {
    //             this.walkAnim.stop();
    //             this.idleAnim.start(true);
    //             this.socket.emit("move", {
    //                 x: this.myAvatar.position.x,
    //                 y: this.myAvatar.position.y,
    //                 z: this.myAvatar.position.z,
    //                 rotation: this.myAvatar.rotation.y,
    //                 isMoving: false
    //             });
    //         }
    //     }

    //     // 3. LOGIKA NETWORKING (SINKRONISASI)
    //     // Kita kirim data jika sedang bergerak (moved) 
    //     // ATAU jika baru saja berhenti (untuk mematikan animasi di tab lain)
    //     if (moved || (!isMoving && this.idleAnim.isPlaying && this.lastSentMovingState !== false)) {
    //         this.socket.emit("move", {
    //             x: this.myAvatar.position.x,
    //             y: this.myAvatar.position.y,
    //             z: this.myAvatar.position.z,
    //             rotation: this.myAvatar.rotation.y,
    //             isMoving: isMoving // Kirim status animasi ke server
    //         });

    //         // Simpan state terakhir agar tidak spam server saat diam
    //         this.lastSentMovingState = isMoving;
    //     }
    // }

    //testSingleAvatar
    private updateMovement() {
        if (!this.myAvatar) return;

        const speed = 0.1;
        let moved = false;
        let isMoving = false;

        const forward = this.myAvatar.forward.normalize();

        if (this.inputMap["w"]) {
            this.myAvatar.moveWithCollisions(forward.scale(speed));
            isMoving = true;
            moved = true;
        }

        if (this.inputMap["s"]) {
            this.myAvatar.moveWithCollisions(forward.scale(-speed));
            isMoving = true;
            moved = true;
        }

        if (this.inputMap["a"]) {
            this.myAvatar.rotation.y += 0.05;
            moved = true;
        }

        if (this.inputMap["d"]) {
            this.myAvatar.rotation.y -= 0.05;
            moved = true;
        }

        if (moved) {
            this.socket.emit("move", {
                x: this.myAvatar.position.x,
                y: this.myAvatar.position.y,
                z: this.myAvatar.position.z,
                rotation: this.myAvatar.rotation.y,
                isMoving: isMoving
            });
        }
    }

    private async loadAndFixAnimations(result: ISceneLoaderAsyncResult) {
        const skeleton = result.skeletons[0];

        try {
            // 1. Cukup muat Idle saja
            const idleRes = await SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene);

            // 2. Matikan animasi bawaan file RPM
            if (result.animationGroups) {
                result.animationGroups.forEach(ag => ag.stop());
            }

            // 3. Buat animasi Idle yang bersih (hanya rotasi)
            this.idleAnim = new AnimationGroup("CleanIdle", this.scene);
            idleRes.animationGroups[0].targetedAnimations.forEach((ta: any) => {
                const bone = skeleton.bones.find(b => b.name === ta.target.name);
                const targetNode = bone ? bone.getTransformNode() : null;

                if (targetNode && ta.animation.targetProperty !== "position") {
                    this.idleAnim!.addTargetedAnimation(ta.animation, targetNode);
                }
            });

            // 4. Jalankan selamanya
            this.idleAnim.play(true);
            console.log("Hover Mode Aktif: Hanya Idle yang berjalan.");

        } catch (e) {
            console.error("Gagal muat animasi:", e);
        }
    }

    private async loadAndFixAnimationsWalkAndIdle(result: ISceneLoaderAsyncResult) {
        const skeleton = result.skeletons[0];
        if (result.animationGroups) result.animationGroups.forEach(ag => ag.stop());

        const [idleRes, walkRes] = await Promise.all([
            SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene),
            SceneLoader.ImportAnimationsAsync("./", "walk.glb", this.scene)
        ]);

        // Gunakan fungsi pembedah universal
        this.idleAnim = this.createInPlaceAnimation(idleRes.animationGroups[0], "LocalIdle", skeleton);
        this.walkAnim = this.createInPlaceAnimation(walkRes.animationGroups[0], "LocalWalk", skeleton);

        // Hentikan master agar tidak menjajah
        [...idleRes.animationGroups, ...walkRes.animationGroups].forEach(ag => ag.stop());

        this.idleAnim.play(true);
    }

    // Tambahkan variabel ini di bagian atas class (di bawah myAvatar)
    private lastSentMovingState: boolean = false;

    // private async loadSelectedAvatar(modelName: string) {
    //     const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
    //     this.myAvatar = result.meshes[0] as Mesh;

    //     this.myAvatar.name = "localPlayer";
    //     // CEK APAKAH ADA ANIMASI SAMA SEKALI?
    //     console.log("Jumlah Animasi di File:", result.animationGroups.length);

    //     if (result.animationGroups.length === 0) {
    //         console.error("Waduh Ferguso, file GLB ini memang KOSONG animasinya (T-Pose permanen)!");
    //     } else {
    //         // Print semua nama yang ada agar kita tidak salah ketik
    //         result.animationGroups.forEach(ag => console.log("Nama Animasi Tersedia:", ag.name));
    //     }

    //     // Lihat semua animasi yang tersedia di Console F12
    //     console.log("Animasi yang ditemukan:", result.animationGroups.map(ag => ag.name));
    //     // 1. Ambil grup animasi dari file GLB
    //     this.idleAnim = result.animationGroups.find(ag => ag.name.includes("Idle"));
    //     this.walkAnim = result.animationGroups.find(ag => ag.name.includes("Walk"));

    //     // 2. Jalankan animasi Idle sebagai default agar tidak T-Pose
    //     if (this.idleAnim) {
    //         this.idleAnim.start(true); // 'true' untuk melakukan looping
    //     } else {
    //         console.warn("Animasi Idle TIDAK ditemukan!");
    //     }


    //     // 2. Perbaikan Posisi (Menapak Lantai)
    //     // Jika masih melayang, kurangi angka 0.5 menjadi 0.2 atau 0.1
    //     this.myAvatar.position.set(0, 0.1, 0);

    //     // Matikan Quaternion agar rotation.y manual kita berfungsi
    //     this.myAvatar.rotationQuaternion = null;
    //     this.myAvatar.rotation.y = Math.PI;

    //     try {
    //         // 2. MUAT FILE ANIMASI (Rig Saja)
    //         // Letakkan file download-an Anda di folder 'public' dan beri nama 'animations.glb'
    //         const animResult = await SceneLoader.ImportAnimationsAsync("./", "animations.glb", this.scene);

    //         // 3. PASANGKAN KE AVATAR (Retargeting Otomatis)
    //         // Babylon akan mencocokkan tulang Rig ke tubuh Avatar Anda
    //         this.idleAnim = animResult.animationGroups.find(ag => ag.name.toLowerCase().includes("idle"));
    //         this.walkAnim = animResult.animationGroups.find(ag => ag.name.toLowerCase().includes("walk"));

    //         // Jalankan Idle agar avatar terlihat "hidup"
    //         if (this.idleAnim) {
    //             this.idleAnim.start(true);
    //             console.log("Gerakan Rig berhasil dipasang ke Avatar!");
    //         }
    //     } catch (e) {
    //         console.error("Gagal memasang Rig animasi:", e);
    //     }


    //     const camera = this.scene.activeCamera as ArcRotateCamera;
    //     if (camera) camera.lockedTarget = this.myAvatar;
    // }

    private async loadSelectedAvatar(modelName: string) {

        // 1. Muat Mesh Avatar Utama
        const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
        if (result.meshes && result.meshes.length > 0) {
            // Gunakan meshes[0] sebagai root utama
            this.myAvatar = result.meshes[0] as Mesh;
            this.myAvatar.name = "localPlayer";

            // Hanya panggil setParent jika myAvatar benar-benar ada
            if (this.myAvatar.parent) {
                this.myAvatar.setParent(null);
            }
            this.myAvatar.position.set(0, 0.1, 0);
            this.myAvatar.rotationQuaternion = null;
            this.myAvatar.rotation.y = Math.PI;
        }
        else {
            console.error("Gagal memuat avatar: Mesh tidak ditemukan!");
            return;
        }
        // try {
        //     // 1. Muat file animasi
        //     const [idleRes, walkRes] = await Promise.all([
        //         SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene),
        //         SceneLoader.ImportAnimationsAsync("./", "walk.glb", this.scene)
        //     ]);

        //     // 2. Ambil Skeleton Utama dari Avatar RPM Anda
        //     // RPM biasanya meletakkan skeleton di index 0
        //     const mainSkeleton = result.skeletons[0];

        //     if (mainSkeleton) {
        //         this.idleAnim = idleRes.animationGroups[0];
        //         this.walkAnim = walkRes.animationGroups[0];

        //         // 3. JURUS SAKTI: Hubungkan pergerakan tulang secara mendalam
        //         [this.idleAnim, this.walkAnim].forEach(animGroup => {
        //             if (animGroup) {
        //                 animGroup.targetedAnimations.forEach(ta => {
        //                     // Cari tulang (bone) di skeleton utama yang namanya mirip/sama
        //                     const bone = mainSkeleton.bones.find(b => b.name === ta.target.name || b.id === ta.target.name);
        //                     if (bone) {
        //                         // Paksa animasi menggerakkan TransformNode milik tulang tersebut
        //                         const tNode = bone.getTransformNode();
        //                         if (tNode) {
        //                             ta.target = tNode;
        //                         }
        //                     }
        //                 });
        //             }
        //         });

        //         // 4. Pastikan semua mesh terikat ke skeleton ini
        //         result.meshes.forEach(m => {
        //             if (m.skeleton !== mainSkeleton) {
        //                 m.skeleton = mainSkeleton;
        //             }
        //         });

        //         // Jalankan Idle
        //         this.idleAnim?.play(true); // Gunakan play daripada start untuk memastikan
        //         console.log("Deep Retargeting Berhasil!");
        //     }
        // } catch (e) {
        //     console.error("Gagal total di Deep Retargeting:", e);
        // }

        try {
            // 1. Muat file animasi
            const [idleRes, walkRes] = await Promise.all([
                SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene),
                SceneLoader.ImportAnimationsAsync("./", "walk.glb", this.scene)
            ]);

            // 2. Langsung matikan semua animasi yang baru masuk agar tidak "rebutan"
            idleRes.animationGroups.forEach(ag => ag.stop());
            walkRes.animationGroups.forEach(ag => ag.stop());

            const skeleton = result.skeletons[0];

            // 3. Fungsi untuk membuat "Jiwa" Animasi Mandiri
            // const createUniqueAnim = (sourceGroup: any, animName: string) => {
            //     // Kita buat grup baru yang benar-benar kosong
            //     const newGroup = new AnimationGroup(animName, this.scene);

            //     sourceGroup.targetedAnimations.forEach((ta: any) => {
            //         // Cari tulang yang cocok di tubuh avatar ini saja
            //         const bone = skeleton.bones.find(b => b.name === ta.target.name || b.id === ta.target.name);
            //         const targetNode = bone ? bone.getTransformNode() : null;

            //         if (targetNode) {
            //             // Masukkan "gerakan" ke "tulang" avatar ini
            //             newGroup.addTargetedAnimation(ta.animation, targetNode);
            //         }
            //     });
            //     return newGroup;
            // };

            const createUniqueAnim = (sourceGroup: any, animName: string) => {
                const newGroup = new AnimationGroup(animName, this.scene);

                sourceGroup.targetedAnimations.forEach((ta: any) => {
                    const bone = skeleton.bones.find(b => b.name === ta.target.name || b.id === ta.target.name);
                    const targetNode = bone ? bone.getTransformNode() : null;

                    if (targetNode) {
                        // JURUS SAKTI: Jika ini animasi POSISI pada tulang pinggul (Hips/Root), JANGAN dimasukkan.
                        // Kita hanya butuh ROTASI (ayunan kaki) agar tetap di tempat (In-Place).
                        const isHips = ta.target.name.toLowerCase().includes("hips") || ta.target.name.toLowerCase().includes("root");
                        const isPosition = ta.animation.targetProperty === "position";

                        if (isHips && isPosition) {
                            // Abaikan jalur ini, jangan masukkan ke newGroup
                            return;
                        }

                        newGroup.addTargetedAnimation(ta.animation, targetNode);
                    }
                });
                return newGroup;
            };


            // 4. Pasangkan ke variabel Class
            this.idleAnim = createUniqueAnim(idleRes.animationGroups[0], "LocalIdle");
            this.walkAnim = createUniqueAnim(walkRes.animationGroups[0], "LocalWalk");

            // Jalankan Idle
            this.idleAnim.play(true);

            console.log("Selesai! Animasi unik berhasil dijahit.");

        } catch (e) {
            console.error("Gagal menjahit animasi:", e);
        }

        const camera = this.scene.activeCamera as ArcRotateCamera;
        if (camera) camera.lockedTarget = this.myAvatar;
    }

    // private async createRemotePlayer(id: string, position: Vector3, modelName: string) {
    //     //kubus merah
    //     // const remotePlayer = MeshBuilder.CreateBox(id, { size: 1 }, this.scene);

    //     // const remoteMat = new StandardMaterial("remoteMat", this.scene);
    //     // remoteMat.diffuseColor = Color3.Red();
    //     // remotePlayer.material = remoteMat;
    //     // remotePlayer.position = position;

    //     // // Beri nama melayang di atas kepala siswa lain
    //     // this.addNameTag(remotePlayer, "Siswa-" + id.substring(0, 4));

    //     // this.players.set(id, remotePlayer);

    //     const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
    //     const remoteAvatar = result.meshes[0] as Mesh;

    //     remoteAvatar.position = position;
    //     remoteAvatar.rotation.y = Math.PI; // Sesuaikan rotasi agar tidak membelakangi

    //     // 2. Simpan ke Map pemain
    //     this.players.set(id, remoteAvatar);

    //     // 3. Tambahkan Nama
    //     this.addNameTag(remoteAvatar, "Siswa-" + id.substring(0, 4));
    // }

    // private async createRemotePlayer(id: string, position: Vector3, modelName: string) {
    //     try {
    //         // Gunakan modelName yang dikirim dari server (misal: "avatar_a.glb")
    //         const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
    //         const remoteAvatar = result.meshes[0] as Mesh;

    //         remoteAvatar.position = position;
    //         remoteAvatar.rotation.y = Math.PI; // Agar tidak membelakangi auditorium

    //         // Simpan ke map agar bisa digerakkan nantinya
    //         this.players.set(id, remoteAvatar);

    //         // Tambahkan nama di atas kepala
    //         this.addNameTag(remoteAvatar, "Siswa-" + id.substring(0, 4));

    //         console.log(`Avatar ${modelName} untuk ${id} berhasil dimuat.`);
    //     } catch (e) {
    //         console.error("Gagal memuat avatar remote:", e);
    //     }
    // }


    // private async createRemotePlayer(id: string, position: Vector3, modelName: string) {
    //     try {
    //         // 1. Muat Mesh Avatar Pemain Lain
    //         const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
    //         const remoteAvatar = result.meshes[0] as Mesh;
    //         remoteAvatar.position = position;
    //         remoteAvatar.rotationQuaternion = null;

    //         // 2. Muat dua file animasi sekaligus untuk pemain ini
    //         const [idleRes, walkRes] = await Promise.all([
    //             SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene),
    //             SceneLoader.ImportAnimationsAsync("./", "walk.glb", this.scene)
    //         ]);

    //         // 3. Simpan animasi di dalam objek mesh-nya agar gampang dipanggil di handleNetwork
    //         const remote = remoteAvatar as any; // Cast ke any agar bisa tambah properti custom
    //         remote.idle = idleRes.animationGroups[0];
    //         remote.walk = walkRes.animationGroups[0];

    //         // 4. Lakukan Retargeting Manual (Penting agar animasi nempel ke tubuh orang lain)
    //         const skeleton = result.skeletons[0];
    //         [remote.idle, remote.walk].forEach(anim => {
    //             if (anim) {
    //                 anim.targetedAnimations.forEach(ta => {
    //                     const bone = skeleton.bones.find(b => b.name === ta.target.name);
    //                     if (bone) {
    //                         const tNode = bone.getTransformNode();
    //                         if (tNode) ta.target = tNode;
    //                     }
    //                 });
    //             }
    //         });

    //         // Jalankan Idle sebagai posisi awal
    //         remote.idle?.play(true);

    //         // Masukkan ke Map daftar pemain
    //         this.players.set(id, remoteAvatar);

    //         // Tambahkan label nama
    //         this.addNameTag(remoteAvatar, "Siswa-" + id.substring(0, 4));

    //     } catch (e) {
    //         console.error("Gagal membuat pemain lain:", e);
    //     }
    // }

    private async createRemotePlayer(id: string, position: Vector3, modelName: string, role: string) {
        try {
            const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);
            const remoteAvatar = result.meshes[0] as Mesh;
            remoteAvatar.position = position;
            remoteAvatar.rotationQuaternion = null;

            if (role === "guru") {
                // Berikan aura atau ukuran yang sedikit lebih besar untuk Guru
                remoteAvatar.scaling = new Vector3(1.1, 1.1, 1.1);
            }
            // 1. LANGKAH KRUSIAL: Matikan semua animasi bawaan file GLB pemain lain
            if (result.animationGroups) {
                result.animationGroups.forEach(ag => ag.stop());
            }

            // 2. Gunakan fungsi "Dokter Bedah" yang sudah kita buat tadi
            // agar pemain lain juga menggunakan animasi Idle yang BERSIH (In-Place)
            const skeleton = result.skeletons[0];
            const idleRes = await SceneLoader.ImportAnimationsAsync("./", "idle.glb", this.scene);

            const remoteIdle = new AnimationGroup("RemoteIdle_" + id, this.scene);

            idleRes.animationGroups[0].targetedAnimations.forEach((ta: any) => {
                const bone = skeleton.bones.find(b => b.name === ta.target.name);
                const tNode = bone ? bone.getTransformNode() : null;

                if (tNode) {
                    // KUNCI: Jangan ambil posisi, ambil rotasi saja (In-Place)
                    if (ta.animation.targetProperty !== "position") {
                        remoteIdle.addTargetedAnimation(ta.animation, tNode);
                    }
                }
            });

            // Hentikan master agar tidak menjajah avatar lain
            idleRes.animationGroups.forEach(ag => ag.stop());

            // Jalankan Idle untuk pemain ini
            remoteIdle.play(true);

            // Masukkan ke daftar
            this.players.set(id, remoteAvatar);
            this.addNameTag(remoteAvatar, "Siswa-" + id.substring(0, 4));

            console.log(`Pemain ${id} berhasil dikarantina dengan animasi bersih.`);

        } catch (e) {
            console.error("Gagal membuat pemain lain:", e);
        }
    }
    private createInPlaceAnimation(sourceGroup: AnimationGroup, name: string, skeleton: any): AnimationGroup {
        const newGroup = new AnimationGroup(name, this.scene);

        sourceGroup.targetedAnimations.forEach((ta: any) => {
            const bone = skeleton.bones.find((b: any) => b.name === ta.target.name);
            const tNode = bone ? bone.getTransformNode() : null;

            if (tNode) {
                // JURUS SAKTI: Buang semua data posisi (Translation)
                // Ini yang bikin avatar tidak akan pernah teleportasi balik!
                if (ta.animation.targetProperty === "position") return;

                newGroup.addTargetedAnimation(ta.animation, tNode);
            }
        });
        return newGroup;
    }
    private addNameTag(mesh: Mesh, name: string) {
        // 1. Buat UI layer untuk menampung teks (Fullscreen UI)
        // Jika Anda sudah punya uiTexture untuk menu, bisa pakai itu, 
        // tapi untuk label pemain, biasanya kita buat satu yang khusus/permanen.
        const labelTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI_Labels");

        // 2. Buat blok teks
        const label = new TextBlock();
        label.text = name;
        label.color = "white";
        label.fontSize = 20;
        label.fontWeight = "bold";
        label.outlineWidth = 4;
        label.outlineColor = "black"; // Agar teks terbaca jelas di latar terang

        // 3. Masukkan ke UI Texture
        labelTexture.addControl(label);

        // 4. LOGIKA SAKTI: Hubungkan teks ke Mesh
        // Ini yang membuat teks melayang mengikuti gerakan avatar
        label.linkWithMesh(mesh);
        label.linkOffsetY = -150; // Jarak vertikal di atas kepala (sesuaikan dengan tinggi RPM)

        // Opsional: Hanya muncul jika pemain ada di depan kamera
        label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    }
    // private handleNetwork() {
    //     if (!this.socket) return;

    //     // 1. Saat baru masuk, ambil semua pemain yang sudah ada
    //     this.socket.on("currentPlayers", (players: any) => {
    //         Object.keys(players).forEach((id) => {
    //             if (id !== this.socket.id && !this.players.has(id)) {
    //                 const p = players[id];
    //                 // PANGGIL DENGAN 3 VARIABLE
    //                 this.createRemotePlayer(id, new Vector3(p.x, p.y, p.z), p.model);
    //             }
    //         });
    //     });

    //     // 2. Saat ada orang baru masuk (newPlayer)
    //     this.socket.on("newPlayer", (data: any) => {
    //         if (!this.players.has(data.id)) {
    //             // PANGGIL DENGAN 3 VARIABLE
    //             this.createRemotePlayer(data.id, new Vector3(data.x, data.y, data.z), data.model);
    //         }
    //     });

    //     // 3. Saat orang bergerak (userMoved)
    //     this.socket.on("userMoved", (data: any) => {
    //         const p = this.players.get(data.id);
    //         if (p) {
    //             p.position.set(data.x, data.y, data.z);
    //             if (data.rotation !== undefined) p.rotation.y = data.rotation;
    //         }
    //     });
    // }


    private handleNetwork() {
        if (!this.socket) return;

        // Mendapatkan Role untuk diri sendiri
        this.socket.on("assignRole", (data: { role: string }) => {
            const labelText = data.role === "guru" ? "SAYA (GURU)" : "SAYA (SISWA)";
            this.addNameTag(this.myAvatar, labelText);
            console.log("Role Anda adalah:", data.role);
        });

        // 1. Saat baru masuk, ambil semua pemain yang sudah ada
        // 1. Terima daftar orang yang sudah ada SEBELUM kita join
        this.socket.on("currentPlayers", (players: any) => {
            Object.keys(players).forEach((id) => {
                if (id !== this.socket.id && !this.players.has(id)) {
                    const p = players[id];
                    // Kirim p.role ke fungsi pembuat avatar
                    this.createRemotePlayer(id, new Vector3(p.x, p.y, p.z), p.model, p.role);
                }
            });
        });

        // 2. Dapatkan Role Pribadi
        this.socket.on("assignRole", (data: { role: string }) => {
            const label = data.role === "guru" ? "SAYA (GURU)" : "SAYA (SISWA)";
            this.addNameTag(this.myAvatar, label);
            if (data.role === "guru") this.myAvatar.scaling.scaleInPlace(1.1);
        });


        // 2. Saat ada orang baru masuk
        this.socket.on("newPlayer", (data: RemotePlayerData) => {
            if (!this.players.has(data.id)) {
                // this.createRemotePlayer(data.id, new Vector3(data.x, data.y, data.z), data.model);
                this.createRemotePlayer(data.id, new Vector3(data.x, data.y, data.z), data.model, data.role);
            }
        });

        // 3. INI BAGIAN KRUSIAL: Update posisi pemain lain
        // this.socket.on("userMoved", (data: any) => {
        //     const remotePlayer = this.players.get(data.id);
        //     if (remotePlayer) {
        //         // Update Posisi
        //         remotePlayer.position.set(data.x, data.y, data.z);

        //         // Update Rotasi (supaya dia tidak hadap depan terus)
        //         if (data.rotation !== undefined) {
        //             remotePlayer.rotation.y = data.rotation;
        //         }

        //         // TIPS: Jika ingin siswa lain juga terlihat jalan kakinya, 
        //         // kita harus trigger animasi jalan di sini juga nanti!
        //     }
        // });

        this.socket.on("userMoved", (data: any) => {
            const remote = this.players.get(data.id) as any;
            if (remote) {
                // 1. Update Posisi & Rotasi tetap jalan
                remote.position.set(data.x, data.y, data.z);
                if (data.rotation !== undefined) {
                    remote.rotation.y = data.rotation;
                }


                // 2. PROTEKSI SAKTI: Cek apakah objek animasi sudah ada sebelum panggil .isPlaying
                if (remote.walk && remote.idle) {
                    if (data.isMoving) {
                        if (!remote.walk.isPlaying) {
                            remote.idle.stop();
                            remote.walk.play(true);
                        }
                    } else {
                        if (!remote.idle.isPlaying) {
                            remote.walk.stop();
                            remote.idle.play(true);
                        }
                    }
                }
            }
        });
        // 4. Hapus jika keluar
        this.socket.on("userLeft", (id: string) => {
            const p = this.players.get(id);
            if (p) {
                p.dispose();
                this.players.delete(id);
            }
        });
    }
}