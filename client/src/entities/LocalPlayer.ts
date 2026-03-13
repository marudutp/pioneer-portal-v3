import { Mesh, Scene, Vector3, AnimationGroup } from "@babylonjs/core";
import { Player } from "./Player"; // Asumsi Base Class ada

export class LocalPlayer extends Player {
    private inputMap: any = {};

    constructor(scene: Scene, mesh: Mesh, id: string, role: string) {
        super(scene, mesh, id, role);
        this.setupInput();
    }

    private setupInput() {
        this.scene.onKeyboardObservable.add((kbInfo) => {
            this.inputMap[kbInfo.event.key.toLowerCase()] = kbInfo.type === 1; // 1 = Keydown, 2 = Keyup
        });
    }

    public update(onMove: (data: any) => void) {
        const speed = 0.1;
        let moved = false;

        if (this.inputMap["w"]) {
            this.mesh.position.z += speed;
            this.mesh.rotation.y = Math.PI; // Hadap Depan
            moved = true;
        } else if (this.inputMap["s"]) {
            this.mesh.position.z -= speed;
            this.mesh.rotation.y = 0; // Hadap Belakang
            moved = true;
        }

        if (this.inputMap["a"]) {
            this.mesh.position.x -= speed;
            this.mesh.rotation.y = Math.PI / 2;
            moved = true;
        } else if (this.inputMap["d"]) {
            this.mesh.position.x += speed;
            this.mesh.rotation.y = -Math.PI / 2;
            moved = true;
        }

        this.animate(moved);

        if (moved) {
            onMove({
                x: this.mesh.position.x,
                y: this.mesh.position.y,
                z: this.mesh.position.z,
                rotation: this.mesh.rotation.y,
                isMoving: true
            });
        }
    }
}