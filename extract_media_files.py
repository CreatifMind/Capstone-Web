import os
import zipfile
import shutil

def extract_pptx_media(pptx_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    temp_dir = "pptx_temp_zip"
    
    # Unzip pptx file
    with zipfile.ZipFile(pptx_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)
        
    media_dir = os.path.join(temp_dir, "ppt", "media")
    if not os.path.exists(media_dir):
        print("No ppt/media directory found in the presentation file.")
        shutil.rmtree(temp_dir)
        return
        
    copied = 0
    for filename in os.listdir(media_dir):
        src_path = os.path.join(media_dir, filename)
        dest_path = os.path.join(output_dir, filename)
        shutil.copy2(src_path, dest_path)
        copied += 1
        
    print(f"Successfully extracted {copied} media files to {output_dir}")
    
    # Clean up temp zip folder
    shutil.rmtree(temp_dir)

if __name__ == "__main__":
    extract_pptx_media("Capstone Project.pptx", "public/assets/slides")
