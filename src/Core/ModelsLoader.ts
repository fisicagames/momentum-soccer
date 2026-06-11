import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
export class ModelsLoader {
    private static detachFromRoot(scene: Scene): void {
        const root = scene.getMeshByName("__root__");
        if (root) {
            root.getChildMeshes().forEach((mesh) => {
                // Verifica se o nome do mesh contém "_primitive"
                if (!mesh.name.includes("_primitive")) {
                    mesh.setParent(null);
                }
            });
            root.getChildTransformNodes().forEach((transformNode) => {
                // Verifica se o nome do transform node contém "_primitive"
                if (!transformNode.name.includes("_primitive")) {
                    transformNode.setParent(null);
                }
            });
            root.dispose();
        }
        
    }

    private static rotateRoot(scene: Scene): void {
        const root: AbstractMesh = scene.getMeshByName("__root__") as AbstractMesh;
        if (root) {
            root.rotation = new Vector3(0, 0, 0); // Define a rotação conforme necessário
        }
    }

    public static async loadModels(scene: Scene, filePath: string, fileName: string, rotateRoot: boolean = false, detachFromRoot: boolean = false): Promise<void> {
        await SceneLoader.AppendAsync(filePath, fileName, scene);
        // Opção: scene.useRightHandedSystem = true; // Use isso se a cena exigir um sistema de coordenadas de mão direita
        
        // Rotaciona o root, se necessário
        if (rotateRoot) {
            this.rotateRoot(scene);
        }

        // Desvincula os filhos do root, se necessário
        if (detachFromRoot) {
            this.detachFromRoot(scene);
        }
    }
}
