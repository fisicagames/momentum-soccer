export class CanvasInitializer {
    private static adjustCanvasSize(canvas: HTMLCanvasElement): void {
        let screenW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        let screenH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
        if (screenH / screenW < 1.8) {
            canvas.style.width = "56svh";
            canvas.style.height = "100svh";
        } else {
            canvas.style.width = "98svw";
            canvas.style.height = "94svh";
        }
    }

    public static createAndAdjustCanvas(): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.id = "gameCanvas";
        document.body.appendChild(canvas);
        CanvasInitializer.adjustCanvasSize(canvas);
        return canvas;
    }
}