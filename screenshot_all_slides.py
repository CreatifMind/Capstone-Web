import os
import subprocess

def main():
    cwd = "/Users/thoochinfeng/Desktop/PurityLoop AI/Capstone-Web v2"
    output_dir = os.path.join(cwd, "refined_presentation_slides")
    os.makedirs(output_dir, exist_ok=True)
    
    chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    html_url = f"file://{os.path.join(cwd, 'public/slides.html')}"
    
    print(f"Starting slide capture. Output directory: {output_dir}")
    for i in range(1, 31):
        slide_url = f"{html_url}#slide-{i}-hideControls"
        output_file = os.path.join(output_dir, f"slide-{i}.png")
        
        print(f"[{i}/30] Capturing Slide {i}...")
        cmd = [
            chrome_path,
            "--headless=new",
            "--disable-gpu",
            "--virtual-time-budget=1200",  # Runs page event loop for 1.2s virtual time before capture
            f"--screenshot={output_file}",
            "--window-size=1920,1080",
            slide_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  Error capturing slide {i}: {result.stderr}")
        else:
            print(f"  Saved: slide-{i}.png ({os.path.getsize(output_file)} bytes)")
            
    print("Slide capture complete! All 30 slides saved.")

if __name__ == "__main__":
    main()
