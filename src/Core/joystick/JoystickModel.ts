// src/managers/JoystickManager.ts

import { VirtualJoystick } from "@babylonjs/core/Misc/virtualJoystick";

export class JoystickModel {
    private _joysticks: VirtualJoystick[] = [];

    public get joysticksArray(): VirtualJoystick[] {
        return this._joysticks;
    }

    constructor(canvas: HTMLCanvasElement) {
        this.initializeJoysticks(canvas);
    }

    private initializeJoysticks(canvas: HTMLCanvasElement): void {
        let joystickRatio = 1.5 * canvas.width / 333;

        // Create joystick and set z index to be below playgrounds top bar
        this._joysticks[0] = new VirtualJoystick(true);
        this._joysticks[1] = new VirtualJoystick(false);
        this._joysticks[0].containerSize *= joystickRatio;
        this._joysticks[0].puckSize *= joystickRatio;
        this._joysticks[1].containerSize *= joystickRatio;
        this._joysticks[1].puckSize *= joystickRatio;
        let screenW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        let screenH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
        this._joysticks[0].setPosition(screenW/2+50,3*screenH/4);
        this._joysticks[0].alwaysVisible = true;
        this._joysticks[1].setPosition(screenW/2+50,3*screenH/4);
        this._joysticks[1].alwaysVisible = true;
        this._joysticks[0].setJoystickColor('rgba(255,255,0,.5)');
        this._joysticks[1].setJoystickColor('rgba(255,255,0,.5)');
                if (VirtualJoystick.Canvas) {
            VirtualJoystick.Canvas.style.zIndex = "4";
        } else {
            console.warn("VirtualJoystick.Canvas não foi encontrado para ajuste de zIndex.");
        }
    }
}
