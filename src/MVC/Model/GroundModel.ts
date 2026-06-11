import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export class GroundModel {
    private scene: Scene;
    private width: number;
    private height: number;

    // Adicionados parâmetros width e height (padrão 14x28 para proporção 1:2)
    constructor(scene: Scene, width: number = 14, height: number = 28) {
        this.scene = scene;
        this.width = width;
        this.height = height; // No Ground do Babylon.js, 'height' é a profundidade (Eixo Z)
        this.createGround();
    }

    private createGround(): void {
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        // Limites mantendo a proporção estética original
        const lineLimitX = halfW - 1;
        const lineLimitZ = halfH - 1;
        const borderX = halfW - 2;
        const borderZ = halfH - 2;
        const markerX = halfW - 3;
        const markerZ = halfH - 3;

        /* ════════════════════════════════════════════════════════
               FLOOR  (circuit-board grid aesthetic)
        ════════════════════════════════════════════════════════ */
        const gnd = MeshBuilder.CreateGround("gnd", { width: this.width, height: this.height }, this.scene);
        const gndMat = new StandardMaterial("gm", this.scene);
        gndMat.diffuseColor = new Color3(0.03, 0.04, 0.10);
        gndMat.specularColor = new Color3(0.06, 0.08, 0.20);
        gndMat.specularPower = 80;
        gnd.material = gndMat;

        // Fine grid
        const gridC = new Color3(0.03, 0.18, 0.35);
        
        // Linhas Horizontais (ao longo do eixo X, variando em Z)
        const stepsZ = Math.floor(lineLimitZ / 2);
        for (let i = -stepsZ; i <= stepsZ; i++) {
            const z = i * 2;
            const h = MeshBuilder.CreateLines("gh" + i, {
                points:[
                    new Vector3(-lineLimitX, 0.01, z), 
                    new Vector3(lineLimitX, 0.01, z)
                ]
            }, this.scene);
            h.color = gridC; 
            h.isPickable = false;
        }

        // Linhas Verticais (ao longo do eixo Z, variando em X)
        const stepsX = Math.floor(lineLimitX / 2);
        for (let i = -stepsX; i <= stepsX; i++) {
            const x = i * 2;
            const vl = MeshBuilder.CreateLines("gv" + i, {
                points:[
                    new Vector3(x, 0.01, -lineLimitZ), 
                    new Vector3(x, 0.01, lineLimitZ)
                ]
            }, this.scene);
            vl.color = gridC; 
            vl.isPickable = false;
        }

        // Bright accent diagonals (Borders)
        const accentC = new Color3(0.0, 0.35, 0.70);
        const corners =[
            new Vector3(-borderX, 0.015, -borderZ),
            new Vector3(borderX, 0.015, -borderZ),
            new Vector3(borderX, 0.015, borderZ),
            new Vector3(-borderX, 0.015, borderZ),
            new Vector3(-borderX, 0.015, -borderZ) // Fecha o loop
        ];
        
        const border = MeshBuilder.CreateLines("border", { points: corners }, this.scene);
        border.color = new Color3(0.0, 0.55, 1.0); 
        border.isPickable = false;

        // Corner markers
        const cornerPositions = [
            [-markerX, -markerZ], [markerX, -markerZ],[markerX, markerZ], [-markerX, markerZ]
        ];

        for (const[cx, cz] of cornerPositions) {
            for (const dx of[-0.5, 0.5]) {
                const hName = `ch_${cx}_${cz}_${dx}`;
                const lh = MeshBuilder.CreateLines(hName, {
                    points:[
                        new Vector3(cx + dx, 0.015, cz - 0.5), 
                        new Vector3(cx + dx, 0.015, cz + 0.5)
                    ]
                }, this.scene);
                lh.color = accentC; 
                lh.isPickable = false;

                const vName = `cv_${cx}_${cz}_${dx}`;
                const lv = MeshBuilder.CreateLines(vName, {
                    points:[
                        new Vector3(cx - 0.5, 0.015, cz + dx), 
                        new Vector3(cx + 0.5, 0.015, cz + dx)
                    ]
                }, this.scene);
                lv.color = accentC; 
                lv.isPickable = false;
            }
        }
    }
}