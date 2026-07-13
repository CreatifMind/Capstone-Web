import cv2
import os

def save_frame(video_path, frame_idx, output_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        return False
    
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if frame_idx < 0:
        frame_idx = total + frame_idx
        
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    if ret:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        cv2.imwrite(output_path, frame)
        print(f"Saved frame {frame_idx} of {video_path} to {output_path}")
        cap.release()
        return True
    else:
        print(f"Error: Could not read frame {frame_idx} of {video_path}")
        cap.release()
        return False

def main():
    artifact_dir = "/Users/thoochinfeng/.gemini/antigravity-ide/brain/b9904f6b-80ff-435b-a4d8-4f997289dc97"
    save_frame("video1.mp4", -1, os.path.join(artifact_dir, "last_frame_v1.png"))
    save_frame("video2.mp4", 0, os.path.join(artifact_dir, "first_frame_v2.png"))

if __name__ == "__main__":
    main()
