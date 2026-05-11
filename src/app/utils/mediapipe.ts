import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let detectorInstance: ObjectDetector | null = null;
let isInitializing = false;

/**
 * Initializes the MediaPipe Object Detector with EfficientDet.
 * Uses local WASM files and model to work offline.
 */
export async function getObjectDetector(): Promise<ObjectDetector> {
    if (detectorInstance) return detectorInstance;
    if (isInitializing) {
        // Wait until initialized if another call is already doing it
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (detectorInstance) {
                    clearInterval(check);
                    resolve(detectorInstance);
                }
            }, 100);
        });
    }

    isInitializing = true;
    try {
        console.log("Loading MediaPipe Fileset...");
        // Ensure we load WASM from our public/wasm directory for offline support
        const vision = await FilesetResolver.forVisionTasks(
            "/wasm"
        );
        
        console.log("Creating Object Detector...");
        detectorInstance = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "/models/efficientdet_lite0.tflite",
                delegate: "GPU" // Try GPU first
            },
            scoreThreshold: 0.35, // Adjust based on confidence needs
            runningMode: "IMAGE" // We will process individual frames (or we can use VIDEO for streaming)
        });

        console.log("MediaPipe Object Detector ready!");
        return detectorInstance;
    } catch (err) {
        console.error("Failed to initialize MediaPipe Object Detector:", err);
        throw err;
    } finally {
        isInitializing = false;
    }
}
