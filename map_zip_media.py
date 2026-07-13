import os
import zipfile
import xml.etree.ElementTree as ET

def map_slide_media(pptx_path):
    temp_dir = "pptx_temp_xml"
    with zipfile.ZipFile(pptx_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)
        
    slides_dir = os.path.join(temp_dir, "ppt", "slides")
    if not os.path.exists(slides_dir):
        print("Error: No ppt/slides directory found.")
        return
        
    # We will look at each slide file
    slide_files = [f for f in os.listdir(slides_dir) if f.startswith("slide") and f.endswith(".xml")]
    # Sort them numerically
    slide_files.sort(key=lambda x: int(x.replace("slide", "").replace(".xml", "")))
    
    print("XML Media Mapping to Slides:")
    print("=" * 60)
    for slide_file in slide_files:
        slide_num = slide_file.replace("slide", "").replace(".xml", "")
        print(f"Slide {slide_num}:")
        
        # Read the relationships file
        rels_path = os.path.join(slides_dir, "_rels", f"{slide_file}.rels")
        rels_map = {}
        if os.path.exists(rels_path):
            tree = ET.parse(rels_path)
            root = tree.getroot()
            # XML namespace for relationships
            ns = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
            for child in root.findall("rel:Relationship", ns):
                rId = child.attrib.get("Id")
                target = child.attrib.get("Target")
                if target:
                    # Clean up Target path e.g. ../media/image1.png -> image1.png
                    basename = os.path.basename(target)
                    rels_map[rId] = basename
                    
        # Parse slide XML to find relationship references
        slide_xml_path = os.path.join(slides_dir, slide_file)
        tree = ET.parse(slide_xml_path)
        root = tree.getroot()
        
        # Find all relationship IDs in the XML
        rIds_found = []
        # We search for attributes that start with r:embed or r:link or contain rId
        for elem in root.iter():
            for key, val in elem.attrib.items():
                if "embed" in key or "link" in key or "id" in key.lower():
                    if val.startswith("rId") and val in rels_map:
                        rIds_found.append(val)
                        
        # Get unique referenced images
        ref_images = sorted(list(set(rels_map[rid] for rid in rIds_found if rels_map[rid].split('.')[-1].lower() in ['png', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'mov'])))
        
        if ref_images:
            for img in ref_images:
                print(f"  Referenced Media: {img}")
        else:
            # Check slide layout or slide master for background images
            print("  No direct image references in slide XML (might inherit from layout/master).")
            
        print("-" * 50)
        
    # Clean up
    import shutil
    shutil.rmtree(temp_dir)

if __name__ == "__main__":
    map_slide_media("Capstone Project.pptx")
