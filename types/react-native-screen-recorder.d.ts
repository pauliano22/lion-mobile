declare module 'react-native-screen-recorder' {
    export interface RecordingOptions {
      mic?: boolean;
      width?: number;
      height?: number;
      bitrate?: number;
      fps?: number;
    }
  
    export interface ScreenRecorder {
      startRecording(options?: RecordingOptions): Promise<boolean>;
      stopRecording(): Promise<string>;
      isRecording(): Promise<boolean>;
    }
  
    const ScreenRecorder: ScreenRecorder;
    export default ScreenRecorder;
  }