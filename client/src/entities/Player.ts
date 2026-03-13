import { Mesh, AnimationGroup, Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";

export abstract class Player {
    public mesh: Mesh;
    public idleAnim?: AnimationGroup;
    public walkAnim?: AnimationGroup;

    constructor(protected scene: Scene, mesh: Mesh, public id: string, public role: string) {
        this.mesh = mesh;
        this.mesh.rotationQuaternion = null; // Agar bisa rotasi Y manual
    }

    public setupNameTag(ui: AdvancedDynamicTexture) {
        const label = new TextBlock();
        label.text = this.role.toUpperCase();
        label.color = "white";
        label.fontSize = 20;
        ui.addControl(label);
        label.linkWithMesh(this.mesh);
        label.linkOffsetY = -150;
    }

    public animate(isMoving: boolean) {
        if (!this.idleAnim || !this.walkAnim) return;
        if (isMoving) {
            if (!this.walkAnim.isPlaying) {
                this.idleAnim.stop();
                this.walkAnim.play(true);
            }
        } else {
            if (!this.idleAnim.isPlaying) {
                this.walkAnim.stop();
                this.idleAnim.play(true);
            }
        }
    }
}