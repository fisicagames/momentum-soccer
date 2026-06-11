import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export class CameraInitializer {
    public static createFollowCamera(scene: Scene, targetMesh: AbstractMesh | null = null): FollowCamera {
        const camera = new FollowCamera("FollowCam", new Vector3(0, 15, -15), scene);
        camera.radius = 18;
        camera.heightOffset = 12;
        camera.rotationOffset = 180;
        camera.cameraAcceleration = 0.05;
        camera.maxCameraSpeed = 20;
        camera.lockedTarget = targetMesh;
        return camera;
    }

    public static createUniversalCamera(scene: Scene, canvas?: HTMLCanvasElement): UniversalCamera {
        const camera = new UniversalCamera("UniversalCamera", new Vector3(0, 21, -50), scene);
        camera.setTarget(new Vector3(0, 0, -10));
        camera.position = new Vector3(0, 20, -43);
        camera.fov = 0.6;
        //camera.setTarget(new Vector3(0, 5.31, 7.84));
        //TODO: [x] Add or remove the attachControl bellow to control the camera with mouse:
        if(canvas && false){
            camera.attachControl(canvas, true);
        }
        return camera;
    }
}