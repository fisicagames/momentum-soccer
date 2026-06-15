// Side-effect exigido por scene.createPickingRay/scene.pick no build de
// produção (tree-shaking): registra Ray e os métodos de picking na Scene.
import "@babylonjs/core/Culling/ray";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Observer } from "@babylonjs/core/Misc/observable";

import { Piece } from "./PieceFactory";

export interface AimState {
    piece: Piece;
    /** Magnitude do impulso J (kg·m/s) definida pelo arrasto traseiro. */
    impulse: number;
    /** Velocidade projetada v = J/m (m/s). */
    velocity: number;
    /** Direção do disparo (XZ, normalizada). */
    direction: Vector3;
}

export interface SlingshotOptions {
    camera: ArcRotateCamera;
    /** Impulso máximo permitido por jogada (igual para qualquer peça). */
    maxImpulse: number;
    /** Distância máxima de arrasto (m) mapeada para maxImpulse. */
    maxDrag: number;
    /** Teto dinâmico de impulso da peça (energia restante e saída de bola). */
    impulseCap: (piece: Piece) => number;
    /** Peças do jogador (para seleção por proximidade no toque). */
    playerPieces: () => Piece[];
    canAim: () => boolean;
    /** Restrição de seleção (ex.: saída de bola só com o centroavante). */
    canSelectPiece: (piece: Piece) => boolean;
    /** Jogador tocou uma peça com a seleção bloqueada. */
    onBlockedTap: (piece: Piece) => void;
    onAimUpdate: (aim: AimState) => void;
    onAimEnd: () => void;
    onShoot: (aim: AimState) => void;
    onTapDuringOpponentTurn?: () => void;
}

/**
 * Mecânica de slingshot: clicar em um botão do time e arrastar para trás.
 *
 * - O arrasto traseiro define o impulso J (momento a ser aplicado: p = J).
 * - A mira dianteira mostra a predição da trajetória com comprimento ∝ v = J/m:
 *   o mesmo recuo no Velocista (m=1) projeta uma seta longa; no Tanque (m=8), curta.
 */
export class SlingshotController {
    /** Escala visual da seta dianteira (m de seta por m/s projetado),
     *  ajustada ao impulso máximo para a seta caber na tela (J_max 13 → 18). */
    private static readonly ARROW_SCALE = 0.33;
    private static readonly MIN_IMPULSE = 0.4;

    private scene: Scene;
    private opts: SlingshotOptions;
    private pointerObserver: Observer<PointerInfo> | null = null;

    private aimingPiece: Piece | null = null;
    private aim: AimState | null = null;

    // Meshes reutilizados da mira (sem alocação por frame)
    private pullLine!: Mesh;
    private aimArrow!: Mesh;
    private aimHead!: Mesh;
    private dragMarker!: Mesh;

    // Vetores de trabalho
    private readonly _groundPoint = Vector3.Zero();
    private readonly _dragVec = Vector3.Zero();
    private readonly _dir = Vector3.Zero();
    private readonly _tmp = Vector3.Zero();
    private readonly _quat = Quaternion.Identity();

    /** Cancela a mira sem disparar (ponteiro perdido, saiu do canvas, blur). */
    private readonly cancelHandler = () => this.cancelAim();

    constructor(scene: Scene, opts: SlingshotOptions) {
        this.scene = scene;
        this.opts = opts;
        this.buildAimMeshes();

        this.pointerObserver = scene.onPointerObservable.add((pi) => {
            switch (pi.type) {
                case PointerEventTypes.POINTERDOWN: this.onPointerDown(); break;
                case PointerEventTypes.POINTERMOVE: this.onPointerMove(); break;
                case PointerEventTypes.POINTERUP: this.onPointerUp(); break;
            }
        });

        // Eventos que interrompem o arrasto sem um POINTERUP correspondente:
        // a mira é cancelada e o painel/visuais são ocultados (failsafe)
        const canvas = scene.getEngine().getRenderingCanvas()!;
        canvas.addEventListener("pointerleave", this.cancelHandler);
        canvas.addEventListener("pointercancel", this.cancelHandler);
        window.addEventListener("blur", this.cancelHandler);
    }

    public get isAiming(): boolean {
        return this.aimingPiece !== null;
    }

    /** Encerra o arrasto atual sem disparo, restaurando câmera e HUD. */
    private cancelAim(): void {
        if (!this.aimingPiece) return;
        this.hideAim();
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        this.opts.camera.attachControl(canvas, true);
        this.aimingPiece = null;
        this.aim = null;
        this.opts.onAimEnd();
    }

    private buildAimMeshes(): void {
        // Linha do arrasto traseiro (vermelha)
        const pullMat = new StandardMaterial("pullMat", this.scene);
        pullMat.diffuseColor = new Color3(0.9, 0.25, 0.2);
        pullMat.emissiveColor = new Color3(0.55, 0.12, 0.1);
        this.pullLine = MeshBuilder.CreateBox("pullLine", { width: 0.07, height: 0.04, depth: 1 }, this.scene);
        this.pullLine.material = pullMat;

        // Marcador no ponto de arrasto
        this.dragMarker = MeshBuilder.CreateCylinder("dragMarker", { diameter: 0.3, height: 0.04 }, this.scene);
        this.dragMarker.material = pullMat;

        // Seta de projeção dianteira (amarela): comprimento = v · ARROW_SCALE
        const aimMat = new StandardMaterial("aimMat", this.scene);
        aimMat.diffuseColor = new Color3(1.0, 0.85, 0.1);
        aimMat.emissiveColor = new Color3(0.65, 0.5, 0.05);
        this.aimArrow = MeshBuilder.CreateBox("aimArrow", { width: 0.12, height: 0.05, depth: 1 }, this.scene);
        this.aimArrow.material = aimMat;
        this.aimHead = MeshBuilder.CreateCylinder("aimHead", {
            diameterTop: 0, diameterBottom: 0.34, height: 0.42, tessellation: 12,
        }, this.scene);
        this.aimHead.material = aimMat;
        this.aimHead.rotationQuaternion = Quaternion.Identity();

        [this.pullLine, this.aimArrow, this.aimHead, this.dragMarker].forEach(m => {
            m.isPickable = false;
            m.setEnabled(false);
        });
    }

    private onPointerDown(): void {
        if (!this.opts.canAim() || this.aimingPiece) {
            // Se o jogador tocou na tela fora da sua vez de mirar, tenta encontrar se ele clicou em uma de suas peças
            if (!this.opts.canAim() && !this.aimingPiece) {
                const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh: AbstractMesh) => {
                    const piece = mesh.metadata?.piece as Piece | undefined;
                    return !!piece && piece.team === "player";
                });

                let piece = (pick?.hit && pick.pickedMesh)
                    ? (pick.pickedMesh.metadata.piece as Piece)
                    : null;

                // Tolerância de toque (mobile): suporte a toques próximos às peças
                if (!piece && this.pointerToGround(0.15, this._groundPoint)) {
                    const TOUCH_RADIUS = 1.0;
                    let bestDist = TOUCH_RADIUS;
                    for (const p of this.opts.playerPieces()) {
                        this._tmp.copyFrom(p.mesh.position).subtractInPlace(this._groundPoint);
                        this._tmp.y = 0;
                        const d = this._tmp.length() - p.spec.radius;
                        if (d < bestDist) { bestDist = d; piece = p; }
                    }
                }

                if (piece) {
                    this.opts.onTapDuringOpponentTurn?.();
                }
            }
            return;
        }

        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh: AbstractMesh) => {
            const piece = mesh.metadata?.piece as Piece | undefined;
            return !!piece && piece.team === "player";
        });

        let piece = (pick?.hit && pick.pickedMesh)
            ? (pick.pickedMesh.metadata.piece as Piece)
            : null;

        if (piece && !this.opts.canSelectPiece(piece)) {
            this.opts.onBlockedTap(piece);
            return;
        }

        // Tolerância de toque (mobile): sem acerto direto, pega a peça mais
        // próxima do ponto tocado no plano do campo, dentro de um raio generoso.
        if (!piece && this.pointerToGround(0.15, this._groundPoint)) {
            const TOUCH_RADIUS = 1.0; // m
            let bestDist = TOUCH_RADIUS;
            for (const p of this.opts.playerPieces()) {
                if (!this.opts.canSelectPiece(p)) continue;
                this._tmp.copyFrom(p.mesh.position).subtractInPlace(this._groundPoint);
                this._tmp.y = 0;
                const d = this._tmp.length() - p.spec.radius;
                if (d < bestDist) { bestDist = d; piece = p; }
            }
        }
        if (!piece) return;

        this.aimingPiece = piece;
        // Durante a mira, o arrasto não deve orbitar a câmera
        this.opts.camera.detachControl();
    }

    private onPointerMove(): void {
        if (!this.aimingPiece) return;

        // TRAVA DE SEGURANÇA: Se as condições de mira do jogo mudarem durante o arrasto
        // (ex: estouro de turnos ou tempo esgotado), cancela a mira imediatamente e limpa a HUD.
        if (!this.opts.canAim()) {
            this.cancelAim();
            return;
        }

        // Com o pointer capture do arrasto, "pointerleave" não dispara: a
        // saída do canvas é detectada pelas próprias coordenadas do ponteiro
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        if (this.scene.pointerX < 0 || this.scene.pointerY < 0 ||
            this.scene.pointerX > canvas.clientWidth || this.scene.pointerY > canvas.clientHeight) {
            this.cancelAim();
            return;
        }
        this.updateAim();
    }

    private onPointerUp(): void {
        if (!this.aimingPiece) return;

        const aim = this.aim;
        this.hideAim();
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        this.opts.camera.attachControl(canvas, true);
        this.aimingPiece = null;
        this.aim = null;
        this.opts.onAimEnd();

        if (aim && aim.impulse >= SlingshotController.MIN_IMPULSE) {
            this.opts.onShoot(aim);
        }
    }

    /** Projeta o ponteiro no plano do campo (y = altura do centro da peça). */
    private pointerToGround(planeY: number, result: Vector3): boolean {
        const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, null, this.opts.camera);
        if (Math.abs(ray.direction.y) < 1e-6) return false;
        const t = (planeY - ray.origin.y) / ray.direction.y;
        if (t < 0) return false;
        result.copyFrom(ray.direction).scaleInPlace(t).addInPlace(ray.origin);
        return true;
    }

    private updateAim(): void {
        const piece = this.aimingPiece!;
        const piecePos = piece.mesh.position;

        if (!this.pointerToGround(piecePos.y, this._groundPoint)) return;

        // Arrasto traseiro: vetor do ponteiro até a peça define direção e intensidade.
        // O teto dinâmico (energia restante da peça e saída de bola) trava o
        // recuo efetivo, o impulso e a seta de projeção no valor correspondente.
        const cap = this.opts.impulseCap(piece);
        const maxDragNow = this.opts.maxDrag * Math.min(cap / this.opts.maxImpulse, 1);
        piecePos.subtractToRef(this._groundPoint, this._dragVec);
        this._dragVec.y = 0;
        const dragLen = Math.min(this._dragVec.length(), maxDragNow);
        if (dragLen < 0.02) { this.hideAim(); this.aim = null; return; }

        this._dir.copyFrom(this._dragVec).normalize();

        // Impulso proporcional ao recuo: J = (recuo / recuo_max) · J_max
        const impulse = (dragLen / this.opts.maxDrag) * this.opts.maxImpulse;
        // Fórmula visual crucial: v = p / m
        const velocity = impulse / piece.spec.mass;

        this.aim = { piece, impulse, velocity, direction: this._dir.clone() };
        this.drawAim(piecePos, dragLen, velocity);
        this.opts.onAimUpdate(this.aim);
    }

    private drawAim(piecePos: Vector3, dragLen: number, velocity: number): void {
        const y = 0.06;
        const dir = this._dir;

        // Linha traseira: da peça ao ponto de arrasto (limitado)
        this._tmp.copyFrom(dir).scaleInPlace(-dragLen / 2).addInPlace(piecePos);
        this.pullLine.position.set(this._tmp.x, y, this._tmp.z);
        this.pullLine.scaling.z = dragLen;
        this._tmp.copyFrom(dir).scaleInPlace(-dragLen).addInPlace(piecePos);
        this._tmp.y = y;
        this.pullLine.lookAt(this._tmp);
        this.dragMarker.position.set(this._tmp.x, y, this._tmp.z);

        // Seta dianteira: comprimento proporcional a v = J/m
        const arrowLen = Math.max(velocity * SlingshotController.ARROW_SCALE, 0.15);
        this._tmp.copyFrom(dir).scaleInPlace(arrowLen / 2).addInPlace(piecePos);
        this.aimArrow.position.set(this._tmp.x, y, this._tmp.z);
        this.aimArrow.scaling.z = arrowLen;
        this._tmp.copyFrom(dir).scaleInPlace(arrowLen).addInPlace(piecePos);
        this._tmp.y = y;
        this.aimArrow.lookAt(this._tmp);

        // Ponta da seta: cone apontando na direção do disparo
        this.aimHead.position.set(this._tmp.x, y, this._tmp.z);
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, dir, this._quat);
        this.aimHead.rotationQuaternion!.copyFrom(this._quat);

        this.pullLine.setEnabled(true);
        this.aimArrow.setEnabled(true);
        this.aimHead.setEnabled(true);
        this.dragMarker.setEnabled(true);
    }

    private hideAim(): void {
        this.pullLine.setEnabled(false);
        this.aimArrow.setEnabled(false);
        this.aimHead.setEnabled(false);
        this.dragMarker.setEnabled(false);
    }

    public dispose(): void {
        this.scene.onPointerObservable.remove(this.pointerObserver);
        const canvas = this.scene.getEngine().getRenderingCanvas();
        canvas?.removeEventListener("pointerleave", this.cancelHandler);
        canvas?.removeEventListener("pointercancel", this.cancelHandler);
        window.removeEventListener("blur", this.cancelHandler);
        this.pullLine.dispose();
        this.aimArrow.dispose();
        this.aimHead.dispose();
        this.dragMarker.dispose();
    }
}
