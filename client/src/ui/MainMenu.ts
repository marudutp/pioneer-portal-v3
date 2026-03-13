import { AdvancedDynamicTexture, Button, StackPanel, Control } from "@babylonjs/gui";

export class MainMenu {
    private ui: AdvancedDynamicTexture;

    constructor(onSelect: (model: string) => void) {
        this.ui = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        
        const panel = new StackPanel();
        this.ui.addControl(panel);

        const btnA = Button.CreateSimpleButton("btnA", "Pilih Avatar A");
        btnA.width = "200px"; btnA.height = "40px"; btnA.color = "white"; btnA.background = "blue";
        btnA.onPointerUpObservable.add(() => {
            this.ui.dispose();
            onSelect("avatarA.glb");
        });

        const btnB = Button.CreateSimpleButton("btnB", "Pilih Avatar B");
        btnB.width = "200px"; btnB.height = "40px"; btnB.color = "white"; btnB.background = "green";
        btnB.onPointerUpObservable.add(() => {
            this.ui.dispose();
            onSelect("avatarB.glb");
        });

        panel.addControl(btnA);
        panel.addControl(btnB);
    }
}