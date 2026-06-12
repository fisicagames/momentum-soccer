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
import { Piece, Ball, createPiece, createBall, ARCHETYPES, ArchetypeId } from "./PieceFactory";
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
    private static readonly MAX_IMPULSE = 18;  // kg·m/s por jogada (igual para todas as peças)
    /** Saída de bola: momento máximo do passe inicial (recuo suave). */
    private static readonly KICKOFF_MAX_IMPULSE = 2.0;
    private static readonly MAX_DRAG = 2.2;    // m de recuo para o impulso máximo
    private static readonly WIN_GOALS = 3;
    private static readonly SETTLE_SPEED = 0.18;
    private static readonly ROLLING_TIMEOUT = 8; // s
    /** Regra brasileira: limite de toques coletivos por posse de bola. */
    private static readonly TEAM_TOUCHES = 12;
    /** Peça com energia abaixo deste valor fica exaurida no turno (J). */
    private static readonly ENERGY_EXHAUSTED = 1.0;
    /** Limiar do aviso "⚠ Energia Baixa!" no painel (J). */
    private static readonly ENERGY_LOW = 25;
    /** Escala fixa absoluta da barra gráfica de energia (J). */
    private static readonly ENERGY_BAR_MAX = 200;
    /** Largura útil da barra de energia no painel (px de GUI). */
    private static readonly ENERGY_BAR_W = 172;

    private scene: Scene;
    private plugin!: HavokPlugin;

    // Estado da partida
    private gameState: GameState = "PLAYER_AIM";
    private possession: Turn = "player";
    private stateTime = 0;
    private playerScore = 0;
    private cpuScore = 0;
    private hasShotOnce = false;

    // ── Regra de 12 toques ───────────────────────────────────────────────
    // Toques coletivos restantes do time com a posse
    private teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
    // Rastreamento físico do lance em andamento (classificado ao assentar)
    private currentShot: {
        piece: Piece;
        team: Turn;
        ballTouched: boolean;
        foul: boolean;             // tocou adversário ANTES da bola
        oppContactAfterBall: boolean; // deslocou adversário DEPOIS da bola
    } | null = null;

    // ── Conservação de energia ───────────────────────────────────────────
    // Tanque por peça: E(m) = 211.11 − 11.11·m (J), reabastecido no início
    // de cada posse; cada disparo deduz a energia cinética K = ½·m·v².
    private pieceEnergy = new Map<Piece, number>();

    // ── Saída de bola (KICKOFF) ──────────────────────────────────────────
    // Ativa no início do jogo e após cada gol: só o centroavante do time da
    // posse pode ser lançado; desativa assim que o passe inicial sai.
    private kickoffActive = false;
    private playerKickoffPiece!: Piece;
    private cpuKickoffPiece!: Piece;

    // Entidades (os goleiros são peças comuns, no índice 10 dos arrays)
    private playerPieces: Piece[] = [];
    private cpuPieces: Piece[] = [];
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
    private alertTxt!: TextBlock;
    private alertTimer: ReturnType<typeof setTimeout> | null = null;
    private hintTxt!: TextBlock;
    private aimPanel!: Rectangle;
    private aimTxt!: TextBlock;
    private aimEnergyTxt!: TextBlock;
    private energyBarFill!: Rectangle;
    private energyBarSpend!: Rectangle;
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

        // A partida abre com saída de bola do jogador
        this.beginKickoff("player");

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
            // Goleiro: peça comum de 10 kg, jogável como as demais
            { archetype: "goalkeeper", x: 0, z: Arena.GOAL_LINE_Z - 0.45 },
        ];

        for (const f of formation) {
            const y = ARCHETYPES[f.archetype].height / 2 + 0.001;
            this.playerPieces.push(createPiece(this.scene, f.archetype, "player", new Vector3(f.x, y, -f.z)));
            this.cpuPieces.push(createPiece(this.scene, f.archetype, "cpu", new Vector3(-f.x, y, f.z)));
        }

        // Centroavante (velocista central, índice 8): executa a saída de bola
        this.playerKickoffPiece = this.playerPieces[8];
        this.cpuKickoffPiece = this.cpuPieces[8];

        this.ball = createBall(this.scene, new Vector3(0, 0.19, 0));
        this.refillEnergy();
    }

    // ── CONSERVAÇÃO DE ENERGIA ───────────────────────────────────────────────

    /** Energia potencial inicial por massa: E(m) = 211.11 − 11.11·m (J). */
    private static energyCapacity(mass: number): number {
        return 211.11 - 11.11 * mass;
    }

    private energyOf(piece: Piece): number {
        return this.pieceEnergy.get(piece) ?? MomentumSoccerGame.energyCapacity(piece.spec.mass);
    }

    /** Reabastece o tanque de todas as peças em campo (início de cada posse). */
    private refillEnergy(): void {
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            this.pieceEnergy.set(p, MomentumSoccerGame.energyCapacity(p.spec.mass));
        }
    }

    /**
     * Impulso máximo que a energia restante da peça permite:
     * K = J²/(2m) ≤ E  ⇒  J = √(2·m·E).
     */
    private energyImpulseCap(piece: Piece): number {
        const energy = Math.max(this.energyOf(piece), 0);
        return Math.sqrt(2 * piece.spec.mass * energy);
    }

    private isExhausted(piece: Piece): boolean {
        return this.energyOf(piece) <= MomentumSoccerGame.ENERGY_EXHAUSTED;
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
        this.teleport(this.ball.mesh, this.ball.home, this.ball.aggregate);
        this.pendingGoal = null;
        this.currentShot = null;
    }

    /** Entra no estado de mira do time com a posse. */
    private enterTurnState(): void {
        this.enterState(this.possession === "player" ? "PLAYER_AIM" : "CPU_TURN");
    }

    /**
     * Saída de bola tática: o centroavante do time da posse é posicionado
     * ligeiramente à frente da bola (rumo ao campo adversário), a um raio de
     * distância — o ângulo de chute direto ao gol fica impraticável e o
     * primeiro lance vira naturalmente um recuo ou passe lateral. Só ele
     * pode ser selecionado até o passe inicial sair.
     */
    private beginKickoff(team: Turn): void {
        const piece = team === "player" ? this.playerKickoffPiece : this.cpuKickoffPiece;
        const gap = this.ball.radius + piece.spec.radius + piece.spec.radius; // folga = raio do botão
        const sign = team === "player" ? 1 : -1;
        this.teleport(piece.mesh, this._tmp.set(0, piece.home.y, sign * gap), piece.aggregate);

        // Centroavante adversário recua para fora do círculo central
        // (raio 1.8): só o executor da saída fica dentro do círculo.
        const defender = team === "player" ? this.cpuKickoffPiece : this.playerKickoffPiece;
        this.teleport(defender.mesh, this._tmp.set(0, defender.home.y, sign * 2.2), defender.aggregate);

        this.kickoffActive = true;
        this.changePossessionTo(team);
    }

    /**
     * Mudança de posse: o novo time recebe 12 toques coletivos e a energia
     * potencial de todas as peças em campo é reabastecida (E = 211.11 − 11.11·m).
     */
    private changePossessionTo(team: Turn): void {
        this.possession = team;
        this.teamTouchesLeft = MomentumSoccerGame.TEAM_TOUCHES;
        this.refillEnergy();
        this.enterTurnState();
    }

    /**
     * Classifica o lance após todos os corpos pararem (máquina de estados da
     * regra de 12 toques) e decide se a posse continua ou muda.
     */
    private resolveShot(): void {
        const shot = this.currentShot;
        this.currentShot = null;
        if (!shot) {
            this.enterTurnState();
            return;
        }
        const opponent: Turn = shot.team === "player" ? "cpu" : "player";

        // Infração: tocou peça/goleiro adversário sem ter tocado a bola antes
        if (shot.foul) {
            this.showAlert(this.t("🚫 Colisão ilegal (falta)! Posse perdida.", "🚫 Illegal contact (foul)! Possession lost."), "#FF6655");
            this.changePossessionTo(opponent);
            return;
        }

        // Lance legal: consome 1 toque coletivo
        this.teamTouchesLeft--;

        let alert: [string, string] | null = null;

        // Bola antes, adversário depois: legal, mas restam no máximo 3 toques
        if (shot.oppContactAfterBall) {
            this.teamTouchesLeft = Math.min(this.teamTouchesLeft, 3);
            alert = ["⚠️ Colisão com adversário! Turno reduzido para mais 3 toques!", "⚠️ Contact with opponent! Turn reduced to 3 more touches!"];
        }

        // 12º toque sem gol: posse esgotada
        if (this.teamTouchesLeft <= 0) {
            this.showAlert(this.t("⏱ Turno esgotado! Posse perdida.", "⏱ Touches exhausted! Possession lost."), "#FF6655");
            this.changePossessionTo(opponent);
            return;
        }

        if (alert) this.showAlert(this.t(alert[0], alert[1]), "#FFC34D");
        this.enterTurnState();
    }

    /**
     * Registra o disparo para a regra de 12 toques e deduz do tanque da peça
     * a energia cinética gerada pelo lance: K = J²/(2m) = ½·m·v².
     */
    private trackShot(piece: Piece, team: Turn, impulse: number): void {
        const kinetic = (impulse * impulse) / (2 * piece.spec.mass);
        this.pieceEnergy.set(piece, this.energyOf(piece) - kinetic);
        this.currentShot = {
            piece, team,
            ballTouched: false,
            foul: false,
            oppContactAfterBall: false,
        };
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
            // Teto dinâmico: a energia restante da peça limita K = ½·m·v²
            // (e a saída de bola limita o momento a 2 kg·m/s)
            impulseCap: (piece) => Math.min(
                this.kickoffActive ? MomentumSoccerGame.KICKOFF_MAX_IMPULSE : MomentumSoccerGame.MAX_IMPULSE,
                this.energyImpulseCap(piece)
            ),
            playerPieces: () => this.playerPieces,
            canAim: () => this.gameState === "PLAYER_AIM",
            // Bloqueios de seleção: peça exaurida ou fora da saída de bola
            canSelectPiece: (piece) =>
                !this.isExhausted(piece) &&
                (!this.kickoffActive || piece === this.playerKickoffPiece),
            onBlockedTap: (piece) => {
                if (this.kickoffActive && piece !== this.playerKickoffPiece) {
                    this.showAlert(this.t(
                        "⚽ Saída de bola: passe obrigatório com o centroavante!",
                        "⚽ Kickoff: mandatory pass with the centre forward!"
                    ), "#FFC34D");
                } else {
                    this.showAlert(this.t(
                        "🚫 Peça sem energia! Escolha outro jogador!",
                        "🚫 Piece out of energy! Pick another player!"
                    ), "#FF6655");
                }
            },
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
        this.kickoffActive = false; // passe inicial dado: seleção liberada
        this.trackShot(aim.piece, "player", aim.impulse);
        this.enterState("ROLLING");
    }

    // ── IA DO ADVERSÁRIO ─────────────────────────────────────────────────────

    /**
     * Corredor livre? Verifica a distância de cada peça (exceto as excluídas,
     * goleiros incluídos) ao segmento no plano XZ, contra o raio em movimento.
     */
    private isCorridorBlocked(from: Vector3, to: Vector3, movingRadius: number, exclude: Mesh[]): boolean {
        const segX = to.x - from.x, segZ = to.z - from.z;
        const segLen2 = segX * segX + segZ * segZ;
        if (segLen2 < 1e-6) return false;

        const blockers: { x: number; z: number; radius: number }[] = [];
        for (const p of [...this.playerPieces, ...this.cpuPieces]) {
            if (exclude.includes(p.mesh)) continue;
            blockers.push({ x: p.mesh.position.x, z: p.mesh.position.z, radius: p.spec.radius });
        }

        for (const blk of blockers) {
            // Projeção do centro do bloqueador no segmento (plano XZ)
            const t = Math.max(0, Math.min(1, ((blk.x - from.x) * segX + (blk.z - from.z) * segZ) / segLen2));
            const dx = blk.x - (from.x + segX * t);
            const dz = blk.z - (from.z + segZ * t);
            const clearance = movingRadius + blk.radius + 0.04;
            if (dx * dx + dz * dz < clearance * clearance) return true;
        }
        return false;
    }

    /** Linha de visão da peça atiradora até o ponto de contato. */
    private isPathBlocked(shooter: Piece, from: Vector3, to: Vector3): boolean {
        return this.isCorridorBlocked(from, to, shooter.spec.radius, [shooter.mesh, this.ball.mesh]);
    }

    /**
     * CPU estratégica dentro da regra de 12 toques + conservação de energia:
     *  - Caminho da bola ao gol LIVRE (ou último toque coletivo): chute direto
     *    com a força máxima que a energia da peça permitir;
     *  - Caminho BLOQUEADO com toques sobrando: passe suave dosado para gastar
     *    pouca energia cinética e preservar os botões (goleiro incluído);
     *  - Nunca seleciona peça exaurida (energia ≤ 1 J); o goleiro de 10 kg é
     *    um candidato comum — útil para rebater bolas na pequena área.
     */
    private cpuShoot(): void {
        if (this.kickoffActive) {
            this.cpuKickoffPass();
            return;
        }

        const ballPos = this.ball.mesh.position;
        const playerGoal = this._tmp2.set(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3);

        // Sem energia, sem lance: peças exauridas ficam de fora do turno
        const candidates = this.cpuPieces.filter(p => !this.isExhausted(p));
        if (candidates.length === 0) return;

        // O caminho da bola até o gol está livre?
        const goalPathClear = !this.isCorridorBlocked(ballPos, playerGoal, this.ball.radius, [this.ball.mesh]);
        let shootAtGoal = goalPathClear || this.teamTouchesLeft <= 1;

        // Alvo da bola: o gol (chute) ou o companheiro mais bem posicionado (passe)
        let target = playerGoal.clone();
        if (!shootAtGoal) {
            let bestMate: Piece | null = null;
            let bestMateScore = -Infinity;
            for (const mate of this.cpuPieces) {
                const matePos = mate.mesh.position;
                const dist = Vector3.Distance(matePos, ballPos);
                if (dist < 0.9) continue; // já está colado na bola
                const blocked = this.isCorridorBlocked(ballPos, matePos, this.ball.radius, [this.ball.mesh, mate.mesh]);
                const advance = ballPos.z - matePos.z; // companheiro mais avançado rumo ao gol do jogador
                const score = (blocked ? 0 : 1.5) + advance * 0.10 - dist * 0.06;
                if (score > bestMateScore) {
                    bestMateScore = score;
                    bestMate = mate;
                }
            }
            if (bestMate) target = bestMate.mesh.position.clone();
            else shootAtGoal = true; // sem opção de passe: tenta o chute
        }

        const desired = target.subtract(ballPos);
        desired.y = 0;
        desired.normalize();

        const W_PROXIMITY = 0.6;
        const W_ALIGNMENT = 0.4;
        const BLOCKED_PENALTY = 0.25;

        let best: { piece: Piece; dir: Vector3; dist: number; align: number; score: number } | null = null;

        for (const piece of candidates) {
            // Ponto de contato atrás da bola (na direção oposta ao alvo)
            const contact = ballPos.subtract(desired.scale(this.ball.radius + piece.spec.radius));
            const dir = contact.subtract(piece.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.05) continue;
            dir.normalize();

            const proximity = Math.exp(-dist / 3);
            const align = Vector3.Dot(dir, desired);
            const alignment = (align + 1) / 2;

            let score = W_PROXIMITY * proximity + W_ALIGNMENT * alignment;
            if (this.isPathBlocked(piece, piece.mesh.position, contact)) {
                score *= BLOCKED_PENALTY; // colisão antes da bola seria falta
            }
            if (!best || score > best.score) {
                best = { piece, dir, dist, align, score };
            }
        }
        if (!best) return;

        let impulse: number;
        if (shootAtGoal) {
            // Chute direto ao gol com a força máxima disponível
            impulse = MomentumSoccerGame.MAX_IMPULSE;
        } else {
            // Passe suave dosado: a bola deve chegar ao companheiro gastando o
            // mínimo de energia cinética (preserva o tanque da peça)
            const travel = Vector3.Distance(ballPos, target);
            const vBall = Math.min(1.2 + travel * 0.55, 3.2);
            const m = best.piece.spec.mass;
            // Transferência aproximada de momento no impacto + perda na aproximação
            const vPiece = vBall * (m + this.ball.mass) / (2 * m) + best.dist * 0.25;
            impulse = Math.min(m * Math.max(vPiece, 0.8), MomentumSoccerGame.MAX_IMPULSE);
        }
        // A energia restante da peça limita o lance: K = J²/(2m) ≤ E
        impulse = Math.min(impulse, this.energyImpulseCap(best.piece));

        // Erro humano simulado (menor em chutes bem alinhados)
        const noise = (Math.random() - 0.5) * 0.14 * (1.2 - Math.max(best.align, 0));
        const cos = Math.cos(noise), sin = Math.sin(noise);
        const dx = best.dir.x * cos - best.dir.z * sin;
        const dz = best.dir.x * sin + best.dir.z * cos;

        this._tmp.set(dx * impulse, 0, dz * impulse);
        best.piece.aggregate.body.applyImpulse(this._tmp, best.piece.mesh.getAbsolutePosition());

        this.trackShot(best.piece, "cpu", impulse);
        this.enterState("ROLLING");
    }

    /**
     * Saída de bola da CPU: o centroavante (à frente da bola) recua o passe
     * para o próprio campo com um leve desvio lateral.
     */
    private cpuKickoffPass(): void {
        const piece = this.cpuKickoffPiece;
        const dir = this.ball.mesh.position.subtract(piece.mesh.position);
        dir.y = 0;
        dir.normalize();

        const angle = (Math.random() - 0.5) * 0.7; // desvio lateral do recuo
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const dx = dir.x * cos - dir.z * sin;
        const dz = dir.x * sin + dir.z * cos;

        // A CPU obedece ao mesmo teto da saída de bola (p ≤ 2 kg·m/s)
        const impulse = Math.min(piece.spec.mass * 2.5, MomentumSoccerGame.KICKOFF_MAX_IMPULSE);
        this._tmp.set(dx * impulse, 0, dz * impulse);
        piece.aggregate.body.applyImpulse(this._tmp, piece.mesh.getAbsolutePosition());

        this.kickoffActive = false;
        this.trackShot(piece, "cpu", impulse);
        this.enterState("ROLLING");
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
            this.ball.mesh.name,
        ]);

        const handler = (ev: IPhysicsCollisionEvent) => {
            if (ev.type !== PhysicsEventType.COLLISION_STARTED) return;

            // Regra de 12 toques: registra os contatos do botão disparado
            if (this.currentShot && this.gameState === "ROLLING") {
                this.trackShotCollision(ev);
            }

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

    /**
     * Atualiza o lance em andamento com os contatos do botão disparado:
     * bola (legaliza o lance) e adversários (falta se antes da bola,
     * penalidade de 3 toques se depois).
     */
    private trackShotCollision(ev: IPhysicsCollisionEvent): void {
        const shot = this.currentShot!;
        const shooterMesh = shot.piece.mesh;
        const nodeA = ev.collider.transformNode;
        const nodeB = ev.collidedAgainst.transformNode;
        const other = nodeA === shooterMesh ? nodeB : nodeB === shooterMesh ? nodeA : null;
        if (!other) return;

        if (other === this.ball.mesh) {
            shot.ballTouched = true;
            return;
        }

        const otherPiece = (other as Mesh).metadata?.piece as Piece | undefined;
        const oppTeam: Turn = shot.team === "player" ? "cpu" : "player";
        if (otherPiece && otherPiece.team === oppTeam) {
            if (shot.ballTouched) shot.oppContactAfterBall = true;
            else shot.foul = true;
        }
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
            this.updateFeedbackAnimations(dt);
            this.safetyFilter();

            switch (this.gameState) {
                case "ROLLING": {
                    const goal = this.detectGoal();
                    if (goal) { this.onGoal(goal); break; }
                    if (this.stateTime > 0.7 && (this.maxBodySpeed() < MomentumSoccerGame.SETTLE_SPEED || this.stateTime > MomentumSoccerGame.ROLLING_TIMEOUT)) {
                        // Bola morta atrás da linha → tiro de meta; senão,
                        // classifica o lance pela regra de 12 toques
                        if (!this.checkGoalKick()) this.resolveShot();
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
        this.teleport(this.ball.mesh, this._tmp.set(0, 0.19, side * (Arena.GOAL_LINE_Z - 2.2)), this.ball.aggregate);
        this.currentShot = null;
        this.showAlert(this.t("⚽ Tiro de meta", "⚽ Goal kick"), "#CCCCCC");
        this.changePossessionTo(side > 0 ? "cpu" : "player"); // a defesa repõe a bola
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

        this.currentShot = null;
        this.enterState("GOAL_PAUSE");

        setTimeout(() => {
            this.goalTxt.isVisible = false;
            if (this.gameState !== "GOAL_PAUSE") return;
            if (this.playerScore >= MomentumSoccerGame.WIN_GOALS || this.cpuScore >= MomentumSoccerGame.WIN_GOALS) {
                this.endMatch();
            } else {
                this.resetFormation();
                // Quem sofre o gol recomeça com saída de bola obrigatória
                this.beginKickoff(scorer === "player" ? "cpu" : "player");
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
        this.beginKickoff("player");
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

        // Painel de telemetria da mira (m, v, p, K, P): fixo em screen-space no
        // canto inferior esquerdo (layout retrato) — não obstrui o campo
        // central, a trajetória do chute nem o dedo durante o arrasto, e fica
        // afastado do botão Home (canto inferior direito).
        this.aimPanel = new Rectangle("aimPanel");
        this.aimPanel.width = "196px";
        this.aimPanel.height = "122px";
        this.aimPanel.cornerRadius = 8;
        this.aimPanel.thickness = 1;
        this.aimPanel.color = "#FFD24A";
        this.aimPanel.background = "rgba(10,10,30,0.78)";
        this.aimPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.aimPanel.left = "12px";
        this.aimPanel.top = "-80px"; // margem segura acima da borda inferior
        this.aimPanel.isVisible = false;
        this.ui.addControl(this.aimPanel);

        // Barra gráfica de energia (escala fixa 0–200 J) no topo do card:
        // fundo translúcido = capacidade; verde = energia restante da peça;
        // laranja = fatia que o lance atual converterá em energia cinética.
        const barBg = new Rectangle("energyBarBg");
        barBg.width = `${MomentumSoccerGame.ENERGY_BAR_W}px`;
        barBg.height = "10px";
        barBg.thickness = 0;
        barBg.cornerRadius = 4;
        barBg.background = "rgba(255,255,255,0.16)";
        barBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        barBg.top = "8px";
        this.aimPanel.addControl(barBg);

        this.energyBarFill = new Rectangle("energyBarFill");
        this.energyBarFill.height = "100%";
        this.energyBarFill.thickness = 0;
        this.energyBarFill.cornerRadius = 4;
        this.energyBarFill.background = "#37D67A";
        this.energyBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        barBg.addControl(this.energyBarFill);

        this.energyBarSpend = new Rectangle("energyBarSpend");
        this.energyBarSpend.height = "100%";
        this.energyBarSpend.thickness = 0;
        this.energyBarSpend.cornerRadius = 4;
        this.energyBarSpend.background = "#FF8A3D";
        this.energyBarSpend.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        barBg.addControl(this.energyBarSpend);

        this.aimTxt = new TextBlock("aimTxt", "");
        this.aimTxt.color = "white";
        this.aimTxt.fontSize = 11;
        this.aimTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.aimTxt.paddingLeft = "10px";
        this.aimTxt.paddingTop = "24px"; // abaixo da barra de energia
        this.aimPanel.addControl(this.aimTxt);

        // Tanque de energia da peça (E restante / gasto projetado / aviso)
        this.aimEnergyTxt = new TextBlock("aimEnergyTxt", "");
        this.aimEnergyTxt.color = "#7FFFD4";
        this.aimEnergyTxt.fontSize = 11;
        this.aimEnergyTxt.fontWeight = "bold";
        this.aimEnergyTxt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.aimEnergyTxt.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.aimEnergyTxt.paddingLeft = "10px";
        this.aimEnergyTxt.paddingBottom = "7px";
        this.aimPanel.addControl(this.aimEnergyTxt);

        // Mensagem de gol
        this.goalTxt = new TextBlock("goal", "");
        this.goalTxt.fontSize = 34;
        this.goalTxt.fontWeight = "bold";
        this.goalTxt.color = "#FFD700";
        this.goalTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.goalTxt.shadowBlur = 6;
        this.goalTxt.isVisible = false;
        this.ui.addControl(this.goalTxt);

        // Alertas da regra de 12 toques (faltas, turno esgotado, peça sem energia)
        this.alertTxt = new TextBlock("alert", "");
        this.alertTxt.fontSize = 14;
        this.alertTxt.fontWeight = "bold";
        this.alertTxt.color = "#FFC34D";
        this.alertTxt.shadowColor = "rgba(0,0,0,0.9)";
        this.alertTxt.shadowBlur = 5;
        this.alertTxt.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.alertTxt.top = "62px";
        this.alertTxt.height = "30px";
        this.alertTxt.isVisible = false;
        this.ui.addControl(this.alertTxt);

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

        // Energia cinética e potência média do impacto (Δt de contato = 0,1 s)
        const kinetic = 0.5 * aim.piece.spec.mass * aim.velocity * aim.velocity;
        const power = kinetic / 0.1;
        const energyLeft = this.energyOf(aim.piece);

        this.aimTxt.text =
            `${name}\n` +
            `m = ${this.fmt(aim.piece.spec.mass, 1)} kg | v = ${this.fmt(aim.velocity, 1)} m/s\n` +
            `p = ${this.fmt(aim.impulse, 1)} kg·m/s\n` +
            `K = ${this.fmt(kinetic, 1)} J | P = ${this.fmt(power, 1)} W`;

        // Tanque de energia: restante e consumo projetado do lance
        const low = energyLeft - kinetic <= MomentumSoccerGame.ENERGY_LOW;
        this.aimEnergyTxt.text =
            this.t(`E. Restante: ${this.fmt(energyLeft, 1)} J`, `Energy left: ${this.fmt(energyLeft, 1)} J`) +
            this.t(` | Gasto: -${this.fmt(kinetic, 1)} J`, ` | Spend: -${this.fmt(kinetic, 1)} J`) +
            (low ? this.t("\n⚠ Energia Baixa!", "\n⚠ Low Energy!") : "");
        this.aimEnergyTxt.color = low ? "#FF6655" : "#7FFFD4";

        // Barra gráfica (escala absoluta 0–200 J): verde = energia que sobra
        // após o lance; laranja = fatia convertida em K neste disparo.
        const barW = MomentumSoccerGame.ENERGY_BAR_W;
        const max = MomentumSoccerGame.ENERGY_BAR_MAX;
        const remainAfter = Math.max(energyLeft - kinetic, 0);
        const spend = Math.min(kinetic, Math.max(energyLeft, 0));
        this.energyBarFill.width = `${(remainAfter / max) * barW}px`;
        this.energyBarSpend.left = `${(remainAfter / max) * barW}px`;
        this.energyBarSpend.width = `${(spend / max) * barW}px`;

        this.aimPanel.isVisible = true;
    }

    /** Aviso rápido central (faltas, turno esgotado, peça sem energia). */
    private showAlert(text: string, color: string): void {
        this.alertTxt.text = text;
        this.alertTxt.color = color;
        this.alertTxt.isVisible = true;
        if (this.alertTimer) clearTimeout(this.alertTimer);
        this.alertTimer = setTimeout(() => {
            this.alertTimer = null;
            this.alertTxt.isVisible = false;
        }, 2600);
    }

    private updateScoreText(): void {
        this.scoreTxt.text = this.t(
            `VOCÊ  ${this.playerScore}  ×  ${this.cpuScore}  CPU`,
            `YOU  ${this.playerScore}  ×  ${this.cpuScore}  CPU`
        );
    }

    private updateTurnText(): void {
        const touches = `${this.teamTouchesLeft}/${MomentumSoccerGame.TEAM_TOUCHES}`;
        switch (this.gameState) {
            case "PLAYER_AIM":
                this.turnTxt.text = this.kickoffActive
                    ? this.t("⚽ Saída de bola — passe com o centroavante!", "⚽ Kickoff — pass with the centre forward!")
                    : this.t(`👆 Sua posse — Toques: ${touches}`, `👆 Your possession — Touches: ${touches}`);
                this.turnTxt.color = "#9FD4FF";
                break;
            case "CPU_TURN":
                this.turnTxt.text = this.kickoffActive
                    ? this.t("📺 Saída de bola do adversário…", "📺 Opponent's kickoff…")
                    : this.t(`📺 Posse do adversário — Toques: ${touches}`, `📺 Opponent's possession — Touches: ${touches}`);
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
        if (this.alertTimer) clearTimeout(this.alertTimer);
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
