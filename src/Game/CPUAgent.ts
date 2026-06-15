import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Piece, Ball } from "./PieceFactory";
import { Arena } from "./Arena";
import { MomentumSoccerGame } from "./MomentumSoccerGame";

/**
 * Agente de Inteligência Artificial para a CPU (Joule Cup 2026).
 * 
 * Responsável por decidir taticamente se realiza um chute direto de alto momento
 * ou um passe rápido e preciso, respeitando os tanques de energia individuais e
 * evitando colisões diretas ilegais (faltas).
 */
export class CPUAgent {
    private static readonly BLOCKED_PENALTY = 0.20;
    private static readonly W_PROXIMITY = 0.75; // IA prefere peças que já estão próximas à bola
    private static readonly W_ALIGNMENT = 0.25;

    /** Executa a decisão tática da CPU no turno ativo e dispara o botão correspondente */
    public static executeTurn(game: MomentumSoccerGame): void {
        const ball = game.getBall();
        const ballPos = ball.mesh.position;
        const playerGoal = new Vector3(0, ballPos.y, -Arena.GOAL_LINE_Z - 0.3);

        // Filtra os candidatos ativos (ignora goleiro exaurido ou peças expulsas da lista ativa)
        const candidates = game.getCpuPieces().filter(p => !game.isPieceExhausted(p));
        if (candidates.length === 0) return;

        // O caminho da bola até o gol do jogador está livre?
        const goalPathClear = !CPUAgent.isCorridorBlocked(game, ballPos, playerGoal, ball.radius, [ball.mesh]);
        
        // Decisão de chute agressivo: caminho livre, fim de turno (<=4) ou chance de finalização (<7.5m com 50% de risco)
        const distToGoal = Vector3.Distance(ballPos, playerGoal);
        const randomShotRisk = distToGoal < 7.5 && Math.random() < 0.5;
        let shootAtGoal = goalPathClear || game.getTeamTouchesLeft() <= 4 || randomShotRisk;

        // Alvo final do disparo: o gol ou o companheiro livre mais avançado
        // Alvo final do disparo: o gol ou o companheiro livre mais avançado
        let target = playerGoal.clone();
        if (!shootAtGoal) {
            let bestMate: Piece | null = null;
            let bestMateScore = -Infinity;
            
            // Detecta se a bola está posicionada de forma profunda nas alas (área de cruzamento)
            const isCrossingSituation = Math.abs(ballPos.z) > Arena.GOAL_LINE_Z - 1.2;

            for (const mate of game.getCpuPieces()) {
                const matePos = mate.mesh.position;
                const dist = Vector3.Distance(matePos, ballPos);
                if (dist < 0.9) continue; // já está colado na bola
                const blocked = CPUAgent.isCorridorBlocked(game, ballPos, matePos, ball.radius, [ball.mesh, mate.mesh]);
                const advance = ballPos.z - matePos.z; // avanço em direção ao gol do jogador (-Z)
                
                let advanceScore = advance * 0.15;
                if (isCrossingSituation) {
                    // Em situação de cruzamento ou escanteio, prioriza companheiros posicionados na grande área adversária
                    const inBoxX = Math.abs(matePos.x) < 2.5;
                    const inBoxZ = matePos.z < -3.0 && matePos.z > -7.0; // Área de finalização na defesa do jogador (-Z)
                    if (inBoxX && inBoxZ) {
                        advanceScore = 1.0; // Bônus tático alto para receber o cruzamento de cabeça/chute
                    } else {
                        advanceScore = -0.5; // Penaliza passes curtos inócuos próximos à lateral de fundo
                    }
                }

                const score = (blocked ? 0 : 2.0) + advanceScore - dist * 0.08;
                if (score > bestMateScore) {
                    bestMateScore = score;
                    bestMate = mate;
                }
            }
            if (bestMate) target = bestMate.mesh.position.clone();
            else shootAtGoal = true; // sem opção de passe: força o chute
        }

        const desired = target.subtract(ballPos);
        desired.y = 0;
        desired.normalize();

        let best: { piece: Piece; dir: Vector3; dist: number; align: number; score: number } | null = null;

        for (const piece of candidates) {
            // Ponto de contato físico ideal atrás da bola
            const contact = ballPos.subtract(desired.scale(ball.radius + piece.spec.radius));

            // ── SOLUÇÃO 1: TRAVA DE PAREDE LATERAL (Capping de X) ────────────
            // Se a bola estiver na lateral do campo, impede que o ponto de contato
            // calculado caia para fora do muro invisível (X = ±4.0), o que faria
            // o botão da CPU ficar batendo contra a parede sem tocar na bola.
            const maxContactX = Arena.FIELD_W / 2 - piece.spec.radius - 0.05;
            contact.x = Math.max(-maxContactX, Math.min(maxContactX, contact.x));

            const dir = contact.subtract(piece.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.05) continue;
            dir.normalize();

            // Decaimento exponencial de proximidade para priorizar quem já está perto da bola
            const proximity = Math.exp(-dist / 1.8);
            const align = Vector3.Dot(dir, desired);
            const alignment = (align + 1) / 2;

            let score = CPUAgent.W_PROXIMITY * proximity + CPUAgent.W_ALIGNMENT * alignment;

            // ── SOLUÇÃO 2: EVITAR VAI-E-VEM EM BOLAS COLADAS ─────────────────
            // Se o botão estiver colado na bola, mas em um ângulo ruim para o gol
            // (ex: na frente ou de lado), penaliza o score drasticamente. Isso força
            // a CPU a escolher outro companheiro livre que venha de trás com bom ângulo.
            if (dist < 0.6 && align < 0.4) {
                score *= 0.15;
            }

            if (CPUAgent.isPathBlocked(game, piece, piece.mesh.position, contact)) {
                score *= CPUAgent.BLOCKED_PENALTY; // colisão antes da bola seria falta
            }
            if (!best || score > best.score) {
                best = { piece, dir, dist, align, score };
            }
        }
        if (!best) return;

        let impulse: number;
        if (shootAtGoal) {
            // Chute de finalização com potência máxima
            impulse = MomentumSoccerGame.MAX_IMPULSE;
        } else {
            // Passe dinâmico e firme dosado pela distância (VBall de 2.2 a 4.5 m/s)
            const travel = Vector3.Distance(ballPos, target);
            const vBall = Math.min(2.2 + travel * 0.65, 4.5);
            const m = best.piece.spec.mass;
            const vPiece = vBall * (m + ball.mass) / (2 * m) + best.dist * 0.25;
            
            // Força um impulso mínimo de 2.5 para evitar "micro-toques" e empurrar a bola com firmeza
            impulse = Math.min(m * Math.max(vPiece, 1.4), MomentumSoccerGame.MAX_IMPULSE);
            impulse = Math.max(impulse, 2.5); 
        }
        
        // ── REDUÇÃO DE INTENSIDADE PARA 1/3 NO ESCANTEIO ──
        // Detecta se a bola está posicionada em um dos cantos de fundo do campo (zona de escanteio)
        const isCornerKick = Math.abs(ballPos.z) > Arena.GOAL_LINE_Z - 1.0 && Math.abs(ballPos.x) > Arena.FIELD_W / 2 - 1.0;
        if (isCornerKick) {
            // Reduz para 1/3 da intensidade (máximo de 6.0), com piso mínimo de 2.0 para cruzamentos bem distribuídos
            impulse = Math.max(impulse * (1 / 3), 2.0);
        }
        
        // Capping estrito de segurança pela energia restante do botão: K = J²/(2m) <= E
        impulse = Math.min(impulse, game.getEnergyImpulseCap(best.piece));

        // Erro humano simulado baseado no alinhamento do chute
        const noise = (Math.random() - 0.5) * 0.12 * (1.2 - Math.max(best.align, 0));
        const cos = Math.cos(noise), sin = Math.sin(noise);
        const dx = best.dir.x * cos - best.dir.z * sin;
        const dz = best.dir.x * sin + best.dir.z * cos;

        // Vetor local isolado de impulso (impede corrupção assíncrona por updateCamera)
        const impulseVector = new Vector3(dx * impulse, 0, dz * impulse);
        game.applyCPUShot(best.piece, impulseVector, impulse);
    }

    private static isCorridorBlocked(game: MomentumSoccerGame, from: Vector3, to: Vector3, movingRadius: number, exclude: Mesh[]): boolean {
        const segX = to.x - from.x, segZ = to.z - from.z;
        const segLen2 = segX * segX + segZ * segZ;
        if (segLen2 < 1e-6) return false;

        const blockers: { x: number; z: number; radius: number }[] = [];
        for (const p of [...game.getPlayerPieces(), ...game.getCpuPieces()]) {
            if (exclude.includes(p.mesh)) continue;
            blockers.push({ x: p.mesh.position.x, z: p.mesh.position.z, radius: p.spec.radius });
        }

        for (const blk of blockers) {
            const t = Math.max(0, Math.min(1, ((blk.x - from.x) * segX + (blk.z - from.z) * segZ) / segLen2));
            const dx = blk.x - (from.x + segX * t);
            const dz = blk.z - (from.z + segZ * t);
            const clearance = movingRadius + blk.radius + 0.04;
            if (dx * dx + dz * dz < clearance * clearance) return true;
        }
        return false;
    }

    private static isPathBlocked(game: MomentumSoccerGame, shooter: Piece, from: Vector3, to: Vector3): boolean {
        return CPUAgent.isCorridorBlocked(game, from, to, shooter.spec.radius, [shooter.mesh, game.getBall().mesh]);
    }
}