import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    Mesh,
    ActionManager,
    SceneLoader,
    ExecuteCodeAction
} from "@babylonjs/core";

import "@babylonjs/loaders";
import {
    AdvancedDynamicTexture,
    Button,
    Control,
    StackPanel,
    TextBlock
} from "@babylonjs/gui";

import { io, Socket } from "socket.io-client";

interface RemotePlayerData {
    id: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    model: string;
    role: string;
    isMoving: boolean;
}

export class ClassroomScene {

    private engine: Engine;
    public scene: Scene;
    private socket: Socket;

    private players: Map<string, Mesh> = new Map();
    private myAvatar!: Mesh;
    private inputMap: any = {};

    private uiTexture!: AdvancedDynamicTexture;

    constructor(canvas: HTMLCanvasElement) {

        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);

        this.socket = io("http://192.168.0.103:3000");

        this.setupCamera(canvas);
        this.createEnvironment();
        this.createAvatarMenu();

        this.engine.runRenderLoop(() => {
            if (this.myAvatar) {
                this.updateMovement();
            }
            this.scene.render();
        });

        window.addEventListener("resize", () => this.engine.resize());
    }

    // =========================
    // AVATAR INITIALIZATION
    // =========================

    private async initializeGame(modelName: string) {

        const result = await SceneLoader.ImportMeshAsync("", "./", modelName, this.scene);

        const root = result.meshes.find(m => !m.parent) as Mesh;

        this.myAvatar = root;
        this.myAvatar.name = "localPlayer";

        // 🔥 HAPUS quaternion root & child
        this.myAvatar.rotationQuaternion = null;
        this.myAvatar.getChildMeshes().forEach(m => m.rotationQuaternion = null);

        this.myAvatar.position.set(0, 0.1, 0);
        this.myAvatar.rotation.y = Math.PI;

        this.setupInput();

        const camera = this.scene.activeCamera as ArcRotateCamera;
        if (camera) camera.lockedTarget = this.myAvatar;

        this.handleNetwork();

        this.socket.emit("join", { avatarModel: modelName });
    }

    // =========================
    // UI MENU
    // =========================

    private createAvatarMenu() {

        this.uiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");

        const panel = new StackPanel();
        panel.width = "220px";
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.uiTexture.addControl(panel);

        const header = new TextBlock();
        header.text = "Pilih Avatar";
        header.height = "50px";
        header.color = "white";
        header.fontSize = 24;
        panel.addControl(header);

        const btn1 = Button.CreateSimpleButton("btn1", "Avatar A");
        this.styleButton(btn1);
        btn1.onPointerUpObservable.add(() => {
            this.uiTexture.dispose();
            this.initializeGame("avatar_a.glb");
        });
        panel.addControl(btn1);

        const btn2 = Button.CreateSimpleButton("btn2", "Avatar B");
        this.styleButton(btn2);
        btn2.onPointerUpObservable.add(() => {
            this.uiTexture.dispose();
            this.initializeGame("avatar_b.glb");
        });
        panel.addControl(btn2);
    }

    private styleButton(btn: Button) {
        btn.width = "200px";
        btn.height = "40px";
        btn.color = "white";
        btn.background = "#2ecc71";
        btn.cornerRadius = 10;
        btn.paddingBottom = "10px";
    }

    // =========================
    // CAMERA
    // =========================

    private setupCamera(canvas: HTMLCanvasElement) {
        const camera = new ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2.5,
            15,
            new Vector3(0, 0, 0),
            this.scene
        );
        camera.attachControl(canvas, true);
    }

    // =========================
    // ENVIRONMENT
    // =========================

    private async createEnvironment() {

        new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

        const result = await SceneLoader.ImportMeshAsync("", "./", "classroom.glb", this.scene);

        result.meshes.forEach(mesh => {
            mesh.scaling.setAll(0.2);
            mesh.checkCollisions = true;
        });

        const root = result.meshes[0];
        if (root) root.position.y = -0.9;
    }

    // =========================
    // INPUT
    // =========================

    private setupInput() {

        this.scene.actionManager = new ActionManager(this.scene);

        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyDownTrigger, evt => {
                this.inputMap[evt.sourceEvent.key.toLowerCase()] = true;
            })
        );

        this.scene.actionManager.registerAction(
            new ExecuteCodeAction(ActionManager.OnKeyUpTrigger, evt => {
                this.inputMap[evt.sourceEvent.key.toLowerCase()] = false;
            })
        );
    }

    // =========================
    // MOVEMENT (ANTI TERBALIK FIX)
    // =========================

    private updateMovement() {

        const speed = 0.1;
        let moved = false;
        let isMoving = false;

        if (this.inputMap["a"]) {
            this.myAvatar.rotation.y += 0.05;
            moved = true;
        }

        if (this.inputMap["d"]) {
            this.myAvatar.rotation.y -= 0.05;
            moved = true;
        }

        const forward = new Vector3(
            Math.sin(this.myAvatar.rotation.y),
            0,
            Math.cos(this.myAvatar.rotation.y)
        );

        if (this.inputMap["w"]) {
            this.myAvatar.position.addInPlace(forward.scale(speed));
            moved = true;
            isMoving = true;
        }

        if (this.inputMap["s"]) {
            this.myAvatar.position.subtractInPlace(forward.scale(speed));
            moved = true;
            isMoving = true;
        }

        if (moved) {
            this.socket.emit("move", {
                x: this.myAvatar.position.x,
                y: this.myAvatar.position.y,
                z: this.myAvatar.position.z,
                rotation: this.myAvatar.rotation.y,
                isMoving: isMoving
            });
        }
    }

    // =========================
    // NETWORK
    // =========================

    private handleNetwork() {

        this.socket.on("assignRole", (data: { role: string }) => {
            this.addNameTag(this.myAvatar, data.role.toUpperCase());
            if (data.role === "guru") {
                this.myAvatar.scaling.scaleInPlace(1.1);
            }
        });

        this.socket.on("currentPlayers", (players: any) => {
            Object.keys(players).forEach(id => {
                if (id !== this.socket.id && !this.players.has(id)) {
                    const p = players[id];
                    this.createRemotePlayer(id, p);
                }
            });
        });

        this.socket.on("newPlayer", (data: RemotePlayerData) => {
            if (!this.players.has(data.id)) {
                this.createRemotePlayer(data.id, data);
            }
        });

        this.socket.on("userMoved", (data: RemotePlayerData) => {

            const remote = this.players.get(data.id);
            if (!remote) return;

            remote.position.set(data.x, data.y, data.z);
            remote.rotation.y = data.rotation;
        });

        this.socket.on("userLeft", (id: string) => {
            const p = this.players.get(id);
            if (p) {
                p.dispose();
                this.players.delete(id);
            }
        });
    }

    // =========================
    // REMOTE PLAYER
    // =========================

    private async createRemotePlayer(id: string, data: RemotePlayerData) {

        const result = await SceneLoader.ImportMeshAsync("", "./", data.model, this.scene);

        const root = result.meshes.find(m => !m.parent) as Mesh;
        const remoteAvatar = root;

        remoteAvatar.rotationQuaternion = null;
        remoteAvatar.getChildMeshes().forEach(m => m.rotationQuaternion = null);

        remoteAvatar.position.set(data.x, data.y, data.z);
        remoteAvatar.rotation.y = data.rotation;

        if (data.role === "guru") {
            remoteAvatar.scaling.scaleInPlace(1.1);
        }

        this.players.set(id, remoteAvatar);
        this.addNameTag(remoteAvatar, data.role.toUpperCase());
    }

    // =========================
    // NAME TAG
    // =========================

    private addNameTag(mesh: Mesh, name: string) {

        const labelTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI_Labels");

        const label = new TextBlock();
        label.text = name;
        label.color = "white";
        label.fontSize = 20;
        label.outlineWidth = 4;
        label.outlineColor = "black";

        labelTexture.addControl(label);

        label.linkWithMesh(mesh);
        label.linkOffsetY = -150;
    }
}