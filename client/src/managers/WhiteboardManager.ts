import * as BABYLON from "@babylonjs/core";
import { ROLES } from "@shared/constants";

export class WhiteboardManager {
    private scene: BABYLON.Scene;
    private texture: BABYLON.DynamicTexture;
    private context: CanvasRenderingContext2D;
    private mesh: BABYLON.AbstractMesh;
    private network: any;
    private isDrawing = false;
    // private lastX: number = 0;
    // private lastY: number = 0;
    private lastX: number | null = null;
    private lastY: number | null = null;
    // private context: CanvasRenderingContext2D;
    private currentColor: string = "black";
    private currentSize: number = 8; // Pertebal spidol jadi 8

    constructor(scene: BABYLON.Scene, network: any, role: string) {
        this.scene = scene;
        this.network = network;

        // 1. GUNAKAN BOX TIPIS (Bukan Plane) agar lebih stabil dideteksi
        this.mesh = BABYLON.MeshBuilder.CreateBox("whiteboard", { width: 16, height: 9, depth: 0.1 }, this.scene);

        // 2. POSISI: Majukan lebih berani (Z: -14.5) agar tidak Z-Fighting
        this.mesh.position = new BABYLON.Vector3(0, 5, -14.5);

        // 3. PRIORITAS KLIK: Pakai renderingGroupId agar dihitung paling depan
        this.mesh.renderingGroupId = 1;
        this.mesh.isPickable = true;
        this.mesh.checkCollisions = true;

        // 4. SETUP TEXTURE
        this.texture = new BABYLON.DynamicTexture("wb-tex", { width: 2048, height: 1024 }, this.scene);
        this.context = this.texture.getContext() as CanvasRenderingContext2D;

        // WARNAI KUNING DULU (Untuk Tes): Kalau papannya nggak warna kuning di layar, berarti dia ketutup tembok!
        this.context.fillStyle = "yellow";
        this.context.fillRect(0, 0, 2048, 1024);
        this.texture.update();

        const mat = new BABYLON.StandardMaterial("wb-mat", this.scene);
        mat.diffuseTexture = this.texture;
        // BIAR TERANG: Tambahkan Emissive agar tidak terpengaruh bayangan
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        this.mesh.material = mat;

        // 3. Hanya GURU yang bisa mengaktifkan logika menggambar
        if (role === ROLES.TEACHER) {
            this.setupDrawing();
        }
    }

    // private setupDrawing() {
    //     this.scene.onPointerObservable.add((pointerInfo) => {
    //         if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
    //             if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh === this.mesh) {
    //                 this.isDrawing = true;
    //             }
    //         }
    //         if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE && this.isDrawing) {
    //             const uv = pointerInfo.pickInfo?.getTextureCoordinates();
    //             if (uv) {
    //                 const x = uv.x * 1024;
    //                 const y = (1 - uv.y) * 512;
    //                 this.drawPoint(x, y, "black", true);
    //             }
    //         }
    //         if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
    //             this.isDrawing = false;
    //         }
    //     });
    // }
    public setSpidolColor(color: string) {
        this.currentColor = color;
        console.log("🎨 Warna spidol sekarang:", this.currentColor);
    }

    // WhiteboardManager.ts

    // src/client/managers/WhiteboardManager.ts

    private setupDrawing() {

    this.scene.onPointerObservable.add((pointerInfo) => {

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {

            const pick = this.scene.pick(
                this.scene.pointerX,
                this.scene.pointerY
            );

            if (pick?.hit && pick.pickedMesh === this.mesh) {

                this.isDrawing = true;

                if (this.scene.activeCamera) {
                    const canvas = this.scene.getEngine().getRenderingCanvas();
                    this.scene.activeCamera.detachControl(canvas);
                }

                const uv = pick.getTextureCoordinates();

                if (!uv) return;

                this.lastX = uv.x * 2048;
                this.lastY = (1 - uv.y) * 1024;
            }
        }

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE && this.isDrawing) {

            const pick = this.scene.pick(
                this.scene.pointerX,
                this.scene.pointerY
            );

            if (!pick?.hit || pick.pickedMesh !== this.mesh) return;

            const uv = pick.getTextureCoordinates();
            if (!uv) return;

            const currentX = uv.x * 2048;
            const currentY = (1 - uv.y) * 1024;

            if (this.lastX !== null && this.lastY !== null) {

                this.drawLocally(
                    this.lastX,
                    this.lastY,
                    currentX,
                    currentY,
                    this.currentColor,
                    this.currentSize
                );
                this.network.sendDrawData({
                        x1: this.lastX, y1: this.lastY,
                        x2: currentX, y2: currentY,
                        color: this.currentColor,
                        size: this.currentSize
                    });
            }

            this.lastX = currentX;
            this.lastY = currentY;
        }

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {

            this.isDrawing = false;

            this.lastX = null;
            this.lastY = null;

            if (this.scene.activeCamera) {
                const canvas = this.scene.getEngine().getRenderingCanvas();
                this.scene.activeCamera.attachControl(canvas, true);
            }
        }

    });
}
    // Fungsi gambar garis (Siswa & Guru pakai fungsi yang sama)
    // public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    //     const ctx = this.context;
    //     if (!ctx) return;

    //     ctx.strokeStyle = color;
    //     ctx.lineWidth = size;
    //     ctx.lineCap = "round";  // Biar gak bintik-bintik
    //     ctx.lineJoin = "round"; // Biar tekukan garis mulus

    //     ctx.beginPath();
    //     ctx.moveTo(x1, y1);
    //     ctx.lineTo(x2, y2);
    //     ctx.stroke();

    //     this.texture.update(); // Update tampilan 3D
    // }
    public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {

        // const ctx = this.texture.getContext();
        const ctx = this.texture.getContext() as CanvasRenderingContext2D;
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        console.log("DRAW", x1, y1, x2, y2);
        this.texture.update();
    }




    public drawPoint(x: number, y: number, color: string, shouldBroadcast: boolean) {
        this.context.fillStyle = color;
        this.context.fillRect(x, y, 5, 5);
        this.texture.update();

        if (shouldBroadcast) {
            this.network.sendDrawData({ x, y, color });
        }
    }

    public clearBoard(shouldBroadcast: boolean = true) {
        // Gunakan resolusi penuh 2048x1024 agar tidak ada sisa warna kuning
        this.context.fillStyle = "white";
        this.context.fillRect(0, 0, 2048, 1024);
        this.texture.update();

        if (shouldBroadcast) {
            this.network.sendClearBoard();
        }
    }

    public getCanvasSnapshot(): string {
        return this.context.canvas.toDataURL("image/png");
    }

    public applySnapshot(base64Img: string) {
        const img = new Image();
        img.onload = () => {
            // Gunakan resolusi penuh 2048x1024
            this.context.clearRect(0, 0, 2048, 1024);
            this.context.drawImage(img, 0, 0, 2048, 1024);
            this.texture.update();
        };
        img.src = base64Img;
    }

    // src/client/managers/WhiteboardManager.ts

    // Tambahkan/Update fungsi ini di dalam class
    // public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    //     this.context.beginPath();
    //     this.context.strokeStyle = color;
    //     this.context.lineWidth = size;
    //     this.context.lineCap = "round"; // Biar ujung garisnya melingkar mulus
    //     this.context.moveTo(x1, y1);
    //     this.context.lineTo(x2, y2);
    //     this.context.stroke();
    //     this.texture.update();
    // }
    // public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    //     const ctx = this.context;
    //     if (!ctx) return;
    //     ctx.strokeStyle = color;
    //     ctx.lineWidth = size;
    //     ctx.lineCap = "round";
    //     ctx.lineJoin = "round";

    //     ctx.beginPath();
    //     ctx.moveTo(x1, y1);
    //     ctx.lineTo(x2, y2);
    //     ctx.stroke();

    //     this.texture.update();
    // }
}