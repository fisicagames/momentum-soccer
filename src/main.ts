import { startGame } from "./game";

//TODO: [ ] Implement a proper fix for the "media was removed" AbortError related to audio playback before user interaction.
window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (
        reason?.name === "AbortError" &&
        reason?.message?.includes("media was removed")
    ) {
        event.preventDefault();
    }
});

startGame();
