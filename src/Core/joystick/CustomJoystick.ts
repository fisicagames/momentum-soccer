import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Ellipse } from "@babylonjs/gui/2D/controls/ellipse";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Nullable } from "@babylonjs/core/types";
import { Observer } from "@babylonjs/core/Misc/observable";
import { PointerInfo } from "@babylonjs/core/Events/pointerEvents";

import { ICustomJoystick } from "./ICustomJoystick";

export class CustomJoystick implements ICustomJoystick {
    private adt: AdvancedDynamicTexture;
    private leftThumbContainer: Ellipse;
    private leftInnerThumbContainer: Ellipse;
    private leftPuck: Ellipse;
    private scene: Scene; // Adicione uma referência à cena
    private sideJoystickOffset: number = 100;
    private bottomJoystickOffset: number = -50;
    private standardWidthSizeScreen: number = 333;
    private localWidthSizeScreen: number;
    public xAddPos: number = 0;
    public yAddPos: number = 0;
    public isDown: boolean = false;
    private _scale: number = 1;
    private pointerMoveObserver: Nullable<Observer<PointerInfo>> = null;
    private pointerUpObserver: Nullable<Observer<PointerInfo>> = null;
    //private isPointerInternal: boolean;

    public setVisible(visible: boolean): void {
        this.leftThumbContainer.isVisible = visible;
        this.leftPuck.isVisible = visible && this.isDown;
    }
    
    constructor(scene: Scene) {
        this.scene = scene; // Inicialize a cena
        this.adt = AdvancedDynamicTexture.CreateFullscreenUI("UI");
        const canvas = this.adt.getContext().canvas;
        this.localWidthSizeScreen = this.adt.getContext().canvas.width;
        
        this.leftThumbContainer = this.makeThumbArea("leftThumb", 2, "yellow", null);
        this.leftThumbContainer.isPointerBlocker = true;
        this.leftThumbContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.leftThumbContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.leftThumbContainer.alpha = 0.4;

        this.leftInnerThumbContainer = this.makeThumbArea("leftInnerThumb", 4, "yellow", null);
        this.leftInnerThumbContainer.isPointerBlocker = false;
        this.leftInnerThumbContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.leftInnerThumbContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

        this.leftPuck = this.makeThumbArea("leftPuck", 0, "yellow", "yellow");
        this.leftPuck.isPointerBlocker = false;
        this.leftPuck.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.leftPuck.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

        this.leftThumbContainer.onPointerDownObservable.add(this.onPointerDown.bind(this));
        this.leftThumbContainer.onPointerUpObservable.add(this.onPointerUp.bind(this));
        this.leftThumbContainer.onPointerMoveObservable.add((coordinates) => {
            this.onPointerMove(coordinates, true); // `true` para eventos internos
        });

        this.adt.addControl(this.leftThumbContainer);
        this.leftThumbContainer.addControl(this.leftInnerThumbContainer);
        this.leftThumbContainer.addControl(this.leftPuck);
        this.leftPuck.isVisible = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    private resize(): void {
        this._scale = this.localWidthSizeScreen / this.standardWidthSizeScreen;
        this.leftThumbContainer.width = 200 * this._scale + "px";
        this.leftThumbContainer.height = 200 * this._scale + "px";
        this.leftThumbContainer.left = this.sideJoystickOffset * this._scale + "px";
        this.leftThumbContainer.top = this.bottomJoystickOffset * this._scale + "px";

        this.leftInnerThumbContainer.width = 80 * this._scale + "px";
        this.leftInnerThumbContainer.height = 80 * this._scale + "px";

        this.leftPuck.width = 60 * this._scale + "px";
        this.leftPuck.height = 60 * this._scale + "px";
    }

    private makeThumbArea(name: string, thickness: number, color: string, background: string | null): Ellipse {
        const rect = new Ellipse();
        rect.name = name;
        rect.thickness = thickness;
        rect.color = color;
        rect.background = background ?? "";
        rect.paddingLeft = "0px";
        rect.paddingRight = "0px";
        rect.paddingTop = "0px";
        rect.paddingBottom = "0px";
        return rect;
    }

    private onPointerDown(coordinates: Vector2): void {
        this.leftPuck.isVisible = true;
        const leftOffset = parseFloat(this.leftThumbContainer.left as string); // Ensure leftOffset is a number
        const topOffset = parseFloat(this.leftThumbContainer.top as string); // Ensure topOffset is a number
        this.leftPuck.left = (coordinates.x - (this.leftThumbContainer._currentMeasure.width * 0.5) - leftOffset) + "px";
        this.leftPuck.top = ((this.adt.getContext().canvas.height - coordinates.y - (this.leftThumbContainer._currentMeasure.height * 0.5) + topOffset) * -1) + "px";
        this.isDown = true;

        // Adicionar eventos globais no scene
        this.pointerMoveObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                this.onPointerMove(new Vector2(pointerInfo.event.x, pointerInfo.event.y), false); // `false` para eventos externos
            }
        });

        this.pointerUpObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERUP) {
                this.onPointerUp();
            }
        });
    }

    private onPointerUp(): void {
        this.xAddPos = 0;
        this.yAddPos = 0;
        this.leftPuck.isVisible = false;
        this.leftThumbContainer.alpha = 0.4;
        this.isDown = false;

        // Remover os observadores globais
        if (this.pointerMoveObserver) {
            this.scene.onPointerObservable.remove(this.pointerMoveObserver);
            this.pointerMoveObserver = null;
        }

        if (this.pointerUpObserver) {
            this.scene.onPointerObservable.remove(this.pointerUpObserver);
            this.pointerUpObserver = null;
        }
    }
    private externalDynamicOffset: { x: number; y: number } | null = null;
    private lastInternalCoordinate: { x: number; y: number } | null = null;

    private onPointerMove(coordinates: Vector2, isInternal: boolean): void {
        if (this.isDown) {
            if(isInternal) {
                this.lastInternalCoordinate = {
                    x: coordinates.x,
                    y: coordinates.y
                };
                this.externalDynamicOffset = null;
            }
            else{
                if(!this.externalDynamicOffset && this.lastInternalCoordinate){
                    this.externalDynamicOffset = { 
                        x: coordinates.x - this.lastInternalCoordinate.x, 
                        y: coordinates.y - this.lastInternalCoordinate.y
                    };
                }
            }
            const leftOffset = parseFloat(this.leftThumbContainer.left as string);
            const topOffset = parseFloat(this.leftThumbContainer.top as string);
    
            let xRaw = coordinates.x - (this.leftThumbContainer._currentMeasure.width * 0.5) - leftOffset;
            let yRaw = this.adt.getContext().canvas.height - coordinates.y - (this.leftThumbContainer._currentMeasure.height * 0.5) + topOffset;
            if(this.externalDynamicOffset){
                xRaw -= this.externalDynamicOffset.x;
                yRaw += this.externalDynamicOffset.y;
            }
    
            const distance = Math.sqrt(xRaw * xRaw + yRaw * yRaw);
            const maxRadius = parseFloat(this.leftThumbContainer.width as string) / 2;
    
            if (distance > maxRadius) {
                // Ajusta a posição para o limite do círculo
                const scale = maxRadius / distance; // Fator de escala para manter dentro do limite
                xRaw *= scale;
                yRaw *= scale;
            }   
    
    
            // Converte as coordenadas para o espaço de controle do joystick
            this.xAddPos = xRaw / (this._scale * 100);
            this.yAddPos = yRaw / (this._scale * 100);
    
            // Atualiza a posição do "puck"
            this.leftPuck.left = xRaw + "px";
            this.leftPuck.top = (-yRaw) + "px";
        }
    }
}