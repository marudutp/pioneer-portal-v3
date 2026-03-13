import { SceneLoader, Scene, Mesh, ISceneLoaderAsyncResult } from "@babylonjs/core";
import "@babylonjs/loaders";

export class AssetLoader {
    public static async LoadAvatar(modelName: string, scene: Scene): Promise<ISceneLoaderAsyncResult> {
        // Memuat file glb dari folder public
        return await SceneLoader.ImportMeshAsync("", "./", modelName, scene);
    }

    public static async LoadEnvironment(scene: Scene) {
        const result = await SceneLoader.ImportMeshAsync("", "./", "classroom.glb", scene);
        result.meshes.forEach(m => {
            m.scaling.setAll(0.2); // Sesuai skala auditorium Anda
            m.checkCollisions = true;
        });
        if (result.meshes[0]) result.meshes[0].position.y = -0.9;
    }
}