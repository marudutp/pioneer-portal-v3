import { Mesh, Scene, Vector3 } from "@babylonjs/core";
import { Player } from "./Player";

export class RemotePlayer extends Player {
    constructor(scene: Scene, mesh: Mesh, id: string, role: string) {
        super(scene, mesh, id, role);
    }

    public updateFromNetwork(data: any) {
        this.mesh.position.set(data.x, data.y, data.z);
        this.mesh.rotation.y = data.rotation;
        this.animate(data.isMoving);
    }
}