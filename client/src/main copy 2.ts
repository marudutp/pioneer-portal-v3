/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Mesh, ISceneLoaderAsyncResult, Vector3 } from "@babylonjs/core";
import { GameEngine } from "./core/Engine";
import { GameCamera } from "./core/Camera";
import { NetworkManager } from "./core/NetworkManager";
import { MainMenu } from "./ui/MainMenu";
import { WhiteboardUI } from "./ui/WhiteboardUI"; // Pastikan import ini ada
import { AssetLoader } from "./utils/AssetLoader";
import { LocalPlayer } from "./entities/LocalPlayer";
import { RemotePlayer } from "./entities/RemotePlayer";
import { Whiteboard } from "./entities/Whiteboard";

async function startProject() {
    // 1. Inisialisasi Dasar
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    if (!canvas) return;

    const game = new GameEngine(canvas);
    const camera = new GameCamera(game.scene, canvas);

    // Variabel penampung state
    let myRole = "siswa";
    let board: Whiteboard;
    const remotePlayers = new Map<string, RemotePlayer>();

    // 2. Inisialisasi Network dengan Callback
    const network = new NetworkManager({
        onRoleAssigned: (role: string) => {
            myRole = role;
            console.log("Konfirmasi Role dari Server:", myRole);

            // Inisialisasi Whiteboard SETELAH role diketahui
            // board = new Whiteboard(game.scene, new Vector3(0, 2, -7), myRole, (drawData) => {
            //     network.socket.emit("drawData", drawData);
            // });

            // Majukan sedikit dari tembok belakang agar tidak "tenggelam"
            // board = new Whiteboard(game.scene, new Vector3(0, 3, -11.9), myRole, (data) => {
            //     network.socket.emit("drawData", data);
            // });

            board = new Whiteboard(game.scene, new Vector3(0, 3, -11.9), myRole, (data) => {
                // Guru mengirim data ke server
                network.socket.emit("drawData", data);
            });

            // Inisialisasi UI khusus Whiteboard (Save untuk semua, Spidol untuk Guru)
            new WhiteboardUI(board, myRole);
        },
        onSync: (players: any) => {
            Object.values(players).forEach((data: any) => {
                if (data.id !== network.socket.id && !remotePlayers.has(data.id)) {
                    createRemotePlayer(data, game.scene, remotePlayers);
                }
            });
        },
        onPlayerJoin: (data: any) => {
            if (!remotePlayers.has(data.id)) {
                createRemotePlayer(data, game.scene, remotePlayers);
            }
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

    // Listener untuk menerima coretan dari pemain lain (Guru)
    // network.socket.on("remoteDraw", (data: any) => {
    //     console.log("Siswa menerima data gambar:", data); // Tambahkan log ini
    //     if (board) {
    //         board.drawLocally(data.x, data.y, data.type, data.color, data.size);
    //     }
    // });
    // Listener untuk Siswa menerima data coretan dari Guru
    network.socket.on("remoteDraw", (data: any) => {
        if (board) {
            // Menerima paket x1, y1, x2, y2
            board.drawLocally(data.x1, data.y1, data.x2, data.y2, data.color, data.size);
        }
    });

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
            // const myPlayer = new LocalPlayer(game.scene, avatarMesh, network.socket.id, myRole);
            const myPlayer = new LocalPlayer(game.scene, avatarMesh, (network.socket as any).id, myRole);
            // Beritahu Server kita bergabung dan minta Role
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
 * Helper untuk membuat pemain lain di layar secara asinkron
 */
async function createRemotePlayer(data: any, scene: any, map: Map<string, RemotePlayer>) {
    try {
        const res = (await AssetLoader.LoadAvatar(data.model, scene)) as ISceneLoaderAsyncResult;
        if (res.meshes && res.meshes.length > 0) {
            const mesh = res.meshes[0] as Mesh;
            mesh.rotationQuaternion = null;

            const remote = new RemotePlayer(scene, mesh, data.id, data.role);
            remote.updateFromNetwork(data);
            map.set(data.id, remote);
            console.log(`Pemain lain bergabung: ${data.id} sebagai ${data.role}`);
        }
    } catch (err) {
        console.error("Gagal memuat pemain remote:", err);
    }
}

// Jalankan aplikasi
startProject().catch(console.error);