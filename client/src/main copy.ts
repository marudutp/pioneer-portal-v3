/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Mesh, ISceneLoaderAsyncResult,Vector3 } from "@babylonjs/core";
import { GameEngine } from "./core/Engine";
import { GameCamera } from "./core/Camera";
import { NetworkManager } from "./core/NetworkManager";
import { MainMenu } from "./ui/MainMenu";
import { AssetLoader } from "./utils/AssetLoader";
import { LocalPlayer } from "./entities/LocalPlayer";
import { RemotePlayer } from "./entities/RemotePlayer";
import { Whiteboard } from "./entities/Whiteboard";
import { WhiteboardUI } from "./ui/WhiteboardUI";

async function startProject() {
    // 1. Inisialisasi Dasar
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    if (!canvas) return;

    const game = new GameEngine(canvas);
    const camera = new GameCamera(game.scene, canvas);

    // Simpan daftar pemain lain di sini
    const remotePlayers = new Map<string, RemotePlayer>();

    // Variabel penampung state
    let myRole = "siswa"; 

    // 2. Inisialisasi Network dengan Callback
    const network = new NetworkManager({
        onRoleAssigned: (role: string) => {
            console.log("Anda masuk sebagai:", role);
        },
        onSync: (players: any) => {
            // Logika sinkronisasi pemain yang sudah ada di kelas
            Object.values(players).forEach((data: any) => {
                if (data.id !== network.socket.id) {
                    createRemotePlayer(data, game.scene, remotePlayers);
                }
            });
        },
        onPlayerJoin: (data: any) => {
            createRemotePlayer(data, game.scene, remotePlayers);
        },
        onMove: (data: any) => {
            const player = remotePlayers.get(data.id);
            if (player) player.updateFromNetwork(data);
        },
        onLeave: (id: string) => {
            const player = remotePlayers.get(id);
            if (player) {
                player.mesh.dispose();
                remotePlayers.delete(id);
            }
        }

    });
    // Saat inisialisasi Whiteboard
    // const board = new Whiteboard(game.scene, new Vector3(0, 5, 10), myRole, (data) => {
    //     network.socket.emit("drawData", data);
    // });

    // Listener untuk Siswa menerima coretan Guru
    // network.socket.on("remoteDraw", (data) => {
    //     board.drawLocally(data.x, data.y, data.type, data.color, data.size);
    // });

    // // Panggil UI
    // new WhiteboardUI(board, myRole);

    // 3. Jalankan Menu Utama
    new MainMenu(async (selectedModel: string) => {
        // A. Load Environment
        await AssetLoader.LoadEnvironment(game.scene);

        // B. Load Avatar Lokal
        const result = (await AssetLoader.LoadAvatar(selectedModel, game.scene)) as ISceneLoaderAsyncResult;

        if (result.meshes && result.meshes.length > 0) {
            const avatarMesh = result.meshes[0] as Mesh;
            avatarMesh.rotationQuaternion = null;

            // Buat Instance LocalPlayer
            const myPlayer = new LocalPlayer(game.scene, avatarMesh, network.socket.id, "pending");

            // Beritahu Server kita bergabung
            network.joinGame(selectedModel);

            // Kamera mengikuti kita
            camera.follow(myPlayer.mesh);

            // C. Game Loop (Update Gerakan & Kirim ke Network)
            game.scene.registerBeforeRender(() => {
                myPlayer.update((moveData) => {
                    network.sendUpdate(
                        { x: moveData.x, y: moveData.y, z: moveData.z },
                        moveData.rotation,
                        moveData.isMoving
                    );
                });
            });
        }
    });

    // Mulai Render Loop
    game.start();
}

/**
 * Helper untuk membuat pemain lain di layar
 */
async function createRemotePlayer(data: any, scene: any, map: Map<string, RemotePlayer>) {
    const res = (await AssetLoader.LoadAvatar(data.model, scene)) as ISceneLoaderAsyncResult;
    if (res.meshes && res.meshes.length > 0) {
        const mesh = res.meshes[0] as Mesh;
        const remote = new RemotePlayer(scene, mesh, data.id, data.role);
        remote.updateFromNetwork(data); // Set posisi awal
        map.set(data.id, remote);
    }
}

// Jalankan aplikasi
startProject().catch(console.error);