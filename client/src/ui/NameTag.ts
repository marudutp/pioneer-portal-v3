import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { Mesh } from "@babylonjs/core";

export class NameTag {
    public static Create(mesh: Mesh, text: string) {
        const adt = AdvancedDynamicTexture.CreateFullscreenUI("NameTagUI");
        const label = new TextBlock();
        label.text = text.toUpperCase();
        label.color = "white";
        label.fontSize = 18;
        label.outlineWidth = 2;
        label.outlineColor = "black";
        
        adt.addControl(label);
        label.linkWithMesh(mesh);
        label.linkOffsetY = -150;
    }
}