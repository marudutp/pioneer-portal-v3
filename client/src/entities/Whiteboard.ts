import { Mesh, MeshBuilder, StandardMaterial, DynamicTexture, Vector3, PointerEventTypes, Color3, Scene, Ray } from "@babylonjs/core";

export class Whiteboard {
    private mesh: Mesh;
    private texture: DynamicTexture;
    private context: CanvasRenderingContext2D;
    private isDrawing: boolean = false;
    private color: string = "#000000";
    private brushSize: number = 6;
    private laser: Mesh;

    // Tambahkan variabel state untuk melacak posisi terakhir
    // private lastX: number | null = null;
    // private lastY: number | null = null;
    private textureSize: number = 2048;

    constructor(private scene: Scene, position: Vector3, private role: string, private onDraw?: (data: any) => void) {
        // 1. Buat Papan (Gunakan Box tipis agar solid tapi tetap akurat)
        this.mesh = MeshBuilder.CreateBox("whiteboard", { width: 8, height: 4.5, depth: 0.05 }, scene);
        this.mesh.position = position;

        // 2. Texture Setup
        this.texture = new DynamicTexture("whiteboardTexture", this.textureSize, scene, true); // Pastikan 'true'
        // this.texture = new DynamicTexture("whiteboardTexture", this.textureSize, scene, false);
        this.context = this.texture.getContext() as CanvasRenderingContext2D;


        // Background Putih
        this.context.fillStyle = "white";
        this.context.fillRect(0, 0, this.textureSize, this.textureSize);
        this.texture.update();

        // 3. Material (Gunakan Emissive agar Putih Terang)
        const mat = new StandardMaterial("boardMat", scene);
        mat.diffuseTexture = this.texture;
        mat.emissiveColor = new Color3(1, 1, 1); // Papan putih bersinar
        mat.specularColor = new Color3(0, 0, 0); // Tanpa pantulan silau
        this.mesh.material = mat;

        // 4. Laser Pointer
        this.laser = MeshBuilder.CreateSphere("laser", { diameter: 0.1 }, scene);
        const laserMat = new StandardMaterial("laserMat", scene);
        laserMat.emissiveColor = Color3.Red();
        this.laser.material = laserMat;
        this.laser.isPickable = false;
        this.laser.setEnabled(false);

        this.setupInteractions();
    }

    // Whiteboard.ts

// Tambahkan lastX dan lastY sebagai class member
private lastX: number | null = null;
private lastY: number | null = null;

private setupInteractions() {
    const camera = this.scene.activeCamera;
    const canvas = this.scene.getEngine().getRenderingCanvas();

    this.scene.onPointerObservable.add((pointerInfo) => {
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);

        // Jika tidak mengenai papan tulis
        if (!pick || !pick.hit || pick.pickedMesh !== this.mesh) {
            this.laser.setEnabled(false);
            if (this.isDrawing) this.stopDrawing(camera, canvas);
            return;
        }

        const uv = pick.getTextureCoordinates();
        if (!uv) return;

        const x = uv.x * this.textureSize;
        const y = (1 - uv.y) * this.textureSize;

        // Update visual Laser
        this.laser.setEnabled(true);
        this.laser.position.copyFrom(pick.pickedPoint!);
        this.laser.position.z -= 0.1;

        if (this.role === "guru") {
            switch (pointerInfo.type) {
                case PointerEventTypes.POINTERDOWN:
                    this.isDrawing = true;
                    if (camera && canvas) camera.detachControl();
                    // Set titik awal
                    this.lastX = x;
                    this.lastY = y;
                    break;

                case PointerEventTypes.POINTERMOVE:
                    if (!this.isDrawing) return;
                    
                    if (this.lastX !== null && this.lastY !== null) {
                        // Gambar di layar lokal Guru
                        this.drawLocally(this.lastX, this.lastY, x, y, this.color, this.brushSize);

                        // Kirim paket data garis lengkap (x1, y1, x2, y2) ke Server
                        if (this.onDraw) {
                            this.onDraw({
                                x1: this.lastX,
                                y1: this.lastY,
                                x2: x,
                                y2: y,
                                color: this.color,
                                size: this.brushSize
                            });
                        }
                    }
                    // Update posisi terakhir untuk frame berikutnya
                    this.lastX = x;
                    this.lastY = y;
                    break;

                case PointerEventTypes.POINTERUP:
                    this.stopDrawing(camera, canvas);
                    break;
            }
        }
    });
}

// Fungsi gambar yang sekarang menerima koordinat awal dan akhir
public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    const ctx = this.context;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    this.texture.update();
}

private stopDrawing(camera: any, canvas: any) {
    this.isDrawing = false;
    this.lastX = null;
    this.lastY = null;
    if (camera && canvas) camera.attachControl(canvas, true);
}

    // private setupInteractions() {
    //     const camera = this.scene.activeCamera;
    //     const canvas = this.scene.getEngine().getRenderingCanvas();

    //     this.scene.onPointerObservable.add((pointerInfo) => {
    //         // Gunakan scene.pick untuk akurasi tinggi seperti di kode HTML tadi
    //         const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);

    //         if (!pick || !pick.hit || pick.pickedMesh !== this.mesh) {
    //             this.laser.setEnabled(false);
    //             // Jika mouse keluar dari papan saat menggambar, anggap berhenti
    //             if (this.isDrawing) this.stopDrawing(camera, canvas);
    //             return;
    //         }

    //         const uv = pick.getTextureCoordinates();
    //         if (!uv) return;

    //         const x = uv.x * this.textureSize;
    //         const y = (1 - uv.y) * this.textureSize;

    //         // Update Laser (Tampil untuk semua role)
    //         this.laser.setEnabled(true);
    //         this.laser.position.copyFrom(pick.pickedPoint!);
    //         this.laser.position.z += 0.05; // Maju sedikit dari papan

    //         if (this.role === "guru") {
    //             switch (pointerInfo.type) {
    //                 case PointerEventTypes.POINTERDOWN:
    //                     this.isDrawing = true;
    //                     if (camera && canvas) camera.detachControl();
    //                     this.lastX = x;
    //                     this.lastY = y;
    //                     this.drawLocally(x, y, "start");
    //                     break;

    //                 case PointerEventTypes.POINTERMOVE:
    //                     if (!this.isDrawing) return;
    //                     this.drawLocally(x, y, "move");
    //                     break;

    //                 case PointerEventTypes.POINTERUP:
    //                     this.stopDrawing(camera, canvas);
    //                     break;
    //             }
    //         }
    //     });
    // }

    // private stopDrawing(camera: any, canvas: any) {
    //     this.isDrawing = false;
    //     this.lastX = null;
    //     this.lastY = null;
    //     if (camera && canvas) camera.attachControl(canvas, true);
    // }

    // public drawLocally(x: number, y: number, type: string, color?: string, size?: number) {
    //     const drawColor = color || this.color;
    //     const drawSize = size || this.brushSize;

    //     if (type === "start") {
    //         this.lastX = x;
    //         this.lastY = y;
    //         return;
    //     }

    //     if (this.lastX !== null && this.lastY !== null) {
    //         this.context.strokeStyle = drawColor;
    //         this.context.lineWidth = drawSize;
    //         this.context.lineCap = "round";
    //         this.context.lineJoin = "round";

    //         this.context.beginPath();
    //         this.context.moveTo(this.lastX, this.lastY);
    //         this.context.lineTo(x, y);
    //         this.context.stroke();

    //         this.texture.update();

    //         // Update posisi terakhir untuk garis berikutnya
    //         this.lastX = x;
    //         this.lastY = y;
    //     }

    //     if (this.onDraw && this.role === "guru") {
    //         this.onDraw({ x, y, type, color: drawColor, size: drawSize });
    //     }
    // }


    // src/entities/Whiteboard.ts

    // ... (bagian constructor tetap sama) ...

    // Ganti fungsi drawLocally dengan versi "Duo-Coordinate"
    // public drawLocally(x1: number, y1: number, x2: number, y2: number, color: string, size: number) {
    //     const ctx = this.context;

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

    // Fungsi tambahan lainnya (setColor, useEraser, dll) tetap sama
    public setPenColor(newColor: string) { console.log("Mengganti warna spidol ke:", newColor); this.color = newColor; this.brushSize = 5; }
    public useEraser() { this.color = "white"; this.brushSize = 50; }
    public saveImage() {
        const link = document.createElement('a');
        link.download = 'pioneer-notes.png';
        link.href = this.texture.getContext().canvas.toDataURL("image/png");
        link.click();
    }
}

// }