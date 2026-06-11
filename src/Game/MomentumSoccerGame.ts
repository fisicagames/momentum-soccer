import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { RegisterJoinedPhysicsEngineComponent } from "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import { PhysicsEventType, IPhysicsCollisionEvent, IBasePhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import HavokPhysics from "@babylonjs/havok";
import { Observer } from "@babylonjs/core/Misc/observable";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { CreateSoundAsync, AbstractSound } from "@babylonjs/core/AudioV2";

import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { Arena } from "./Arena";
import { Piece, Ball, Goalkeeper, createPiece, createBall, createGoalkeeper, setPieceRecovering, ARCHETYPES, ArchetypeId } from "./PieceFactory";
import { SlingshotController, AimState } from "./SlingshotController";

type GameState = "PLAYER_AIM" | "CPU_TURN" | "ROLLING" | "GOAL_PAUSE" | "GAMEOVER";
type Turn = "player" | "cpu";

/**
 * Momentum Soccer — futebol de botão por turnos para ensinar momento linear.
 *
 * Conceitos em jogo: p = m·v (mira com v = J/m), impulso J = Δp aplicado via
 * applyImpulse, conservação do momento nas colisões (feedback proporcional ao
 * Δp real reportado pelo Havok) e atrito como força externa (damping do feltro).
 */
export class MomentumSoccerGame {
    private static readonly MAX_IMPULSE = 13;  // kg·m/s por jogada (igual para todas as peças)
    private static readonly MAX_DRAG = 2.2;    // m de recuo para o impulso máximo
    private static readonly WIN_GOALS = 3;
    private static readonly SETTLE_SPEED = 0.18;
    private static readonly ROLLING_TIMEOUT = 8; // s

    private scene: Scene;
    private plugin!: HavokPlugin;

    // Estado da partida
    private gameState: GameState = "PLAYER_AIM";
    private nextTurn: Turn = "cpu";
    private stateTime = 0;
    private playerScore = 0;
    private cpuScore = 0;
    private hasShotOnce = false;

    // Regra de toque consecutivo: a última peça lançada fica "em recuperação"
    private lastPlayerPiece: Piece | null = null;
    private lastCpuPiece: Piece | null = null;
    private blockedFlashTimer: ReturnType<typeof setTimeout> | null = null;

    // Entidades
    private playerPieces: Piece[] = [];
    private cpuPieces: Piece[] = [];
    private playerGK!: Goalkeeper;
    private cpuGK!: Goalkeeper;
    private ball!: Ball;

    // Gol detectado pelo trigger físico (consumido pela máquina de estados)
    private pendingGoal: Turn | null = null;
    private triggerObserver: Observer<IBasePhysicsCollisionEvent> | null = null;

    // Sistemas
    private camera!: ArcRotateCamera;
    private slingshot!: SlingshotController;
    private sparkSystem!: ParticleSystem;
    private confettiSystem!: ParticleSystem;
    private impactSound: AbstractSound | null = null;

    // Feedback de colisão
    private lastHitTimes = new Map<string, number>();
    private shockRings: { mesh: Mesh; life: number; maxScale: number }[] = [];
    private floatTexts: { tb: TextBlock; life: number }[] = [];

    // GUI
    private ui!: AdvancedDynamicTexture;
    private scoreTxt!: TextBlock;
    private turnTxt!: TextBlock;
    private goalTxt!: TextBlock;
    private hintTxt!: TextBlock;
    private aimPanel!: Rectangle;
    private aimTxt!: TextBlock;
    private gameOverPanel!: Rectangle;
    private gameOverTitle!: TextBlock;
    private gameOverPhrase!: TextBlock;
    private playAgainBtn!: Button;
    private restartBtn!: Button;

    // Callbacks para o Controller pausar/retomar a música de fundo
    private onGameOverCallback: (() => void) | null = null;
    private onGameResumeCallback: (() => void) | null = null;

    private gameLoopObserver: Observer<Scene> | null = null;

    // Idioma atual (0 = PT, 1 = EN)
    private currentLang = 0;

    // Vetores de trabalho
    private readonly _tmp = Vector3.Zero();
    private readonly _tmp2 = Vector3.Zero();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public async start(): Promise<void> {
        RegisterJoinedPhysicsEngineComponent();
        const wasmUrl = new URL("assets/wasm/HavokPhysics.wasm", document.baseURI).href;
        const havok = await HavokPhysics({ locateFile: () => wasmUrl });
        this.plugin = new HavokPlugin(true, havok);
        if (!this.scene.enablePhysics(new Vector3(0, -9.81, 0), this.plugin)) {
            throw new Error("MomentumSoccerGame: enablePhysics falhou — physics engine não registrada.");
        }

        this.setupCamera();
        this.setupLights();
        const goalTriggers = Arena.build(this.scene);
        this.buildTeams();
        this.setupGoalTriggers(goalTriggers);
        this.buildParticles();
        this.setupCollisionFeedback();
        this.setupSlingshot();
        this.buildGUI();
        this.setupGameLoop();

        CreateSoundAsync("impact", "./assets/sounds/universfield-ground-impact-352053.mp3", { loop: false })
            .then(s => { this.impactSound = s; });

        // Acesso de depuração no console do navegador (apenas em desenvolvimento)
        if (import.meta.env.DEV) {
            (window as unknown as Record<string, unknown>).__msGame = this;
        }
    }

    // ── CÂMERA ────────────────────────────────────────────────────────────────

    private setupCamera(): void {
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        this.camera = new ArcRotateCamera(
            "soccerCam", -Math.PI / 2, 1.02, 14,
            new Vector3(0, 0, -2.5), this.scene
        );
        this.camera.lowerRadiusLimit = 8;
        this.camera.upperRadiusLimit = 24;
        this.camera.lowerBetaLimit = 0.25;
        this.camera.upperBetaLimit = 1.30;
        this.camera.panningSensibility = 0; // sem pan: arrasto fora das peças apenas orbita
        this.camera.attachControl(canvas, true);
        this.scene.activeCamera = this.camera;
    }

    /** Câmera por estado: orbital livre na vez do jogador; "visão de TV" no resto. */
    private updateCamera(): void {
        const ballPos = this.ball.mesh.position;
        const target = this.camera.target;

        if (this.gameState === "PLAYER_AIM") {
            // Enquadra a bola e a peça do jogador mais próxima dela (ambas visíveis)
            let nearest = this.playerPieces[0].mesh.position;
            let best = Number.MAX_VALUE;
            for (const p of this.playerPieces) {
                const d = Vector3.DistanceSquared(p.mesh.position, ballPos);
                if (d < best) { best = d; nearest = p.mesh.position; }
            }
            this._tmp.copyFrom(ballPos).addInPlace(nearest).scaleInPlace(0.5);
            target.x += (this._tmp.x - target.x) * 0.06;
            target.z += (this._tmp.z - target.z) * 0.06;
        } else {
            // Visão de TV: enquadramento elevado acompanhando a bola
            target.x += (ballPos.x - target.x) * 0.06;
            target.z += (ballPos.z - target.z) * 0.06;
            this.camera.alpha += (-Math.PI / 2 - this.camera.alpha) * 0.04;
            this.camera.beta += (0.78 - this.camera.beta) * 0.04;
            this.camera.radius += (17.5 - this.camera.radius) * 0.04;
        }
    }

    private setCameraControl(enabled: boolean): void {
        const canvas = this.scene.getEngine().getRenderingCanvas()!;
        if (enabled) this.camera.attachControl(canvas, true);
        else this.camera.detachControl();
    }

    // ── ILUMINAÇÃO ────────────────────────────────────────────────────────────

    private setupLights(): void {
        const hemi = new HemisphericLight("soccerHemi", new Vector3(0, 1, 0), this.scene);
        hemi.intensity = 0.75;
        hemi.diffuse = new Color3(0.85, 0.9, 1.0);
        hemi.groundColor = new Color3(0.25, 0.45, 0.2);

        const dir = new DirectionalLight("soccerDir", new Vector3(-1.5, -3, -1), this.scene);
        dir.intensity = 1.0;
        dir.diffuse = new Color3(1.0, 0.96, 0.85);
        dir.specular = new Color3(0.6, 0.5, 0.4);
        dir.position.set(8, 14, -5);
    }

    // ── TIMES ─────────────────────────────────────────────────────────────────

    /**
     * Formação profissional 3-4-3 (10 botões de linha + goleiro por time):
     * 3 Tanques na defesa, 4 Atacantes no meio-campo e 3 Velocistas na frente,
     * cobrindo todo o próprio lado do campo.
     */
    private buildTeams(): void {
        const formation: { archetype: ArchetypeId; x: number; z: number }[] = [
            // Defesa (3 zagueiros pesados)
            { archetype: "tank",     x: -2.4, z: 5.8 },
            { archetype: "tank",     x: 0,    z: 6.0 },
            { archetype: "tank",     x: 2.4,  z: 5.8 },
            // Meio-campo (4 apoiadores)
            { archetype: "striker",  x: -3.0, z: 3.8 },
            { archetype: "striker",  x: -1.0, z: 3.4 },
            { archetype: "striker",  x: 1.0,  z: 3.4 },
            { archetype: "striker",  x: 3.0,  z: 3.8 },
            // Ataque (3 pontas leves)
            { archetype: "sprinter", x: -2.2, z: 1.4 },
            { archetype: "sprinter", x: 0,    z: 1.0 },
            { archetype: "sprinter", x: 2.2,  z: 1.4 },
        ];

        for (const f of formation) {
            const y = ARCHETYPES[f.archetype].height / 2 + 0.001;
            this.playerPieces.push(createPiece(this.scene, f.archetype, "player", new Vector3(f.x, y, -f.z)));
            this.cpuPieces.push(createPiece(this.scene, f.archetype, "cpu", new Vector3(-f.x, y, f.z)));
        }

        const gkY = 0.28 / 2 + 0.001;
        this.playerGK = createGoalkeeper(this.scene, "player", new Vector3(0, gkY, -(Arena.GOAL_LINE_Z - 0.45)));
        this.cpuGK = createGoalkeeper(this.scene, "cpu", new Vector3(0, gkY, Arena.GOAL_LINE_Z - 0.45));

        this.ball = createBall(this.scene, new Vector3(0, 0.31, 0));
    }

    /**
     * Goleiros cinemáticos: deslizam lateralmente acompanhando a bola, com
     * velocidade limitada (chutes rápidos nos cantos conseguem vencê-los),
     * sempre paralelos à linha de gol.
     */
    private updateGoalkeepers(dt: number): void {
        const GK_SPEED = 1.1; // m/s
        const range = Arena.GOAL_W / 2 - 0.35;
        for (const gk of [this.playerGK, this.cpuGK]) {
            const targetX = Math.max(-range, Math.min(range, this.ball.mesh.position.x));
            const delta = targetX - gk.mesh.position.x;
            const step = Math.max(-GK_SPEED * dt, Math.min(GK_SPEED * dt, delta));
            gk.mesh.position.x += step;
            gk.mesh.position.y = gk.home.y;
            gk.mesh.position.z = gk.home.z;
        }
    }

    private allBodies(): { mesh: Mesh; piece?: Piece }[] {
        return [
            ...this.playerPieces.map(p => ({ mesh: p.mesh, piece: p })),
            ...this.cpuPieces.map(p => ({ mesh: p.mesh, piece: p })),
            { mesh: this.ball.mesh },
        ];
    }

    /** Reposiciona todos com velocidades zeradas (kickoff / pós-gol). */
    private resetFormation(): void {
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            this.teleport(p.mesh, p.home, p.aggregate);
        }
        this.playerGK.mesh.position.copyFrom(this.playerGK.home);
        this.cpuGK.mesh.position.copyFrom(this.cpuGK.home);
        this.teleport(this.ball.mesh, this.ball.home, this.ball.aggregate);
        // Tiro de meta / kickoff: a regra de toque consecutivo é zerada
        this.setLastPlayerPiece(null);
        this.lastCpuPiece = null;
        this.pendingGoal = null;
    }

    /** Atualiza a peça em recuperação do jogador e seu feedback visual. */
    private setLastPlayerPiece(piece: Piece | null): void {
        if (this.lastPlayerPiece) setPieceRecovering(this.lastPlayerPiece, false);
        this.lastPlayerPiece = piece;
        if (piece) setPieceRecovering(piece, true);
    }

    /** Regra de toque consecutivo (com exceção se só houver uma peça). */
    private canSelectPiece(piece: Piece): boolean {
        if (this.playerPieces.length <= 1) return true;
        return piece !== this.lastPlayerPiece;
    }

    private teleport(mesh: Mesh, to: Vector3, aggregate: { body: { setLinearVelocity(v: Vector3): void; setAngularVelocity(v: Vector3): void } }): void {
        aggregate.body.setLinearVelocity(Vector3.ZeroReadOnly);
        aggregate.body.setAngularVelocity(Vector3.ZeroReadOnly);
        mesh.position.copyFrom(to);
        mesh.rotationQuaternion?.set(0, 0, 0, 1);
    }

    // ── SLINGSHOT (INPUT DO JOGADOR) ─────────────────────────────────────────

    private setupSlingshot(): void {
        this.slingshot = new SlingshotController(this.scene, {
            camera: this.camera,
            maxImpulse: MomentumSoccerGame.MAX_IMPULSE,
            maxDrag: MomentumSoccerGame.MAX_DRAG,
            playerPieces: () => this.playerPieces,
            canAim: () => this.gameState === "PLAYER_AIM",
            canSelectPiece: (piece) => this.canSelectPiece(piece),
            onBlockedTap: () => this.flashBlockedMessage(),
            onAimUpdate: (aim) => {
                this.hintTxt.isVisible = false;
                this.updateAimPanel(aim);
            },
            onAimEnd: () => {
                this.aimPanel.isVisible = false;
                this.hintTxt.isVisible = !this.hasShotOnce;
            },
            onShoot: (aim) => this.shoot(aim),
        });
    }

    private shoot(aim: AimState): void {
        this._tmp.copyFrom(aim.direction).scaleInPlace(aim.impulse);
        // Impulso aplicado no centro de massa: transferência direta de momento (J = Δp)
        aim.piece.aggregate.body.applyImpulse(this._tmp, aim.piece.mesh.getAbsolutePosition());
        this.hasShotOnce = true;
        this.hintTxt.isVisible = false;
        this.setLastPlayerPiece(aim.piece);
        this.enterState("ROLLING");
        this.nextTurn = "cpu";
    }

    /** Aviso rápido quando o jogador toca a peça em recuperação. */
    private flashBlockedMessage(): void {
        this.turnTxt.text = this.t("⏳ Peça em recuperação — use outra!", "⏳ Piece recovering — use another!");
        this.turnTxt.color = "#FFC34D";
        if (this.blockedFlashTimer) clearTimeout(this.blockedFlashTimer);
        this.blockedFlashTimer = setTimeout(() => {
            this.blockedFlashTimer = null;
            this.updateTurnText();
        }, 1400);
    }

    // ── IA DO ADVERSÁRIO ─────────────────────────────────────────────────────

    /**
     * Seleção da peça da CPU entre os 10 botões de linha, por média ponderada:
     *  - Proximidade (peso 0.6): peças perto da bola ganham forte preferência;
     *  - Alinhamento (peso 0.4): ângulo Peça → Bola → Gol adversário.
     * A CPU também respeita a regra de toque consecutivo.
     */
    private cpuShoot(): void {
        const ballPos = this.ball.mesh.position;
        const goal = this._tmp2.set(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3); // gol do jogador

        const desired = goal.subtract(ballPos);
        desired.y = 0;
        desired.normalize();

        const W_PROXIMITY = 0.6;
        const W_ALIGNMENT = 0.4;

        let best: { piece: Piece; dir: Vector3; dist: number; align: number; score: number } | null = null;

        for (const piece of this.cpuPieces) {
            if (this.cpuPieces.length > 1 && piece === this.lastCpuPiece) continue;

            // Ponto de contato atrás da bola (na direção oposta ao gol-alvo)
            const contact = ballPos.subtract(desired.scale(this.ball.radius + piece.spec.radius));
            const dir = contact.subtract(piece.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.05) continue;
            dir.normalize();

            // Proximidade: decaimento exponencial — perto de 1 quando a peça está colada na bola
            const proximity = Math.exp(-dist / 3);
            // Alinhamento: 1 quando a peça está exatamente atrás da bola em relação ao gol
            const align = Vector3.Dot(dir, desired);
            const alignment = (align + 1) / 2; // normaliza [-1,1] → [0,1]

            const score = W_PROXIMITY * proximity + W_ALIGNMENT * alignment;
            if (!best || score > best.score) {
                best = { piece, dir, dist, align, score };
            }
        }
        if (!best) return;

        // Velocidade desejada cresce com a distância; erro humano simulado
        const speed = Math.min(1.8 + best.dist * 0.8, 5.5) * (0.88 + Math.random() * 0.24);
        const noise = (Math.random() - 0.5) * 0.16 * (1.2 - Math.max(best.align, 0));
        const cos = Math.cos(noise), sin = Math.sin(noise);
        const dx = best.dir.x * cos - best.dir.z * sin;
        const dz = best.dir.x * sin + best.dir.z * cos;

        // A CPU obedece ao mesmo limite de impulso do jogador (J = m·v ≤ J_max)
        const impulse = Math.min(best.piece.spec.mass * speed, MomentumSoccerGame.MAX_IMPULSE);
        this._tmp.set(dx * impulse, 0, dz * impulse);
        best.piece.aggregate.body.applyImpulse(this._tmp, best.piece.mesh.getAbsolutePosition());
        this.lastCpuPiece = best.piece;

        this.enterState("ROLLING");
        this.nextTurn = "player";
    }

    // ── PARTÍCULAS ───────────────────────────────────────────────────────────

    private buildParticles(): void {
        const flare = new Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);

        // Faíscas de colisão (intensidade definida por Δp no momento do uso)
        this.sparkSystem = new ParticleSystem("sparks", 400, this.scene);
        this.sparkSystem.particleTexture = flare;
        this.sparkSystem.emitRate = 0;
        this.sparkSystem.minLifeTime = 0.15; this.sparkSystem.maxLifeTime = 0.5;
        this.sparkSystem.minEmitPower = 1.5; this.sparkSystem.maxEmitPower = 5;
        this.sparkSystem.updateSpeed = 0.02;
        this.sparkSystem.direction1 = new Vector3(-1, 0.5, -1);
        this.sparkSystem.direction2 = new Vector3(1, 1.5, 1);
        this.sparkSystem.gravity = new Vector3(0, -6, 0);
        this.sparkSystem.color1 = new Color4(1, 0.9, 0.4, 1);
        this.sparkSystem.color2 = new Color4(1, 0.5, 0.1, 1);
        this.sparkSystem.colorDead = new Color4(0.6, 0.2, 0, 0);
        this.sparkSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
        this.sparkSystem.start();

        // Confete de gol
        this.confettiSystem = new ParticleSystem("confetti", 400, this.scene);
        this.confettiSystem.particleTexture = flare;
        this.confettiSystem.emitRate = 0;
        this.confettiSystem.minSize = 0.12; this.confettiSystem.maxSize = 0.4;
        this.confettiSystem.minLifeTime = 1.0; this.confettiSystem.maxLifeTime = 2.4;
        this.confettiSystem.minEmitPower = 5; this.confettiSystem.maxEmitPower = 11;
        this.confettiSystem.updateSpeed = 0.02;
        this.confettiSystem.direction1 = new Vector3(-3, 8, -2);
        this.confettiSystem.direction2 = new Vector3(3, 13, 2);
        this.confettiSystem.gravity = new Vector3(0, -7, 0);
        this.confettiSystem.color1 = new Color4(0.2, 0.7, 1, 1);
        this.confettiSystem.color2 = new Color4(1, 0.8, 0.1, 1);
        this.confettiSystem.colorDead = new Color4(1, 1, 1, 0);
        this.confettiSystem.start();

        // Pool de anéis de onda de choque
        const ringMat = new StandardMaterial("ringMat", this.scene);
        ringMat.emissiveColor = new Color3(1, 0.85, 0.3);
        ringMat.diffuseColor = Color3.Black();
        ringMat.alpha = 0.8;
        for (let i = 0; i < 3; i++) {
            const ring = MeshBuilder.CreateTorus(`shockRing_${i}`, {
                diameter: 1, thickness: 0.05, tessellation: 32,
            }, this.scene);
            ring.material = ringMat.clone(`ringMat_${i}`);
            ring.isPickable = false;
            ring.setEnabled(false);
            this.shockRings.push({ mesh: ring, life: 0, maxScale: 1 });
        }
    }

    // ── FEEDBACK DE COLISÃO POR Δp REAL ──────────────────────────────────────

    private setupCollisionFeedback(): void {
        const dynamicMeshes = new Set<string>([
            ...this.playerPieces.map(p => p.mesh.name),
            ...this.cpuPieces.map(p => p.mesh.name),
            this.playerGK.mesh.name,
            this.cpuGK.mesh.name,
            this.ball.mesh.name,
        ]);

        const handler = (ev: IPhysicsCollisionEvent) => {
            if (ev.type !== PhysicsEventType.COLLISION_STARTED) return;
            const a = ev.collider.transformNode?.name ?? "";
            const b = ev.collidedAgainst.transformNode?.name ?? "";
            // Só peças e bola entre si (ignora muros, chão e traves)
            if (!dynamicMeshes.has(a) || !dynamicMeshes.has(b)) return;

            const impulse = ev.impulse ?? 0; // Δp real transferido na colisão (kg·m/s)
            if (impulse < 0.35 || !ev.point) return;

            // Deduplica o par (os dois corpos reportam o mesmo evento)
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            const now = performance.now();
            if (now - (this.lastHitTimes.get(key) ?? 0) < 80) return;
            this.lastHitTimes.set(key, now);

            this.emitCollisionFeedback(ev.point, impulse);
        };

        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            p.aggregate.body.setCollisionCallbackEnabled(true);
            p.aggregate.body.getCollisionObservable().add(handler);
        }
        this.ball.aggregate.body.setCollisionCallbackEnabled(true);
        this.ball.aggregate.body.getCollisionObservable().add(handler);
    }

    /** Faíscas, onda de choque, texto "Δp" e som, todos proporcionais ao impulso. */
    private emitCollisionFeedback(point: Vector3, impulse: number): void {
        const norm = Math.min(impulse / MomentumSoccerGame.MAX_IMPULSE, 1);

        this.sparkSystem.emitter = point.clone();
        this.sparkSystem.minSize = 0.06 + norm * 0.1;
        this.sparkSystem.maxSize = 0.15 + norm * 0.35;
        this.sparkSystem.manualEmitCount = Math.round(8 + norm * 120);

        // Onda de choque expansiva
        const slot = this.shockRings.find(r => r.life <= 0);
        if (slot) {
            slot.life = 1;
            slot.maxScale = 1.2 + norm * 3.2;
            slot.mesh.position.set(point.x, 0.08, point.z);
            slot.mesh.scaling.setAll(0.2);
            slot.mesh.setEnabled(true);
        }

        // Texto flutuante com o valor físico (Δp)
        if (impulse > 1.2) {
            const ft = this.floatTexts.find(f => f.life <= 0);
            if (ft) {
                ft.life = 1;
                ft.tb.text = `Δp = ${this.fmt(impulse, 1)} kg·m/s`;
                ft.tb.fontSize = 11 + Math.round(norm * 8);
                ft.tb.isVisible = true;
                ft.tb.moveToVector3(point.add(new Vector3(0, 0.6, 0)), this.scene);
            }
        }

        if (this.impactSound && impulse > 0.8) {
            this.impactSound.volume = Math.min(0.15 + norm, 1);
            this.impactSound.play();
        }
    }

    private updateFeedbackAnimations(dt: number): void {
        for (const r of this.shockRings) {
            if (r.life <= 0) continue;
            r.life -= dt * 2.2;
            if (r.life <= 0) { r.mesh.setEnabled(false); continue; }
            const t = 1 - r.life;
            r.mesh.scaling.setAll(0.2 + t * r.maxScale);
            (r.mesh.material as StandardMaterial).alpha = r.life * 0.8;
        }
        for (const f of this.floatTexts) {
            if (f.life <= 0) continue;
            f.life -= dt * 0.8;
            if (f.life <= 0) { f.tb.isVisible = false; continue; }
            f.tb.alpha = Math.min(f.life * 2, 1);
            f.tb.linkOffsetY = (f.tb.linkOffsetY as number) - dt * 30;
        }
    }

    // ── LOOP PRINCIPAL / MÁQUINA DE ESTADOS ──────────────────────────────────

    private enterState(state: GameState): void {
        this.gameState = state;
        this.stateTime = 0;
        if (state === "PLAYER_AIM") this.setCameraControl(true);
        else if (!this.slingshot?.isAiming) this.setCameraControl(false);
        this.updateTurnText();
    }

    private setupGameLoop(): void {
        this.gameLoopObserver = this.scene.onBeforeRenderObservable.add(() => {
            const dt = this.scene.getEngine().getDeltaTime() / 1000;
            this.stateTime += dt;

            this.updateCamera();
            this.updateGoalkeepers(dt);
            this.updateFeedbackAnimations(dt);
            this.safetyFilter();

            switch (this.gameState) {
                case "ROLLING": {
                    const goal = this.detectGoal();
                    if (goal) { this.onGoal(goal); break; }
                    if (this.stateTime > 0.7 && (this.maxBodySpeed() < MomentumSoccerGame.SETTLE_SPEED || this.stateTime > MomentumSoccerGame.ROLLING_TIMEOUT)) {
                        this.checkGoalKick(); // bola morta atrás da linha → tiro de meta
                        this.enterState(this.nextTurn === "player" ? "PLAYER_AIM" : "CPU_TURN");
                    }
                    break;
                }
                case "CPU_TURN": {
                    if (this.stateTime > 1.3) this.cpuShoot();
                    break;
                }
                case "PLAYER_AIM": {
                    // Gol "tardio" (bola ainda entrando enquanto o turno virou)
                    const goal = this.detectGoal();
                    if (goal) this.onGoal(goal);
                    break;
                }
            }
        });
    }

    private maxBodySpeed(): number {
        let max = 0;
        for (const b of this.allBodies()) {
            const agg = b.piece ? b.piece.aggregate : this.ball.aggregate;
            const v = agg.body.getLinearVelocity().length();
            if (v > max) max = v;
        }
        return max;
    }

    /** Filtro de segurança: devolve ao campo qualquer objeto que caia (y < 0). */
    private safetyFilter(): void {
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            if (p.mesh.position.y < -0.5) this.teleport(p.mesh, p.home, p.aggregate);
        }
        if (this.ball.mesh.position.y < -0.5) {
            this.teleport(this.ball.mesh, this.ball.home, this.ball.aggregate);
        }
    }

    // ── GOLS E PLACAR ────────────────────────────────────────────────────────

    /**
     * Detecção estrita de gol via trigger físico do Havok: o gatilho cabe
     * dentro da boca do gol com o teto abaixo do travessão — bola por cima
     * da trave nunca interage com ele e não conta gol.
     */
    private setupGoalTriggers(triggers: Mesh[]): void {
        const triggerSides = new Map<string, number>(
            triggers.map(tm => [tm.name, (tm.metadata as { side: number }).side])
        );
        const ballName = this.ball.mesh.name;

        this.triggerObserver = this.plugin.onTriggerCollisionObservable.add((ev) => {
            if (ev.type !== PhysicsEventType.TRIGGER_ENTERED) return;
            // Ignora a bola quicando dentro do gol durante a pausa/fim de jogo
            if (this.gameState === "GOAL_PAUSE" || this.gameState === "GAMEOVER") return;
            const a = ev.collider.transformNode?.name ?? "";
            const b = ev.collidedAgainst.transformNode?.name ?? "";
            const side = triggerSides.get(a) ?? triggerSides.get(b);
            if (side === undefined || (a !== ballName && b !== ballName)) return;
            // side +1 = gol da CPU (jogador marcou); -1 = gol do jogador
            this.pendingGoal = side > 0 ? "player" : "cpu";
        });
    }

    /** Consome o gol registrado pelo trigger, se houver. */
    private detectGoal(): Turn | null {
        const goal = this.pendingGoal;
        this.pendingGoal = null;
        return goal;
    }

    /**
     * Bola parada atrás da linha de fundo sem gol (por cima do travessão ou
     * ao lado do gol): tiro de meta — bola na pequena área, defesa recomeça.
     */
    private checkGoalKick(): boolean {
        const z = this.ball.mesh.position.z;
        if (Math.abs(z) <= Arena.GOAL_LINE_Z - 0.1) return false;
        const side = Math.sign(z);
        this.teleport(this.ball.mesh, this._tmp.set(0, 0.31, side * (Arena.GOAL_LINE_Z - 2.2)), this.ball.aggregate);
        this.setLastPlayerPiece(null);
        this.lastCpuPiece = null;
        this.nextTurn = side > 0 ? "cpu" : "player"; // a defesa repõe a bola
        return true;
    }

    private onGoal(scorer: Turn): void {
        if (scorer === "player") this.playerScore++;
        else this.cpuScore++;
        this.updateScoreText();

        // Festa proporcional à conquista
        this.confettiSystem.emitter = this.ball.mesh.position.clone();
        this.confettiSystem.manualEmitCount = scorer === "player" ? 300 : 80;
        if (this.impactSound) { this.impactSound.volume = 1; this.impactSound.play(); }

        this.goalTxt.text = scorer === "player" ? this.t("⚽ GOOOL!", "⚽ GOAL!") : this.t("😣 Gol do adversário!", "😣 Opponent scored!");
        this.goalTxt.color = scorer === "player" ? "#FFD700" : "#FF7766";
        this.goalTxt.isVisible = true;

        this.nextTurn = scorer === "player" ? "cpu" : "player"; // quem sofre o gol recomeça
        this.enterState("GOAL_PAUSE");

        setTimeout(() => {
            this.goalTxt.isVisible = false;
            if (this.gameState !== "GOAL_PAUSE") return;
            if (this.playerScore >= MomentumSoccerGame.WIN_GOALS || this.cpuScore >= MomentumSoccerGame.WIN_GOALS) {
                this.endMatch();
            } else {
                this.resetFormation();
                this.enterState(this.nextTurn === "player" ? "PLAYER_AIM" : "CPU_TURN");
            }
        }, 2400);
    }

    private endMatch(): void {
        const playerWon = this.playerScore > this.cpuScore;
        this.saveRecord(playerWon);
        this.enterState("GAMEOVER");

        this.gameOverTitle.text = playerWon ? this.t("🏆 Você venceu!", "🏆 You won!") : this.t("😞 O adversário venceu…", "😞 The opponent won…");
        this.gameOverPhrase.text = this.t(
            "💡 Quanto maior a massa, menor a velocidade\npara o mesmo impulso: v = p/m.",
            "💡 The larger the mass, the lower the velocity\nfor the same impulse: v = p/m."
        );
        this.gameOverPanel.isVisible = true;
        this.onGameOverCallback?.();
    }

    private restartMatch(): void {
        this.playerScore = 0;
        this.cpuScore = 0;
        this.updateScoreText();
        this.gameOverPanel.isVisible = false;
        this.resetFormation();
        this.onGameResumeCallback?.();
        this.enterState("PLAYER_AIM");
    }

    private saveRecord(playerWon: boolean): void {
        try {
            const raw = localStorage.getItem("momentum_soccer_record");
            const rec = raw ? JSON.parse(raw) : { wins: 0, losses: 0 };
            if (playerWon) rec.wins++;
            else rec.losses++;
            localStorage.setItem("momentum_soccer_record", JSON.stringify(rec));
        } catch { /* armazenamento indisponível: recorde apenas da sessão */ }
    }

    // ── GUI DO JOGO ───────────────────────────────────────────────────────────

    private buildGUI(): void {
        this.ui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // Barra superior: placar + indicador de turno
        const topBar = new Rectangle("topBar");
        topBar.width = "100%";
        topBar.height = "52px";
        topBar.thickness = 0;
        topBar.background = "rgba(0,0,0,0.5)";
        topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.ui.addControl(topBar);

        this.scoreTxt = new TextBlock("score", "");
        this.scoreTxt.color = "white";
        this.scoreTxt.fontSize = 17;
        this.scoreTxt.fontWeight = "bold";
        this.scoreTxt.top = "-9px";
        topBar.addControl(this.scoreTxt);

        this.turnTxt = new TextBlock("turn", "");
        this.turnTxt.color = "#9FD4FF";
        this.turnTxt.fontSize = 12;
        this.turnTxt.top = "13px";
        topBar.addControl(this.turnTxt);

        this.restartBtn = Button.CreateSimpleButton("restart", "↺");
        this.restartBtn.width = "30px";
        this.restartBtn.height = "30px";
        this.restartBtn.cornerRadius = 15;
        this.restartBtn.color = "white";
        this.restartBtn.background = "#444455";
        this.restartBtn.fontSize = 16;
        this.restartBtn.thickness = 0;
        this.restartBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.restartBtn.left = "-8px";
        this.restartBtn.onPointerClickObservable.add(() => this.restartMatch());
        topBar.addControl(this.restartBtn);

        // Painel de mira (m, v, p) ancorado na peça selecionada
        this.aimPanel = new Rectangle("aimPanel");
        this.aimPanel.width = "150px";
        this.aimPanel.height = "64px";
        this.aimPanel.cornerRadius = 8;
        this.aimPanel.thickness = 1;
        this.aimPanel.color = "#FFD24A";
        this.aimPanel.background = "rgba(10,10,30,0.78)";
        this.aimPanel.isVisible = false;
        this.ui.addControl(this.aimPanel);

        this.aimTxt = new TextBlock("aimTxt", "");
        this.aimTxt.color = "white";
        this.aimTxt.fontSize = 12;
        this.aimTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimTxt.paddingLeft = "10px";
        this.aimPanel.addControl(this.aimTxt);

        // Mensagem de gol
        this.goalTxt = new TextBlock("goal", "");
        this.goalTxt.fontSize = 34;
        this.goalTxt.fontWeight = "bold";
        this.goalTxt.color = "#FFD700";
        this.goalTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.goalTxt.shadowBlur = 6;
        this.goalTxt.isVisible = false;
        this.ui.addControl(this.goalTxt);

        // Dica inicial
        this.hintTxt = new TextBlock("hint", "");
        this.hintTxt.color = "#FFFFFF";
        this.hintTxt.fontSize = 14;
        this.hintTxt.fontWeight = "bold";
        this.hintTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.hintTxt.shadowBlur = 4;
        this.hintTxt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.hintTxt.paddingBottom = "26px";
        this.ui.addControl(this.hintTxt);

        // Textos flutuantes de Δp (pool)
        for (let i = 0; i < 4; i++) {
            const tb = new TextBlock(`dp_${i}`, "");
            tb.color = "#7FFFD4";
            tb.fontWeight = "bold";
            tb.shadowColor = "rgba(0,0,0,0.9)";
            tb.shadowBlur = 4;
            tb.isVisible = false;
            this.ui.addControl(tb);
            this.floatTexts.push({ tb, life: 0 });
        }

        // Painel de fim de partida
        this.gameOverPanel = new Rectangle("gameOver");
        this.gameOverPanel.width = "86%";
        this.gameOverPanel.height = "220px";
        this.gameOverPanel.cornerRadius = 14;
        this.gameOverPanel.thickness = 2;
        this.gameOverPanel.color = "#FFD24A";
        this.gameOverPanel.background = "rgba(8,10,28,0.92)";
        this.gameOverPanel.isVisible = false;
        this.ui.addControl(this.gameOverPanel);

        this.gameOverTitle = new TextBlock("goTitle", "");
        this.gameOverTitle.color = "white";
        this.gameOverTitle.fontSize = 22;
        this.gameOverTitle.fontWeight = "bold";
        this.gameOverTitle.top = "-65px";
        this.gameOverPanel.addControl(this.gameOverTitle);

        this.gameOverPhrase = new TextBlock("goPhrase", "");
        this.gameOverPhrase.color = "#9FD4FF";
        this.gameOverPhrase.fontSize = 13;
        this.gameOverPhrase.top = "-10px";
        this.gameOverPanel.addControl(this.gameOverPhrase);

        this.playAgainBtn = Button.CreateSimpleButton("playAgain", "");
        this.playAgainBtn.width = "190px";
        this.playAgainBtn.height = "42px";
        this.playAgainBtn.cornerRadius = 10;
        this.playAgainBtn.color = "white";
        this.playAgainBtn.background = "#1A7A2E";
        this.playAgainBtn.fontSize = 15;
        this.playAgainBtn.fontWeight = "bold";
        this.playAgainBtn.top = "60px";
        this.playAgainBtn.onPointerClickObservable.add(() => this.restartMatch());
        this.gameOverPanel.addControl(this.playAgainBtn);

        this.applyTexts();
    }

    private updateAimPanel(aim: AimState): void {
        const name = this.currentLang === 0 ? aim.piece.spec.namePt : aim.piece.spec.nameEn;
        this.aimTxt.text =
            `${name}\n` +
            `m = ${this.fmt(aim.piece.spec.mass, 1)} kg\n` +
            `v = ${this.fmt(aim.velocity, 1)} m/s\n` +
            `p = m·v = ${this.fmt(aim.impulse, 1)} kg·m/s`;
        if (!this.aimPanel.isVisible) {
            this.aimPanel.isVisible = true;
            this.aimPanel.linkWithMesh(aim.piece.mesh);
            this.aimPanel.linkOffsetY = -85;
        }
    }

    private updateScoreText(): void {
        this.scoreTxt.text = this.t(
            `VOCÊ  ${this.playerScore}  ×  ${this.cpuScore}  CPU`,
            `YOU  ${this.playerScore}  ×  ${this.cpuScore}  CPU`
        );
    }

    private updateTurnText(): void {
        switch (this.gameState) {
            case "PLAYER_AIM":
                this.turnTxt.text = this.t("👆 Sua vez — arraste um botão azul", "👆 Your turn — drag a blue piece");
                this.turnTxt.color = "#9FD4FF";
                break;
            case "CPU_TURN":
                this.turnTxt.text = this.t("📺 Vez do adversário…", "📺 Opponent's turn…");
                this.turnTxt.color = "#FFAA99";
                break;
            case "ROLLING":
                this.turnTxt.text = this.t("⚽ Bola em jogo…", "⚽ Ball in play…");
                this.turnTxt.color = "#CCCCCC";
                break;
            default:
                this.turnTxt.text = "";
        }
    }

    private applyTexts(): void {
        this.updateScoreText();
        this.updateTurnText();
        this.hintTxt.text = this.hasShotOnce ? "" : this.t(
            "👆 Toque em um botão azul, arraste\npara trás e solte para lançar!",
            "👆 Tap a blue piece, drag it\nbackwards and release to shoot!"
        );
        this.hintTxt.isVisible = !this.hasShotOnce;
        if (this.playAgainBtn.textBlock) {
            this.playAgainBtn.textBlock.text = this.t("↺ Jogar novamente", "↺ Play again");
        }
    }

    // ── INTEGRAÇÃO COM O CONTROLLER ──────────────────────────────────────────

    public setOnGameOver(cb: () => void): void { this.onGameOverCallback = cb; }
    public setOnGameResume(cb: () => void): void { this.onGameResumeCallback = cb; }

    public setLanguage(lang: number): void {
        this.currentLang = lang;
        this.applyTexts();
    }

    private t(pt: string, en: string): string {
        return this.currentLang === 0 ? pt : en;
    }

    private fmt(n: number, dec: number): string {
        const s = n.toFixed(dec);
        return this.currentLang === 0 ? s.replace(".", ",") : s;
    }

    public dispose(): void {
        if (this.blockedFlashTimer) clearTimeout(this.blockedFlashTimer);
        this.scene.onBeforeRenderObservable.remove(this.gameLoopObserver);
        this.plugin.onTriggerCollisionObservable.remove(this.triggerObserver);
        this.slingshot.dispose();

        this.sparkSystem.dispose();
        this.confettiSystem.dispose();
        this.impactSound?.dispose();

        this.ui.dispose();

        this.scene.meshes.slice().forEach(m => m.dispose());
        this.scene.lights.slice().forEach(l => l.dispose());

        this.camera.detachControl();
        this.camera.dispose();

        this.scene.disablePhysicsEngine();
    }
}
