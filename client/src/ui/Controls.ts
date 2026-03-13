import { AdvancedDynamicTexture, StackPanel, Control, Button } from "@babylonjs/gui";

export class MobileControls {
    public static Create(inputMap: any) {
        const adt = AdvancedDynamicTexture.CreateFullscreenUI("MobileUI");
        const panel = new StackPanel();
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        panel.left = "20px"; panel.top = "-20px";
        adt.addControl(panel);

        const btn = (txt: string, key: string) => {
            const b = Button.CreateSimpleButton(txt, txt);
            b.width = "80px"; b.height = "80px"; b.background = "black"; b.alpha = 0.5;
            b.onPointerDownObservable.add(() => inputMap[key] = true);
            b.onPointerUpObservable.add(() => inputMap[key] = false);
            return b;
        };
        // Tambahkan tombol W, A, S, D ke panel di sini
    }
}