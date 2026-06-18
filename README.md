# Momentum Cup 2026 ⚽

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue.svg)](https://www.typescriptlang.org/)
[![Babylon.js](https://img.shields.io/badge/Babylon.js-9.8.0-purple.svg)](https://www.babylonjs.com/)
[![Vite](https://img.shields.io/badge/Vite-8.0.13-yellow.svg)](https://vitejs.dev/)

A turn-based physics sports game that reimagines tabletop button football as a hands-on lesson in linear momentum and energy conservation, built on a custom MVC framework using Babylon.js and the Havok physics engine. It is the eleventh simulation of the SHIFT series.

Like the others, this game was **not written from scratch**. It follows an **iterative, incremental, reuse-driven** software-engineering process: a shared base of modules — the custom MVC core, the audio model, the language/i18n system, the GUI layer, and the physics scaffolding — is carried over from previous entries and refined at each new project, kept up to date as the underlying libraries evolve. The many small, single-responsibility modules in this repository are the accumulated result of that continuous improvement across the series.

After an initial brief experiment with autonomous in-editor agents, **AI was used primarily as developer-supervised assistance rather than autonomous automation**. The agent approach was dropped because the author perceived a loss of control; to avoid the risk of the result drifting from what was intended, he settled on using AI as an LLM kept *external* to the coding environment, where every suggested change is read, validated against the expected physics, and applied by hand before being committed.

### [🎮 Play Now!](https://fisicagames.com.br)

---

## 📄 Table of Contents

* [About the Game](#-about-the-game)
* [Key Features](#-key-features)
* [How to Play](#-how-to-play)
* [Tech Stack](#-tech-stack)
* [Installation and Setup](#-installation-and-setup)
* [Architecture and Technical Highlights](#-architecture-and-technical-highlights)
* [License](#-license)
* [Author](#-author)

---

## 📖 About the Game

**Momentum Cup 2026** is an interactive simulation that turns tabletop button football (*futebol de botão*) into a turn-based duel against the CPU. The player drags and releases their team's pieces — slingshot-style — to launch them against the ball and score, across two three-minute halves on a vertical, mobile-first pitch.

Every piece is a rigid body with a real mass that depends on its tactical position: heavy defenders, medium midfielders, and light forwards. For the same impulse, light pieces shoot off fast while heavy ones move slowly (`v = p/m`), making linear momentum and impulse tangible at every shot. On top of this, each piece carries an **energy budget** that is spent as kinetic energy on every launch, turning the *Work–Energy Theorem* into a resource the player must manage.

The project serves as an educational tool for Physics courses, making Newtonian dynamics, conservation of linear momentum, and energy conservation playable through a complete, refereed football match — kickoffs, goal kicks, corners, fouls, and cards included.

---

## ✨ Key Features

* **Havok Rigid-Body Physics:** Full 3D rigid-body simulation powered by the Havok physics engine (v2 API). Impulses are applied at the center of mass (`J = Δp`), and the on-screen feedback (shockwaves, floating `Δp` labels, sound) scales with the real impulse reported by the solver on every collision.
* **Linear Momentum & Energy Conservation:** Aiming computes `v = J/m` live; each piece holds a potential-energy budget `E(m) = 211.11 − 11.11·m` (J), and every shot deducts its kinetic energy `K = J²/(2m)`. A telemetry panel shows mass, velocity, momentum, kinetic energy, and average power in real time.
* **48 National Teams:** Selectable home and opponent squads loaded from a `JSON` configuration, each with its own flag and color scheme, plus a star-based difficulty rating shown in the selection modal.
* **Opta-Inspired CPU AI:** A dedicated AI agent assigns each national team one of three tactical profiles — *elite*, *structured*, or *challenger* — that drive passing precision, shooting appetite, and aim intelligence, replacing artificial rubber-banding with believable, team-specific behavior.
* **Full Football Ruleset:** Automatic kickoffs, goal kicks, corner kicks (with regulation barrier spacing), a 12-touch possession rule, and a card system where three yellow cards send a piece off the pitch.
* **3-4-3 Tactical Formation:** Eleven positions per team with mass by role — goalkeeper (10 kg), three defenders (8 kg), four midfielders (3 kg), and three forwards (1 kg) — reinforcing `v = p/m` through gameplay.
* **Slingshot Aiming:** A non-linear drag curve and an adaptive minimum arrow length keep precision taps ergonomic on mobile while still allowing powerful shots, with a dynamic cap tied to each piece's remaining energy.
* **Match Presentation:** A regulation match clock over two halves, animated scoreboard with flags and possession highlight, whistle cues for every event, stadium-crowd ambience, and a synth-pop menu soundtrack.
* **Persistence:** Campaign record (wins / draws / losses) and the player's best match score are automatically saved via `localStorage` and restored across sessions.
* **Responsive and Multilingual:** Fully optimized for desktop and mobile browsers, with automatic language detection and native support for Portuguese and English.

---

## 🕹 How to Play

**Objective:** Score more goals than the CPU across two three-minute halves.

#### Controls

💻 **On PC / Mouse:**

* **Tap a piece of your team, drag backward, and release** to launch it (slingshot). The longer the drag, the greater the impulse.
* **Drag on empty space** to orbit the camera around the pitch.
* **[ ↺ ]** button (top-right): restart the match.

📱 **On Mobile / Touch:**

* **Touch and drag** any of your pieces backward, then lift your finger to shoot.
* **Touch and drag** the empty field to rotate the camera view.

#### Tips

* Heavier pieces (defenders) need a much larger impulse to reach the same speed as a light forward — plan your drag accordingly (`v = p/m`).
* Watch each piece's **energy budget**: a strong shot drains it fast, and an exhausted piece cannot be selected until possession refills it.
* You get up to **12 collective touches** per possession — set up clean passes instead of forcing low-percentage shots.
* Avoid hitting opponents *before* touching the ball: it is a foul, and three yellow cards on the same piece earn a red card and a sending-off.

---

## 🛠 Tech Stack

| Tool                                             | Version | Description                                                                    |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------------------ |
| [TypeScript](https://www.typescriptlang.org/)    | 6.0.3   | Core language, providing type safety and robust architecture.                  |
| [Babylon.js](https://www.babylonjs.com/)         | 9.8.0   | Graphics engine for 3D rendering, particles, GUI, and AudioV2.                 |
| [@babylonjs/havok](https://www.babylonjs.com/)   | 1.3.12  | Havok rigid-body physics engine (WebAssembly), v2 API.                         |
| [Vite.js](https://vitejs.dev/)                   | 8.0.13  | Build tool with Rolldown, ES module tree-shaking, and single-bundle output.    |
| [Node.js](https://nodejs.org/en)                 | 26.2.0  | Development environment and runtime.                                           |
| [pnpm](https://pnpm.io/)                         | 10.33.0 | Fast, disk-efficient package manager.                                          |

Developed in a **Linux Arch (Kernel 7.0.12-arch1-1)** environment with **KDE Plasma**.

---

## 🚀 Installation and Setup

**Prerequisites:** Node.js (v20+), pnpm (v10+).

**Steps:**

1. Clone the repository.
2. Install dependencies:
   ```sh
   pnpm install
   ```
3. Start the development server:
   ```sh
   pnpm dev
   ```
4. Build for production (generates the `dist` folder):
   ```sh
   pnpm build
   ```

> **Note on the Havok WASM:** The file `HavokPhysics.wasm` must be present at `public/assets/wasm/HavokPhysics.wasm`. It is copied from `node_modules/@babylonjs/havok` and served as a static asset so the production bundle can locate it via a document-relative URL, bypassing Rolldown's asset hashing.

---

## 🏗 Architecture and Technical Highlights

The technological cornerstone of this project is its **custom MVC Framework written in TypeScript**, refined by the author across the SHIFT series and consolidating the **callback-based Mediator pattern** introduced in earlier simulations. This architecture allows the simulation to run natively in mobile browsers without requiring full-screen APIs or third-party app installations.

The shell is organized using the **Model-View-Controller (MVC)** pattern via callbacks, while the match itself lives in a dedicated, self-contained **Game layer**:

* **Model:** A render-agnostic layer that manages best-score persistence via `localStorage` and the music lifecycle, including independent menu (synth-pop) and gameplay (stadium-crowd) tracks with their own play / pause / game-pause / game-resume hooks.
* **View:** Constructs the JSON-driven menu GUI, the bilingual translation chain (`LanguageSwitcher`), and the team-selection modal — including the hold-to-scroll team picker and the difficulty-star ratings.
* **Controller:** Loads the national-team registry asynchronously, wires all menu interactions, and orchestrates the scene lifecycle (launch, dispose, menu transitions), passing the chosen squads into the match.

#### Game Layer (`src/Game/`)

The match is decomposed into focused, single-responsibility modules:

* **`MomentumSoccerGame`** — the orchestrator: state machine (aim, CPU turn, rolling, goal pause, half-time, game over), match clock, possession and touch rules, the card system, energy bookkeeping, and the set-piece sequences (kickoff, goal kick, corner). All asynchronous timeouts are guarded by an `isDisposed` sentinel so a late callback can never touch a destroyed physics body.
* **`PieceFactory`** — builds the bicolor acrylic-button pieces and the ball, and hosts the `TeamRegistry` that loads the 48 national teams (with an embedded fallback for offline play).
* **`CPUAgent`** — a stateless tactical engine that scores candidate shots by proximity and alignment, models passing lanes and the goal posts as blockers, and applies the team's Opta-inspired profile.
* **`GameHUD`** — the entire in-game GUI on a separate fullscreen layer: scoreboard, telemetry panel, set-piece banners, alerts, hints, and floating impact labels.
* **`SlingshotController`** — the drag-to-aim input, with a non-linear power curve, an energy-aware impulse cap, and a triple failsafe that cancels aiming on pointer-leave, blur, or out-of-bounds movement.
* **`Arena`** — the static pitch, goals with real collidable posts and crossbar, a translucent 3D net, and the Havok goal triggers positioned strictly below the crossbar.

#### Physics Architecture

The `MomentumSoccerGame` class is fully self-contained:

* Initializes its own **Havok plugin** with a document-relative WASM URL, avoiding Rolldown's `import.meta.url` path-resolution issues in production.
* Registers `RegisterJoinedPhysicsEngineComponent()` explicitly at runtime to counter Rolldown's aggressive tree-shaking of Babylon.js side-effect modules, and imports the `Ray` culling side-effect required by scene picking in the production bundle.
* Applies launches as impulses at the center of mass (`J = Δp`) and locks each piece's inertia to its vertical axis, so buttons spin but never topple.
* Classifies every shot by reading the real collision impulses reported by Havok, driving both the rule engine (clean pass, contact-after-ball, foul) and the proportional visual/audio feedback.

#### AI Architecture

The CPU replaces artificial difficulty scaling with **per-team tactical profiles** inspired by Opta-style performance data. Each squad is mapped to one of three tiers — elite, structured, or challenger — that tune passing precision (shot dispersion), shooting appetite at range, and whether the AI aims to beat the goalkeeper or plays it safe. The agent decides between a direct shot and a dosed pass by testing whether the lane to goal is clear, then picks the piece and impulse that best serve that intent.

#### Audio Architecture

Audio uses **Babylon.js AudioV2** (`CreateSoundAsync`), which requires an explicit user gesture to unlock the context. The model keeps two independent looping tracks — a synth-pop menu theme and a stadium-crowd ambience — and swaps them on match start and return-to-menu, while a single referee-whistle asset is sliced by start-offset and duration to produce distinct cues for kickoff, half-time, full-time, goal, card, and restart.

#### AI-Assisted Code Generation

This simulation continues the **developer-supervised** AI-assisted workflow established in the SHIFT series. The Havok physics integration, the momentum and energy-conservation game loop, the CPU tactical engine, the GUI architecture, and the audio state machine were developed through iterative prompts to **Claude Sonnet 4.6 (Anthropic)** and **Gemini 3.5 Flash (Google)**.

Crucially, the AI is used as an assistant rather than an autonomous agent. After a brief initial experiment with a fully automated coding agent, the author settled on manual, incremental interaction with the LLM: each suggested change is reviewed line by line and validated against the expected physics before being integrated — which is also what keeps the reused module base coherent as it is refined from one project to the next.

---

## 📸 Screenshots

<!-- Add screenshots here when available, e.g.:
<p align="center">
  <img src="image/README/screenshot1.png" width="30%" alt="Momentum Cup 2026 screenshot 1" />
  <img src="image/README/screenshot2.png" width="30%" alt="Momentum Cup 2026 screenshot 2" />
</p>
-->

---

## 📜 License

### Source Code

The source code in this repository is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file.

### Visual Assets

3D models, textures, and original visual content created by the author are licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

### Audio Assets

Music and sound effects in this project are sourced from [Pixabay](https://pixabay.com/) under the [Pixabay Content License](https://pixabay.com/service/license-summary/), which permits free use including for commercial purposes.

### Third-Party Libraries

* **Babylon.js** — Apache License 2.0
* **Havok Physics** — See [@babylonjs/havok](https://www.npmjs.com/package/@babylonjs/havok) license terms
* **Vite.js** — MIT License

**Copyright © 2026 Rafael João Ribeiro.**

---

## 👨‍🔬 Author

Developed by:
**Prof. Dr. Rafael João Ribeiro**
Federal Institute of Paraná (IFPR)
[www.fisicagames.com.br](https://www.fisicagames.com.br)

---

## 📊 Commit Types — Verb Cheat Sheet

This table summarizes the commit types used in the project, along with common verbs to start commit messages following best practices (imperative mood, present tense).

| Type         | Purpose                                                              | Common verbs (imperative)                   |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------- |
| **feat**     | Introduce a new feature or functionality                             | add, implement, introduce, create           |
| **fix**      | Fix a bug or incorrect behavior                                      | fix, correct, resolve, prevent              |
| **perf**     | Improve performance (CPU, GPU, memory, bundle size)                  | optimize, improve, reduce, enhance          |
| **refactor** | Restructure code without changing external behavior                  | refactor, reorganize, simplify, restructure |
| **style**    | Adjust visual aspects (UI, colors, layout, fonts)                    | adjust, update, tweak, refine               |
| **docs**     | Documentation updates (README, comments, license)                    | add, update, improve, clarify               |
| **build**    | Build system, bundler (Vite/Rolldown), dependencies, configuration   | configure, update, adjust, setup            |
| **chore**    | Maintenance tasks, cleanup, assets, non-functional changes           | clean, remove, update, organize             |
| **balance**  | Gameplay tuning (physics parameters, difficulty, progression)        | adjust, rebalance, tune, update             |
| **i18n**     | Translations and localization (PT/EN dictionaries, formatting)       | translate, add, update, fix                 |

### ✅ Examples

```text
feat(rules): add corner-kick set piece with regulation barrier spacing
fix(core): guard async match timeouts against post-dispose execution
perf(render): preallocate Vector3 scratch vectors to reduce GC
refactor(ai): extract CPU tactics into a dedicated CPUAgent module
style(hud): add team difficulty rating stars to the selection modal
build(vite): serve HavokPhysics.wasm as a static asset without hash
chore(assets): add referee whistle and stadium-crowd sound effects
balance(ai): replace DDA rubber-banding with Opta-inspired team profiles
i18n(en): refine English foul and card alert messages
```
