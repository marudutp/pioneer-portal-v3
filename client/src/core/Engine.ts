import { Engine, Scene, HemisphericLight, Vector3 } from "@babylonjs/core";

export class GameEngine {
    public engine: Engine;
    public scene: Scene;

    constructor(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);
        this.setupLights();
        // --- LOGIKA ANTI STRETCH ---
        window.addEventListener("resize", () => {
            this.engine.resize();
        });
    }

    private setupLights() {
        const light = new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.7;
    }

    public start() {
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });
    }
}