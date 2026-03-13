import { AdvancedDynamicTexture, Button, StackPanel, Control } from "@babylonjs/gui";
import { Whiteboard } from "../entities/Whiteboard";

export class WhiteboardUI {
    constructor(whiteboard: Whiteboard, role: string) {
        const adt = AdvancedDynamicTexture.CreateFullscreenUI("BoardUI");
        
        const panel = new StackPanel();
        panel.width = "100px";
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        adt.addControl(panel);

        if (role === "guru") {
            // Tombol Warna
            ["#000000", "#ff0000", "#0000ff", "#00ff00"].forEach(color => {
                const btn = Button.CreateSimpleButton("btn", "");
                btn.height = "40px"; btn.width = "40px";
                btn.background = color;
                btn.onPointerUpObservable.add(() => whiteboard.setPenColor(color));
                panel.addControl(btn);
            });

            // Tombol Penghapus
            const eraseBtn = Button.CreateSimpleButton("erase", "ERASER");
            eraseBtn.height = "40px"; eraseBtn.background = "gray";
            eraseBtn.onPointerUpObservable.add(() => whiteboard.useEraser());
            panel.addControl(eraseBtn);
        }

        // Tombol Save (Muncul di Guru & Siswa)
        const saveBtn = Button.CreateSimpleButton("save", "SAVE");
        saveBtn.height = "40px"; saveBtn.background = "orange";
        saveBtn.onPointerUpObservable.add(() => whiteboard.saveImage());
        panel.addControl(saveBtn);
    }
}