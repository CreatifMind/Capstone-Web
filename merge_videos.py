import sys
from moviepy import VideoFileClip, concatenate_videoclips

def main():
    v1_path = "video1.mp4"
    v2_path = "video2.mp4"
    output_path = "merged_video.mp4"
    
    print("Loading video files...")
    clip1 = VideoFileClip(v1_path)
    clip2 = VideoFileClip(v2_path)
    
    print(f"Original Clip 1: Size={clip1.size}, Duration={clip1.duration}s, FPS={clip1.fps}")
    print(f"Original Clip 2: Size={clip2.size}, Duration={clip2.duration}s, FPS={clip2.fps}")
    
    # Scale clip1 to match clip2's resolution (1280x720)
    print("Scaling Clip 1 to 1280x720...")
    clip1_resized = clip1.resized((1280, 720))
    
    print("Concatenating video clips...")
    # method="compose" ensures proper resizing/rendering
    final_clip = concatenate_videoclips([clip1_resized, clip2], method="compose")
    
    print(f"Writing output file to {output_path}...")
    final_clip.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        fps=24.0,
        temp_audiofile="temp-audio.m4a",
        remove_temp=True
    )
    
    print("Closing clips...")
    clip1.close()
    clip2.close()
    final_clip.close()
    print("Success! Videos merged successfully.")

if __name__ == "__main__":
    main()
