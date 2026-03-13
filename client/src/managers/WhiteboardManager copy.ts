import * as BABYLON from "@babylonjs/core";
// GANTI YANG LAMA DENGAN INI:
import { ROLES, NETWORK_EVENTS } from "@shared/constants";

export class WhiteboardManager {
    private scene: BABYLON.Scene;
    private texture: BABYLON.DynamicTexture;
    private context: CanvasRenderingContext2D;
    private mesh: BABYLON.AbstractMesh;
    private network: any;

    constructor(scene: BABYLON.Scene, network: any) {
        this.scene = scene;
        this.network = network;

        // 1. Buat Papan Tulis (Mesh Plane)
        this.mesh = BABYLON.MeshBuilder.CreatePlane("whiteboard", { width: 8, height: 4.5 }, this.scene);
        this.mesh.position = new BABYLON.Vector3(0, 3, 5); // Taruh di depan kelas

        // 2. Buat Dynamic Texture (Resolusi 1024x512)
        this.texture = new BABYLON.DynamicTexture("wb-tex", { width: 1024, height: 512 }, this.scene);
        // this.context = this.texture.getContext();
        // Tambahkan 'as CanvasRenderingContext2D' di ujungnya
        this.context = this.texture.getContext() as CanvasRenderingContext2D;
        // 3. Tempel Texture ke Material
        const material = new BABYLON.StandardMaterial("wb-mat", this.scene);
        material.diffuseTexture = this.texture;
        material.backFaceCulling = false; // Biar kelihatan dari belakang (opsional)
        this.mesh.material = material;

        // Warnai putih bersih
        this.clearBoard(false);
        this.setupDrawing();
    }

    private setupDrawing() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            // Cek apakah yang diklik adalah papan tulis
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE && pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh === this.mesh) {

                const uv = pointerInfo.pickInfo.getTextureCoordinates();
                if (uv) {
                    const x = uv.x * 1024;
                    const y = (1 - uv.y) * 512; // Flip Y karena koordinat texture beda

                    this.drawPoint(x, y, "black", true); // Gambar lokal dan kirim ke network
                }
            }
        });
    }

    public drawPoint(x: number, y: number, color: string, shouldBroadcast: boolean) {
        this.context.fillStyle = color;
        this.context.fillRect(x, y, 5, 5); // Gambar kotak kecil 5px
        this.texture.update();

        if (shouldBroadcast) {
            this.network.sendDrawData({ x, y, color });
        }
    }

    // public clearBoard(shouldBroadcast: boolean) {
    //     this.context.fillStyle = "white";
    //     this.context.fillRect(0, 0, 1024, 512);
    //     this.texture.update();

    //     if (shouldBroadcast) {
    //         this.network.sendClearBoard();
    //     }
    // }
    // Di dalam class WhiteboardManager

    /**
     * Membersihkan papan tulis total, Ferguso!
     * @param shouldBroadcast Jika true, kirim perintah hapus ke seluruh kelas
     */
    public clearBoard(shouldBroadcast: boolean = true) {
        // 1. Ambil context dan warnai seluruh area jadi putih
        this.context.fillStyle = "white";
        this.context.fillRect(0, 0, 1024, 512);

        // 2. WAJIB: Update texture agar perubahan muncul di dunia 3D
        this.texture.update();

        // 3. Kirim ke jaringan jika ini aksi dari Guru lokal
        if (shouldBroadcast) {
            console.log("Menyapu papan tulis dan lapor ke server...");
            this.network.sendClearBoard();
        }
    }
    // Di dalam WhiteboardManager.ts

    // GURU: Mengambil foto papan tulis
    public getCanvasSnapshot(): string {
        return this.context.canvas.toDataURL("image/png");
    }

    // SISWA TELAT: Menimpa papan tulis dengan foto dari Guru
    public applySnapshot(base64Img: string) {
        const img = new Image();
        img.onload = () => {
            this.context.clearRect(0, 0, 1024, 512); // Bersihkan dulu
            this.context.drawImage(img, 0, 0);       // Gambar ulang
            this.texture.update();                  // Update texture Babylon
        };
        img.src = base64Img;
    }

}