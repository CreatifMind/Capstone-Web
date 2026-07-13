import cv2
import numpy as np

def get_all_frames(path):
    cap = cv2.VideoCapture(path)
    frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        # Resize to small gray for fast matching
        small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 64))
        frames.append(small)
    cap.release()
    return frames

def main():
    f1 = get_all_frames("video1.mp4")
    f2 = get_all_frames("video2.mp4")
    
    print(f"Video 1 frames: {len(f1)}")
    print(f"Video 2 frames: {len(f2)}")
    
    # We want to find the pair (i, j) with the minimum MSE.
    min_mse = float('inf')
    best_pair = None
    
    # Grid search
    for i, img1 in enumerate(f1):
        for j, img2 in enumerate(f2):
            mse = np.mean((img1.astype(float) - img2.astype(float)) ** 2)
            if mse < min_mse:
                min_mse = mse
                best_pair = (i, j)
                
    print(f"Absolute best matching pair in entire videos: Video 1 frame {best_pair[0]}, Video 2 frame {best_pair[1]} with MSE: {min_mse}")
    
    # Let's check a neighborhood around the best match
    i_start, j_start = best_pair
    print("MSE values for subsequent frames:")
    for offset in range(-5, 10):
        ni = i_start + offset
        nj = j_start + offset
        if 0 <= ni < len(f1) and 0 <= nj < len(f2):
            mse = np.mean((f1[ni].astype(float) - f2[nj].astype(float)) ** 2)
            print(f"  Offset {offset:2d}: V1 frame {ni:3d} vs V2 frame {nj:3d} -> MSE = {mse:.2f}")

if __name__ == "__main__":
    main()
