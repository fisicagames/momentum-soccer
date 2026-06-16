import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

export type Team = "player" | "cpu";

/** Configuração dinâmica para cada seleção */
export interface TeamConfig {
    id: string;
    namePt: string;
    nameEn: string;
    flag: string;
    colors: {
        base: Color3;
        secondary: Color3;
        knob: Color3;
    };
}

/** Dicionário global de seleções disponíveis */
export const TEAMS: Record<string, TeamConfig> = {
    brazil: {
        id: "brazil",
        namePt: "Brasil",
        nameEn: "Brazil",
        flag: "🇧🇷",
        colors: {
            base: new Color3(0.95, 0.78, 0.05),       // Amarelo Canarinho icônico (Corpo)
            secondary: new Color3(0.05, 0.45, 0.15),  // Verde Bandeira clássico (Domo Interno)
            knob: new Color3(0.08, 0.25, 0.70)         // Azul Anil
        }
    },
    germany: {
        id: "germany",
        namePt: "Alemanha",
        nameEn: "Germany",
        flag: "🇩🇪",
        colors: {
            base: new Color3(0.12, 0.12, 0.12),       // Preto Fosco tradicional (Corpo)
            secondary: new Color3(0.80, 0.12, 0.12),  // Vermelho vibrante (Domo Interno)
            knob: new Color3(0.95, 0.78, 0.05)         // Amarelo Ouro
        }
    },
    argentina: {
        id: "argentina",
        namePt: "Argentina",
        nameEn: "Argentina",
        flag: "🇦🇷",
        colors: {
            base: new Color3(0.35, 0.65, 0.88),       // Azul Celeste tradicional (Corpo)
            secondary: new Color3(0.96, 0.96, 0.96),  // Branco Puro (Domo Interno)
            knob: new Color3(0.95, 0.78, 0.05)         // Amarelo Sol
        }
    },
    france: {
        id: "france",
        namePt: "França",
        nameEn: "France",
        flag: "🇫🇷",
        colors: {
            base: new Color3(0.05, 0.15, 0.45),       // Azul Marinho (Corpo)
            secondary: new Color3(0.85, 0.10, 0.10),  // Vermelho (Domo Interno)
            knob: new Color3(0.96, 0.96, 0.96)         // Branco
        }
    },
    italy: {
        id: "italy",
        namePt: "Itália",
        nameEn: "Italy",
        flag: "🇮🇹",
        colors: {
            base: new Color3(0.05, 0.32, 0.72),       // Azul "Azzurro" clássico (Corpo)
            secondary: new Color3(0.10, 0.55, 0.25),  // Verde (Domo Interno)
            knob: new Color3(0.96, 0.96, 0.96)         // Branco
        }
    },
    spain: {
        id: "spain",
        namePt: "Espanha",
        nameEn: "Spain",
        flag: "🇪🇸",
        colors: {
            base: new Color3(0.72, 0.10, 0.10),       // Vermelho Fúria (Corpo)
            secondary: new Color3(0.95, 0.78, 0.05),  // Amarelo (Domo Interno)
            knob: new Color3(0.08, 0.25, 0.55)         // Azul Escuro
        }
    }
};

/** Posições táticas oficiais da formação 3-4-3 (+ goleiro). */
export type PositionId =
    | "goalkeeper"
    | "left_back" | "center_back" | "right_back"
    | "left_midfielder" | "volante" | "meia_armador" | "right_midfielder"
    | "left_winger" | "center_forward" | "right_winger";

export interface PositionSpec {
    id: PositionId;
    namePt: string;
    nameEn: string;
    mass: number;     // kg
    radius: number;   // m
    height: number;   // m
    specular: number; // brilho
}

export const POSITIONS: Record<PositionId, PositionSpec> = {
    goalkeeper:       { id: "goalkeeper",       namePt: "Goleiro",          nameEn: "Goalkeeper",           mass: 10.0, radius: 0.42, height: 0.26, specular: 0.95 },
    left_back:        { id: "left_back",        namePt: "Zagueiro Esquerdo", nameEn: "Left Center Back",   mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
    center_back:      { id: "center_back",      namePt: "Zagueiro Central",  nameEn: "Center Back",        mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
    right_back:       { id: "right_back",       namePt: "Zagueiro Direito",  nameEn: "Right Center Back",  mass: 8.0, radius: 0.40, height: 0.29, specular: 0.95 },
    left_midfielder:  { id: "left_midfielder",  namePt: "Ala Esquerdo",      nameEn: "Left Midfielder",      mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    volante:          { id: "volante",          namePt: "Volante",           nameEn: "Defensive Midfielder", mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    meia_armador:     { id: "meia_armador",     namePt: "Meia Armador",      nameEn: "Attacking Midfielder", mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    right_midfielder: { id: "right_midfielder", namePt: "Ala Direito",       nameEn: "Right Midfielder",     mass: 3.0, radius: 0.31, height: 0.19, specular: 0.40 },
    left_winger:      { id: "left_winger",      namePt: "Ponta Esquerda",    nameEn: "Left Winger",   mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
    center_forward:   { id: "center_forward",   namePt: "Centroavante",      nameEn: "Center Forward", mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
    right_winger:     { id: "right_winger",     namePt: "Ponta Direita",     nameEn: "Right Winger",  mass: 1.0, radius: 0.25, height: 0.13, specular: 0.25 },
};

const GK_COLOR = new Color3(1.0, 0.78, 0.05);

export interface Piece {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    spec: PositionSpec;
    team: Team;
    home: Vector3;
}

export interface Ball {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    radius: number;
    mass: number;
    home: Vector3;
}

function createMassLabel(scene: Scene, spec: PositionSpec, team: Team): Mesh {
    const cached = scene.getMaterialByName(`massMat_${team}_${spec.id}`) as StandardMaterial | null;
    if (cached) {
        const plane = MeshBuilder.CreatePlane(`massLabel_${team}_${spec.id}`, { size: spec.radius * 0.88 }, scene);
        plane.rotation.x = Math.PI / 2;
        plane.material = cached;
        return plane;
    }
    const size = 512;
    const tex = new DynamicTexture(`massTex_${team}_${spec.id}`, { width: size, height: size }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    ctx.font = "bold 330px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 34;
    ctx.strokeStyle = "rgba(8, 8, 16, 0.9)";
    const massText = `${spec.mass.toFixed(0)}`;
    ctx.strokeText(massText, size / 2, size / 2 + 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(massText, size / 2, size / 2 + 14);
    tex.update();

    const mat = new StandardMaterial(`massMat_${team}_${spec.id}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(`massLabel_${team}_${spec.id}`, { size: spec.radius * 0.88 }, scene);
    plane.rotation.x = Math.PI / 2;
    plane.material = mat;
    return plane;
}

function buttonLatheShape(radius: number, height: number): Vector3[] {
    const r = radius;
    const y = (t: number) => t * height - height / 2;
    return [
        new Vector3(0.012, y(0), 0),
        new Vector3(r * 0.60, y(0), 0),
        new Vector3(r * 0.95, y(0.30), 0),
        new Vector3(r * 1.00, y(0.55), 0),
        new Vector3(r * 0.90, y(0.85), 0),
        new Vector3(r * 0.58, y(1.00), 0),
        new Vector3(r * 0.40, y(0.90), 0),
        new Vector3(r * 0.16, y(0.84), 0),
        new Vector3(0.012, y(0.84), 0),
    ];
}

export function createPiece(scene: Scene, position: PositionId, team: Team, home: Vector3, teamConfig: TeamConfig): Piece {
    const spec = POSITIONS[position];
    const baseColor = position === "goalkeeper" ? GK_COLOR : teamConfig.colors.base;
    const name = `piece_${team}_${position}`;

    // Corpo do botão: perfil de acrílico em superfície de revolução
    const base = MeshBuilder.CreateLathe(name, {
        shape: buttonLatheShape(spec.radius, spec.height),
        tessellation: 28,
        sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    base.position.copyFrom(home);
    base.rotationQuaternion = Quaternion.Identity();

    const baseMat = new StandardMaterial(name + "_mat", scene);
    baseMat.diffuseColor = baseColor;
    baseMat.specularColor = new Color3(spec.specular, spec.specular, spec.specular);
    if (position === "goalkeeper") {
        baseMat.emissiveColor = new Color3(0.25, 0.18, 0.0);
    }
    base.material = baseMat;

    // Domo bicolor
    let dome: Mesh | null = null;
    if (position !== "goalkeeper") {
        const domeMat = new StandardMaterial(name + "_dome_mat", scene);
        domeMat.diffuseColor = teamConfig.colors.secondary;
        domeMat.specularColor = new Color3(spec.specular * 0.8, spec.specular * 0.8, spec.specular * 0.8);
        domeMat.backFaceCulling = false;
        dome = MeshBuilder.CreateDisc(name + "_dome", { radius: spec.radius * 0.52, tessellation: 28 }, scene);
        dome.rotation.x = Math.PI / 2;
        dome.parent = base;
        dome.position.y = spec.height * 0.45;
        dome.material = domeMat;
    }

    // Massa estampada na cavidade central (selo)
    const label = createMassLabel(scene, spec, team);
    label.parent = base;
    label.position.y = spec.height * 0.37;

    // ── Botoque central (Knob) ──
    let knobMesh: Mesh | null = null; // Declarado no topo para segurança de escopo
    if (position !== "goalkeeper") {
        knobMesh = MeshBuilder.CreateCylinder(name + "_knob", {
            diameter: spec.radius * 0.40,
            height: spec.height * 0.16,
            tessellation: 16
        }, scene);
        knobMesh.parent = base;
        knobMesh.position.y = spec.height * 0.45;
        
        const knobMat = new StandardMaterial(name + "_knob_mat", scene);
        knobMat.diffuseColor = teamConfig.colors.knob;
        knobMat.specularColor = new Color3(spec.specular * 0.8, spec.specular * 0.8, spec.specular * 0.8);
        knobMesh.material = knobMat;
        knobMesh.isPickable = false;
    }

    // Física
    const aggregate = new PhysicsAggregate(base, PhysicsShapeType.CYLINDER, {
        mass: spec.mass,
        radius: spec.radius,
        pointA: new Vector3(0, -spec.height / 2, 0),
        pointB: new Vector3(0, spec.height / 2, 0),
        friction: 0.35,
        restitution: 0.45,
    }, scene);

    const inertiaY = 0.5 * spec.mass * spec.radius * spec.radius;
    aggregate.body.setMassProperties({ mass: spec.mass, inertia: new Vector3(0, inertiaY, 0) });

    aggregate.body.setLinearDamping(0.04);
    aggregate.body.setAngularDamping(0.9);
    aggregate.body.disablePreStep = false;

    // Instanciação da peça ocorre de forma síncrona aqui
    const piece: Piece = { mesh: base, aggregate, spec, team, home: home.clone() };

    // Atribuição de metadata unificada e totalmente segura contra escopo temporal
    base.metadata = { piece };
    if (dome) dome.metadata = { piece };
    label.metadata = { piece };
    if (knobMesh) knobMesh.metadata = { piece }; // Atribuído de forma segura após o objeto "piece" existir

    return piece;
}

export function createBall(scene: Scene, home: Vector3): Ball {
    const radius = 0.18;
    const mass = 1.0;

    const mesh = MeshBuilder.CreateSphere("ball", { diameter: radius * 2, segments: 24 }, scene);
    mesh.position.copyFrom(home);
    mesh.rotationQuaternion = Quaternion.Identity();

    const size = 256;
    const tex = new DynamicTexture("ballTex", { width: size, height: size }, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#151515";
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            const x = (i + 0.5 + (j % 2) * 0.5) * (size / 4);
            const y = (j + 0.5) * (size / 3);
            ctx.beginPath();
            ctx.arc(x % size, y, size * 0.075, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    tex.update();
    const mat = new StandardMaterial("ballMat", scene);
    mat.diffuseTexture = tex;
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    mesh.material = mat;

    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE, {
        mass,
        radius,
        friction: 0.3,
        restitution: 0.8,
    }, scene);
    aggregate.body.setLinearDamping(0.05);
    aggregate.body.setAngularDamping(0.85);
    aggregate.body.disablePreStep = false;

    return { mesh, aggregate, radius, mass, home: home.clone() };
}