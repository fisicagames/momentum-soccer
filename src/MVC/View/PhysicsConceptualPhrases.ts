export class PhysicsConceptualPhrases {
    public static getRandomMomentumPhrase(languageOption: number): string {
        const phrasesPt = [
            "O momento linear (ou quantidade de movimento) é uma grandeza vetorial definida pelo produto da massa de um corpo pela sua velocidade: p = m·v.",
            "O impulso de uma força resultante sobre um corpo provoca uma variação correspondente em seu momento linear: J = F·Δt = Δp.",
            "Na colisão entre os botões, o momento linear total do sistema se conserva, pois as forças externas de atrito são desprezíveis durante o breve intervalo de impacto.",
            "Para um mesmo impulso de disparo, botões de maior massa (defensores) adquirem menor velocidade que os de menor massa (atacantes): v = p/m.",
            "A força média trocada na colisão é inversamente proporcional ao tempo de contato: F = Δp/Δt. É por isso que redes macias reduzem o impacto da bola.",
            "Pela Terceira Lei de Newton, quando o seu botão se choca com outro, ambos experimentam forças de mesma intensidade, mesma direção e sentidos opostos.",
            "Em uma colisão perfeitamente elástica, tanto o momento linear quanto a energia cinética total do sistema se conservam integralmente após o choque.",
            "Em uma colisão perfeitamente inelástica, a perda de energia cinética é máxima e os corpos passam a se mover juntos com a mesma velocidade vetorial.",
            "O momento linear é uma grandeza vetorial. Ao arrastar a mira do estilingue, a direção e o sentido da sua ação determinam a trajetória exata do botão.",
            "O atrito cinético entre a base dos botões e o feltro da mesa atua como uma força externa dissipativa, reduzindo gradualmente o momento linear das peças.",
            "Forças dissipativas, como o atrito entre os botões e o feltro, realizam trabalho negativo sobre as peças, transformando parte da energia mecânica em energia térmica e sonora.",
            "Pela Primeira Lei de Newton (Lei da Inércia), um botão em movimento retilíneo uniforme continuaria deslizando indefinidamente se não existisse a força externa de atrito para desacelerá-lo.",
            "O Teorema do Trabalho-Energia Cinética estabelece que o trabalho total realizado para acelerar um botão a partir do repouso é igual à sua energia cinética final: W = ΔK.",
            "A potência média desenvolvida no lançamento mede a taxa de rapidez com que o trabalho mecânico transfere energia para o botão durante o empurrão: P = W/Δt.",
            "Quando o seu botão colide com a bola, parte de seu momento linear é transferida para ela, evidenciando a transferência e conservação de movimento em sistemas isolados."
        ];

        const phrasesEn = [
            "Linear momentum is a vector quantity defined as the product of an object's mass and its velocity: p = m·v.",
            "The impulse of a net force acting on an object is equal to the change in its linear momentum: J = F·Δt = Δp.",
            "In collisions between buttons, the system's total linear momentum is conserved because external forces like friction are negligible during the brief impact.",
            "For a given impulse, heavier buttons (defenders) acquire less velocity than lighter ones (attackers) due to their larger mass: v = p/m.",
            "The average impact force during a collision decreases as the contact time increases: F = Δp/Δt. This is why soft nets cushion the ball's impact.",
            "According to Newton's Third Law, when two buttons collide, they exert forces on each other that are equal in magnitude and opposite in direction.",
            "In a perfectly elastic collision, both the total linear momentum and the total kinetic energy of the system are fully conserved.",
            "In a perfectly inelastic collision, the kinetic energy loss is maximized, and the colliding bodies move together with a common velocity.",
            "Linear momentum is a vector quantity. When aiming your shot, the direction and orientation of your drag determine the exact path of the button.",
            "Kinetic friction between the button base and the table felt acts as a dissipative external force, gradually reducing the system's linear momentum.",
            "Dissipative forces, such as friction between the buttons and the felt, perform negative work on the pieces, converting a portion of the mechanical energy into thermal and acoustic energy.",
            "According to Newton's First Law (Law of Inertia), a button in uniform straight-line motion would continue sliding indefinitely if there were no external friction force to decelerate it.",
            "The Work-Energy Theorem shows that the net work done to accelerate a button from rest is equal to its final kinetic energy: W = ΔK.",
            "Average power measures the rate of energy transfer to the button over the duration of the push or strike: P = W/Δt.",
            "When your button collides with the opponent's button, momentum is transferred between them, demonstrating the transfer and conservation of momentum in isolated systems."
        ];

        if (languageOption === 1) {
            return phrasesEn[Math.floor(Math.random() * phrasesEn.length)];
        } else {
            return phrasesPt[Math.floor(Math.random() * phrasesPt.length)];
        }
    }
}