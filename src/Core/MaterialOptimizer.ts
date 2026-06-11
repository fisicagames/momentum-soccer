import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

//How to use:
//const materialNames = ["MaterialX.00X", "MaterialY.00Y"]; 
//optimizeMaterials(this._scene, materialNames);
export function optimizeMaterials(scene: Scene, materialNames: string[]): void {
    scene.meshes.forEach(mesh => {
        if (mesh.material && materialNames.includes(mesh.material.name)) {
            mesh.receiveShadows = false;
                // mesh.getLODLevels().forEach(lod => {
                //     if (lod.mesh) {
                //         lod.mesh.receiveShadows = false;
                //     }
                // });
        }
    });

    materialNames.forEach(materialName => {
        const material = scene.getMaterialByName(materialName) as PBRMaterial;
        if (material) {
            material.disableLighting = true;
            material.reflectionTexture = null;
            material.refractionTexture = null;
            material.subSurface.isRefractionEnabled = false;
            material.subSurface.isTranslucencyEnabled = false;
            material.subSurface.isScatteringEnabled = false;
            material.clearCoat.isEnabled = false;
            material.needDepthPrePass = false;
            //Adjust intensities as needed:
            material.environmentIntensity = 0.5;
            material.specularIntensity = 0.5;
        }
    });
}
