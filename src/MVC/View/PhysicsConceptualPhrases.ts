export class PhysicsConceptualPhrases {
    public static getRandomMomentumPhrase(languageOption: number): string {
        const phrasesPt = [
            "🎯 Momento linear: p = m·v.",
            "⚡ Impulso: J = F·Δt = Δp.",
            "⚖️ Em colisões, o momento total do sistema se conserva.",
            "🏋️ Para o mesmo impulso, quanto maior a massa, menor a velocidade adquirida (v = p/m).",
            "💥 A força média da colisão depende do tempo de contato: F = Δp/Δt.",
            "🔁 Terceira Lei de Newton: as forças de ação e reação têm mesma intensidade e sentidos opostos.",
            "🎱 Em colisões elásticas, a energia cinética também se conserva.",
            "🧱 Em colisões perfeitamente inelásticas, os corpos seguem juntos após o impacto.",
            "📐 O momento linear é uma grandeza vetorial: direção e sentido importam.",
            "🛑 O atrito atua como força externa, reduzindo gradualmente o momento das peças.",
            "🚀 Quanto maior a massa em movimento, mais difícil é parar o corpo.",
            "⚽ O coeficiente de restituição mede o quanto da velocidade é restituída no choque.",
        ];

        const phrasesEn = [
            "🎯 Linear momentum: p = m·v.",
            "⚡ Impulse: J = F·Δt = Δp.",
            "⚖️ In collisions, the system's total momentum is conserved.",
            "🏋️ For the same impulse, the larger the mass, the lower the resulting velocity (v = p/m).",
            "💥 The average collision force depends on contact time: F = Δp/Δt.",
            "🔁 Newton's Third Law: action and reaction forces are equal and opposite.",
            "🎱 In elastic collisions, kinetic energy is also conserved.",
            "🧱 In perfectly inelastic collisions, bodies move together after impact.",
            "📐 Linear momentum is a vector quantity: direction matters.",
            "🛑 Friction acts as an external force, gradually reducing the pieces' momentum.",
            "🚀 The larger the moving mass, the harder it is to stop the body.",
            "⚽ The coefficient of restitution measures how much velocity is restored in a collision.",
        ];

        if (languageOption === 1) {
            return phrasesEn[Math.floor(Math.random() * phrasesEn.length)];
        } else {
            return phrasesPt[Math.floor(Math.random() * phrasesPt.length)];
        }
    }
}
