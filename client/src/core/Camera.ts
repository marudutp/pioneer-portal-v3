import { ArcRotateCamera, Vector3, Scene, Mesh } from "@babylonjs/core";

export class GameCamera {
    public camera: ArcRotateCamera;

    constructor(scene: Scene, canvas: HTMLCanvasElement) {
        this.camera = new ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 3,
            5,
            Vector3.Zero(),
            scene
        );
        this.camera.attachControl(canvas, true);
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 10;
    }

    public follow(target: Mesh) {
        this.camera.setTarget(target);
    }
}