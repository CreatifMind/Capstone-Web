/* PurityLoop AI - Smart Waste Sorting & Contamination Detection */

/* RELIABLE prototype limits */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100 MB per ZIP file
const MAX_TOTAL_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB total upload
const MAX_TOTAL_FILES = 50;
const DEFAULT_SCAN_ASSET = "assets/items/upload-result-reference.png";

/* AI CLASSIFICATION METADATA MAP (9 Categories, No ESG/Carbon) */
const detectionResults = {
  battery: {
    title: "Battery Hazard Detected",
    confidence: "99%",
    category: "Battery",
    bin: "Hazardous Battery Bin",
    weight: "0.045 kg",
    statusClass: "danger",
    status: "Hazardous item detected. Fire risk.",
    instruction: "Divert battery immediately to a fire-safe hazardous waste storage bin.",
    color: "#b42318",
    imageSrc: "assets/items/battery.png"
  },
  food_organics: {
    title: "Food Organics Contamination",
    confidence: "87%",
    category: "Food Organics",
    bin: "Organic Waste / Reject",
    weight: "0.120 kg",
    statusClass: "warning",
    status: "Contamination risk. Rinse or reject.",
    instruction: "Separate organic waste from recyclable batches to prevent bale rejection.",
    color: "#27ae60",
    imageSrc: "assets/items/food-waste.png"
  },
  general_trash: {
    title: "General Trash Detected",
    confidence: "78%",
    category: "General Trash",
    bin: "Landfill Bin",
    weight: "0.085 kg",
    statusClass: "warning",
    status: "Non-recyclable material detected.",
    instruction: "Divert to general landfill waste. Check if clean packaging can be salvaged.",
    color: "#7f8c8d",
    imageSrc: "assets/items/coffee-cup.png"
  },
  plastic: {
    title: "Plastic Bottle Detected",
    confidence: "95%",
    category: "Plastic",
    bin: "Plastic Sorting Bin",
    weight: "0.025 kg",
    statusClass: "safe",
    status: "Clean recyclable plastic detected.",
    instruction: "Ensure container is empty. Compress and place in plastic bale sorting queue.",
    color: "#2f6f8f",
    imageSrc: "assets/items/plastic-bottle.png"
  },
  metal: {
    title: "Aluminium Can Detected",
    confidence: "94%",
    category: "Metal",
    bin: "Metal Sorting Bin",
    weight: "0.015 kg",
    statusClass: "safe",
    status: "High-value recyclable metal detected.",
    instruction: "Verify metal container is empty. Place in magnetic sorting line.",
    color: "#b7791f",
    imageSrc: "assets/items/aluminum-can.png"
  },
  paper: {
    title: "Crumpled Paper Detected",
    confidence: "89%",
    category: "Paper",
    bin: "Paper Sorting Bin",
    weight: "0.030 kg",
    statusClass: "safe",
    status: "Recyclable paper material detected.",
    instruction: "Ensure paper is dry and clean of organic grease before packing.",
    color: "#8aa0a8",
    imageSrc: "assets/items/crumpled-paper.png"
  },
  cardboard: {
    title: "Cardboard Packaging Detected",
    confidence: "92%",
    category: "Cardboard",
    bin: "Cardboard Sorting Bin",
    weight: "0.220 kg",
    statusClass: "safe",
    status: "High-grade cardboard material detected.",
    instruction: "Flatten cardboard package to save sorting dock volume. Keep dry.",
    color: "#e67e22",
    imageSrc: "assets/items/cardboard.png"
  },
  glass: {
    title: "Glass Container Detected",
    confidence: "91%",
    category: "Glass",
    bin: "Glass Sorting Bin",
    weight: "0.180 kg",
    statusClass: "safe",
    status: "Recyclable glass material detected.",
    instruction: "Rinse container. Avoid glass breakage. Segregate in sorting bay.",
    color: "#8b5cf6",
    imageSrc: "assets/items/glass-jar.png"
  },
  textile: {
    title: "Textile Scrap Detected",
    confidence: "83%",
    category: "Textile",
    bin: "Fabric Recovery / Landfill",
    weight: "0.140 kg",
    statusClass: "warning",
    status: "Textile contaminant detected.",
    instruction: "Fabric ruins optical gear sorting blades. Segregate manually.",
    color: "#1abc9c",
    imageSrc: "assets/items/textile.png"
  },
  unknown: {
    title: "Unclassified Waste Detected",
    confidence: "60%",
    category: "General Trash",
    bin: "Manual Audit Queue",
    weight: "0.000 kg",
    statusClass: "warning",
    status: "AI confidence rating too low.",
    instruction: "Perform manual audit to inspect the material category.",
    color: "#a16207",
    imageSrc: "assets/items/coffee-cup.png"
  },
  mixed_batch: {
    title: "Mixed Batch Scan Detected",
    confidence: "98%",
    category: "Mixed Recyclables",
    bin: "Multi-stream Recovery",
    weight: "0.485 kg",
    statusClass: "safe",
    status: "Recyclable materials detected.",
    instruction: "Recover PET bottle, aluminum can, cardboard packaging, and glass jar into their matching material streams.",
    color: "#00f08a",
    imageSrc: DEFAULT_SCAN_ASSET
  }
};

/* Maps a filename to multiple bounding boxes (Simulating Mixed Waste Detection) */
function getDetectedObjectsForFile(name) {
  const fileLower = name.toLowerCase();

  // New default viewport image from user screenshot
  if (fileLower.includes("viewport") || fileLower.includes("mixed-waste") || fileLower.includes("active_scan") || fileLower.includes("upload-result-reference")) {
    return [
      { label: "PET Bottle", confidence: "97%", color: "#39d12f", x: 0.025, y: 0.30, w: 0.235, h: 0.31 },
      { label: "Aluminum Can", confidence: "98%", color: "#39d12f", x: 0.285, y: 0.38, w: 0.185, h: 0.25 },
      { label: "Cardboard Box", confidence: "96%", color: "#39d12f", x: 0.505, y: 0.245, w: 0.255, h: 0.39 },
      { label: "Glass Jar", confidence: "95%", color: "#39d12f", x: 0.795, y: 0.365, w: 0.16, h: 0.30 }
    ];
  }

  // 1. Soda Can image gets the exact 6 bounding boxes from the attached camera stream image
  if (fileLower.includes("can") || fileLower.includes("metal") || fileLower.includes("sodacan")) {
    return [
      { label: "PET Bottle", confidence: "97%", color: "#27c93f", x: 0.18, y: 0.25, w: 0.20, h: 0.25 },
      { label: "PET Bottle", confidence: "96%", color: "#27c93f", x: 0.28, y: 0.55, w: 0.16, h: 0.22 },
      { label: "Aluminum Can", confidence: "94%", color: "#0080ff", x: 0.42, y: 0.36, w: 0.18, h: 0.20 },
      { label: "Food Waste Alert", confidence: "85%", color: "#ff8000", x: 0.50, y: 0.59, w: 0.22, h: 0.18 },
      { label: "Plastic Film Alert", confidence: "89%", color: "#ff8000", x: 0.65, y: 0.21, w: 0.20, h: 0.26 },
      { label: "Aluminum Can", confidence: "91%", color: "#0080ff", x: 0.72, y: 0.49, w: 0.14, h: 0.18 }
    ];
  }

  // 2. Plastic bottle mapping
  if (fileLower.includes("plastic") || fileLower.includes("bottle") || fileLower.includes("pet")) {
    return [
      { label: "PET Bottle", confidence: "95%", color: "#27c93f", x: 0.25, y: 0.20, w: 0.30, h: 0.50 },
      { label: "Plastic Film Alert", confidence: "88%", color: "#ff8000", x: 0.60, y: 0.30, w: 0.20, h: 0.35 },
      { label: "General Trash", confidence: "75%", color: "#7f8c8d", x: 0.45, y: 0.60, w: 0.15, h: 0.20 }
    ];
  }

  // 3. Battery mapping
  if (fileLower.includes("battery") || fileLower.includes("lithium")) {
    return [
      { label: "Battery Hazard Alert", confidence: "99%", color: "#b42318", x: 0.35, y: 0.30, w: 0.25, h: 0.35 },
      { label: "Plastic Film Alert", confidence: "84%", color: "#ff8000", x: 0.15, y: 0.50, w: 0.20, h: 0.30 },
      { label: "Paper Crumpled", confidence: "79%", color: "#8aa0a8", x: 0.65, y: 0.25, w: 0.20, h: 0.25 }
    ];
  }

  // 4. Cardboard mapping
  if (fileLower.includes("cardboard") || fileLower.includes("box") || fileLower.includes("package")) {
    return [
      { label: "Cardboard", confidence: "92%", color: "#e67e22", x: 0.15, y: 0.15, w: 0.50, h: 0.60 },
      { label: "PET Bottle", confidence: "90%", color: "#27c93f", x: 0.70, y: 0.40, w: 0.18, h: 0.35 }
    ];
  }

  // 5. Food organics mapping
  if (fileLower.includes("food") || fileLower.includes("organic") || fileLower.includes("peel")) {
    return [
      { label: "Food Waste Alert", confidence: "87%", color: "#ff8000", x: 0.25, y: 0.25, w: 0.40, h: 0.45 },
      { label: "Paper Crumpled", confidence: "81%", color: "#8aa0a8", x: 0.70, y: 0.50, w: 0.15, h: 0.25 },
      { label: "Textile Scrap Alert", confidence: "76%", color: "#1abc9c", x: 0.10, y: 0.60, w: 0.18, h: 0.22 }
    ];
  }

  // 6. Paper mapping
  if (fileLower.includes("paper") || fileLower.includes("newspaper") || fileLower.includes("sheet")) {
    return [
      { label: "Paper Crumpled", confidence: "89%", color: "#8aa0a8", x: 0.20, y: 0.20, w: 0.45, h: 0.45 },
      { label: "Plastic Film Alert", confidence: "82%", color: "#ff8000", x: 0.60, y: 0.40, w: 0.25, h: 0.35 }
    ];
  }

  // 7. Glass mapping
  if (fileLower.includes("glass") || fileLower.includes("jar")) {
    return [
      { label: "Glass Container", confidence: "91%", color: "#8b5cf6", x: 0.30, y: 0.20, w: 0.35, h: 0.55 },
      { label: "General Trash", confidence: "78%", color: "#7f8c8d", x: 0.10, y: 0.45, w: 0.18, h: 0.25 }
    ];
  }

  // 8. Textile mapping
  if (fileLower.includes("textile") || fileLower.includes("cloth") || fileLower.includes("fabric")) {
    return [
      { label: "Textile Scrap Alert", confidence: "83%", color: "#1abc9c", x: 0.25, y: 0.25, w: 0.45, h: 0.45 },
      { label: "General Trash", confidence: "70%", color: "#7f8c8d", x: 0.60, y: 0.50, w: 0.20, h: 0.30 }
    ];
  }

  // 9. General Trash mapping
  if (fileLower.includes("cup") || fileLower.includes("mug") || fileLower.includes("trash")) {
    return [
      { label: "General Trash", confidence: "78%", color: "#7f8c8d", x: 0.25, y: 0.25, w: 0.40, h: 0.50 },
      { label: "Plastic Film Alert", confidence: "80%", color: "#ff8000", x: 0.55, y: 0.35, w: 0.25, h: 0.35 }
    ];
  }

  // Dynamic fallback for custom uploaded files
  const matched = detectWasteTypeFromFileName(name);
  const primaryColor = matched.color;
  const primaryCat = matched.category;
  const primaryConf = matched.confidence;

  return [
    { label: primaryCat, confidence: primaryConf, color: primaryColor, x: 0.18, y: 0.20, w: 0.34, h: 0.46 },
    { label: "Manual Review Region", confidence: "82%", color: "#ff8000", x: 0.55, y: 0.34, w: 0.26, h: 0.34 }
  ];
}

/* Format file size helper */
function formatFileSize(bytes) {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return mb.toFixed(2) + " MB";
  return kb.toFixed(1) + " KB";
}

/* Match category from name */
function detectWasteTypeFromFileName(name) {
  const fileLower = name.toLowerCase();
  if (fileLower.includes("viewport") || fileLower.includes("mixed") || fileLower.includes("upload-result-reference")) return detectionResults.mixed_batch;
  if (fileLower.includes("battery") || fileLower.includes("lithium")) return detectionResults.battery;
  if (fileLower.includes("food") || fileLower.includes("organic") || fileLower.includes("apple") || fileLower.includes("banana")) return detectionResults.food_organics;
  if (fileLower.includes("trash") || fileLower.includes("waste") || fileLower.includes("cup") || fileLower.includes("mug")) return detectionResults.general_trash;
  if (fileLower.includes("plastic") || fileLower.includes("bottle") || fileLower.includes("pet")) return detectionResults.plastic;
  if (fileLower.includes("metal") || fileLower.includes("can") || fileLower.includes("aluminium") || fileLower.includes("steel")) return detectionResults.metal;
  if (fileLower.includes("paper") || fileLower.includes("newspaper") || fileLower.includes("sheet")) return detectionResults.paper;
  if (fileLower.includes("cardboard") || fileLower.includes("box") || fileLower.includes("package")) return detectionResults.cardboard;
  if (fileLower.includes("glass") || fileLower.includes("jar") || fileLower.includes("bottle_g")) return detectionResults.glass;
  if (fileLower.includes("textile") || fileLower.includes("cloth") || fileLower.includes("shirt") || fileLower.includes("fabric")) return detectionResults.textile;

  // Random fallback for simulated variety
  const keys = Object.keys(detectionResults);
  const randomKey = keys[Math.floor(Math.random() * (keys.length - 1))];
  return detectionResults[randomKey];
}

/* Local storage initialization for ledger records */
function getAuditLedger() {
  const localLedger = localStorage.getItem("purityloop_audit_ledger");
  if (localLedger) {
    return JSON.parse(localLedger);
  }
  // Default mock ledger, based on uploaded images rather than physical stations
  const mockLedger = [
    { id: "LOG-9821", time: "10:42 AM", source: "batch_metal_can_042.jpg", sourceKey: "SINGLE-IMAGE", category: "Metal", weight: "18.4 kg", confidence: "98.7%", status: "Cleared" },
    { id: "LOG-9820", time: "10:30 AM", source: "glass_mixed_batch.zip", sourceKey: "ZIP-BATCH", category: "Glass", weight: "14.5 kg", confidence: "82.0%", status: "Review Needed" },
    { id: "LOG-9819", time: "10:25 AM", source: "trash_contamination_set.zip", sourceKey: "ZIP-BATCH", category: "General Trash", weight: "12.0 kg", confidence: "42.1%", status: "Quarantined" },
    { id: "LOG-9818", time: "10:14 AM", source: "metal_recovery_sample.png", sourceKey: "SINGLE-IMAGE", category: "Metal", weight: "19.2 kg", confidence: "99.2%", status: "Cleared" },
    { id: "LOG-9817", time: "10:05 AM", source: "plastic_bottle_upload.jpg", sourceKey: "SINGLE-IMAGE", category: "Plastic", weight: "15.1 kg", confidence: "98.1%", status: "Cleared" },
    { id: "LOG-9816", time: "09:58 AM", source: "battery_hazard_upload.jpg", sourceKey: "QUARANTINE-UPLOAD", category: "Battery", weight: "8.0 kg", confidence: "54.1%", status: "Quarantined" },
    { id: "LOG-9815", time: "09:42 AM", source: "glass_jar_upload.webp", sourceKey: "SINGLE-IMAGE", category: "Glass", weight: "11.3 kg", confidence: "96.7%", status: "Cleared" }
  ];
  localStorage.setItem("purityloop_audit_ledger", JSON.stringify(mockLedger));
  return mockLedger;
}

function saveAuditLedger(ledger) {
  localStorage.setItem("purityloop_audit_ledger", JSON.stringify(ledger));
}

function getLogSourceLabel(log) {
  if (log.source) return log.source;
  if (!log.station) return "Uploaded image";
  if (log.station === "UPLOAD-HUB") return "Upload queue";
  if (log.station === "MOBILE-APP") return "Camera upload";
  if (String(log.station).startsWith("STATION-")) return "Legacy uploaded image";
  return log.station;
}

function getLogSourceKey(log) {
  if (log.sourceKey) return log.sourceKey;
  if (log.source && log.source.toLowerCase().endsWith(".zip")) return "ZIP-BATCH";
  if (log.status === "Quarantined" || log.status === "Quarantine") return "QUARANTINE-UPLOAD";
  return "SINGLE-IMAGE";
}

function getUploadSourceDisplayName(sourceKey) {
  const labels = {
    "UPLOAD-HUB": "Upload queue",
    "SINGLE-IMAGE": "Single image upload",
    "ZIP-BATCH": "ZIP batch upload",
    "QUARANTINE-UPLOAD": "Flagged upload"
  };
  return labels[sourceKey] || "Uploaded image";
}

/*****************************************
 * 1. IMAGE UPLOAD & WEBCAM CAPTURE PAGE *
 *****************************************/
function initUploadPage() {
  const fileUpload = document.getElementById("fileUpload");
  if (!fileUpload) return; // Not on upload page

  const fileName = document.getElementById("fileName");
  const scanImageBtn = document.getElementById("scanImageBtn");
  const fileList = document.getElementById("fileList");
  const fileCountText = document.getElementById("fileCountText");
  const uploadSummary = document.getElementById("uploadSummary");

  // Set up webcam modal
  createWebcamModalElements();

  const startWebcamBtn = document.getElementById("startWebcamBtn");
  const captureWebcamBtn = document.getElementById("captureWebcamBtn");
  const closeWebcamBtn = document.getElementById("closeWebcamModal");
  const webcamModal = document.getElementById("webcamModal");
  const webcamVideo = document.getElementById("webcamVideo");
  let webcamStream = null;

  // Drag and drop events
  const uploadBox = document.querySelector(".upload-box");
  if (uploadBox) {
    ["dragenter", "dragover"].forEach(evt => {
      uploadBox.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadBox.classList.add("dragover");
      }, false);
    });

    ["dragleave", "drop"].forEach(evt => {
      uploadBox.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadBox.classList.remove("dragover");
      }, false);
    });

    uploadBox.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        processSelectedFiles(files);
      }
    });
  }

  fileUpload.addEventListener("change", function () {
    if (fileUpload.files.length > 0) {
      processSelectedFiles(fileUpload.files);
    }
  });

  if (scanImageBtn) {
    scanImageBtn.addEventListener("click", () => {
      const storedUploads = localStorage.getItem("purityloop_uploads");
      if (!storedUploads) {
        showToast("Choose an image before scanning.", "warning");
        return;
      }
      scanImageBtn.disabled = true;
      scanImageBtn.classList.add("is-scanning");
      if (uploadBox) uploadBox.classList.add("is-processing");
      scanImageBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
      setTimeout(() => {
        window.location.href = "result.php";
      }, 720);
    });
  }

  // Open Webcam Modal
  const cameraLauncher = document.createElement("button");
  cameraLauncher.type = "button";
  cameraLauncher.className = "secondary-btn full-btn";
  cameraLauncher.id = "launchCameraBtn";
  cameraLauncher.innerHTML = '<i class="fa-solid fa-camera"></i> Open Camera Capture';
  cameraLauncher.style.marginTop = "10px";
  uploadBox.appendChild(cameraLauncher);

  cameraLauncher.addEventListener("click", () => {
    webcamModal.classList.add("active");
    webcamModal.setAttribute("aria-hidden", "false");
    startWebcam();
  });

  if (closeWebcamBtn) {
    closeWebcamBtn.addEventListener("click", stopWebcam);
  }

  if (startWebcamBtn) {
    startWebcamBtn.addEventListener("click", startWebcam);
  }

  if (captureWebcamBtn) {
    captureWebcamBtn.addEventListener("click", captureSnapshot);
  }

  function startWebcam() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
          webcamStream = stream;
          webcamVideo.srcObject = stream;
          captureWebcamBtn.disabled = false;
          startWebcamBtn.style.display = "none";
        })
        .catch(err => {
          console.error("Camera access error:", err);
          alert("Webcam access not allowed or unavailable. Loading simulation scanning mode instead.");
          stopWebcam();
          loadSimulatedUpload();
        });
    } else {
      alert("Browser camera api not supported. Triggering file simulation.");
      loadSimulatedUpload();
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    webcamModal.classList.remove("active");
    webcamModal.setAttribute("aria-hidden", "true");
    startWebcamBtn.style.display = "inline-flex";
    captureWebcamBtn.disabled = true;
  }

  function captureSnapshot() {
    if (!webcamStream) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // Draw mirrored if front facing, but environment usually is fine
    ctx.drawImage(webcamVideo, 0, 0, 640, 480);

    // Compress to small JPEG dataURL (approx 25KB) to fit localStorage
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

    const captures = [{
      name: "Camera_Snapshot_" + Date.now().toString().slice(-4) + ".jpg",
      size: Math.round(dataUrl.length * 0.75), // approximate byte size
      dataUrl: dataUrl
    }];

    localStorage.setItem("purityloop_uploads", JSON.stringify(captures));
    stopWebcam();
    window.location.href = "result.php";
  }

  function loadSimulatedUpload() {
    // Falls back to camera demo by simulating snapshot
    const names = ["aluminum-can.png", "plastic-bottle.png", "glass-jar.png", "battery.png"];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const simulatedFiles = [{
      name: "Simulation_" + randomName,
      size: 52000,
      isSimulation: true,
      assetPath: "assets/items/" + randomName
    }];
    localStorage.setItem("purityloop_uploads", JSON.stringify(simulatedFiles));
    window.location.href = "result.php";
  }

  function processSelectedFiles(files) {
    const list = Array.from(files);

    // Validate sizes and types
    let totalSize = list.reduce((s, f) => s + f.size, 0);
    if (list.length > MAX_TOTAL_FILES) {
      alert(`Too many files selected. Maximum is ${MAX_TOTAL_FILES} files.`);
      return;
    }
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
      alert("Total files size exceeds 100MB threshold.");
      return;
    }

    fileName.textContent = `Selected: ${list[0].name}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`;

    // Render Preview Thumbnail & Checkmark
    const previewContainer = document.getElementById("uploadPreviewContainer");
    const previewImage = document.getElementById("uploadPreviewImage");
    if (previewContainer && previewImage) {
      const firstFile = list.find(f => f.type.startsWith("image/"));
      if (firstFile) {
        const previewReader = new FileReader();
        previewReader.onload = function (e) {
          previewImage.src = e.target.result;
          previewContainer.style.display = "flex";
          previewContainer.classList.remove("preview-visible");
          requestAnimationFrame(() => previewContainer.classList.add("preview-visible"));
        };
        previewReader.readAsDataURL(firstFile);
      } else {
        // Fallback for non-image files (e.g. ZIP)
        previewImage.src = "assets/logo.png";
        previewContainer.style.display = "flex";
        previewContainer.classList.remove("preview-visible");
        requestAnimationFrame(() => previewContainer.classList.add("preview-visible"));
      }
    }

    // Compress images asynchronously using canvas to fit localStorage limits
    let loadedCount = 0;
    const compressedList = [];
    const imageFiles = list.filter(f => f.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      // Just zip/other files
      const simpleMetadata = list.map(f => ({
        name: f.name,
        size: f.size,
        type: f.name.endsWith(".zip") ? "ZIP" : "File",
        resultAssetPath: DEFAULT_SCAN_ASSET
      }));
      localStorage.setItem("purityloop_uploads", JSON.stringify(simpleMetadata));
      if (scanImageBtn) scanImageBtn.disabled = false;
      return;
    }

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          const max_size = 400; // Low resolution resize (approx 15-20KB JPEGs)
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > max_size) {
              h *= max_size / w;
              w = max_size;
            }
          } else {
            if (h > max_size) {
              w *= max_size / h;
              h = max_size;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

          compressedList.push({
            name: file.name,
            size: file.size,
            dataUrl: dataUrl,
            resultAssetPath: DEFAULT_SCAN_ASSET
          });

          loadedCount++;
          if (loadedCount === imageFiles.length) {
            localStorage.setItem("purityloop_uploads", JSON.stringify(compressedList));
            if (scanImageBtn) scanImageBtn.disabled = false;
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function createWebcamModalElements() {
    if (document.getElementById("webcamModal")) return;
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "webcamModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 600px;">
        <button type="button" class="modal-close" id="closeWebcamModal" aria-label="Close webcam">×</button>
        <p class="eyebrow" style="color: var(--green);">AI Camera Scanner</p>
        <h2 style="font-size: 24px; margin-bottom: 8px;">Webcam Object Capture</h2>
        <p style="color: var(--muted); margin-bottom: 12px;">Position the waste object in front of the lens. The AI will segment and audit the material.</p>
        
        <div class="webcam-stream-wrap">
          <video id="webcamVideo" autoplay playsinline muted></video>
          <div class="scanner-laser"></div>
        </div>

        <div class="modal-actions" style="margin-top: 18px;">
          <button type="button" class="secondary-btn" id="startWebcamBtn" style="display: none;">Re-enable Camera</button>
          <button type="button" class="primary-btn" id="captureWebcamBtn" disabled style="width: 100%;">Capture & Run AI Classification</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Inject styles for webcam modal dynamically
    const style = document.createElement("style");
    style.textContent = `
      .webcam-stream-wrap {
        position: relative;
        aspect-ratio: 4 / 3;
        background: #111e18;
        border-radius: var(--radius);
        overflow: hidden;
        border: 2px solid var(--line);
      }
      #webcamVideo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .scanner-laser {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 5px;
        background: linear-gradient(180deg, rgba(32, 178, 107, 0), #20b26b, rgba(32, 178, 107, 0));
        box-shadow: 0 0 10px rgba(32, 178, 107, 0.8);
        animation: scanAnim 3s infinite linear;
        pointer-events: none;
      }
      @keyframes scanAnim {
        0% { top: 0%; }
        50% { top: 100%; }
        100% { top: 0%; }
      }
    `;
    document.head.appendChild(style);
  }
}

/******************************************
 * 2. CLASSIFICATION RESULT VIEWER PAGE *
 ******************************************/
function initResultPage() {
  const canvas = document.getElementById("liveInferenceCanvas");
  if (!canvas) return; // Not on the result.php page

  const ctx2d = canvas.getContext("2d");
  const itemsScannedEl = document.getElementById("liveScanned");
  const itemsPurityEl = document.getElementById("livePurity");
  const liveFeed = document.getElementById("liveFeed");
  const actionText = document.getElementById("liveActionText");
  const activeBeltTitle = document.getElementById("liveStreamTitle");

  // Replace buttons
  const activeBeltDetailBtn = document.getElementById("activeBeltDetailBtn");
  const reviewLogsBtn = document.querySelector(".action-panel a");

  // Load uploads from storage
  let uploads = [];
  const rawUploads = localStorage.getItem("purityloop_uploads");

  if (rawUploads) {
    uploads = JSON.parse(rawUploads);
  }

  // Ensure "Active_Scan_Viewport.jpg" is always at the top of the list so it is the default loaded scan!
  const hasViewportItem = uploads.some(item => item.name === "Active_Scan_Viewport.jpg");
  if (!hasViewportItem) {
    uploads.unshift({
      name: "Active_Scan_Viewport.jpg",
      size: 145000,
      assetPath: DEFAULT_SCAN_ASSET
    });
    localStorage.setItem("purityloop_uploads", JSON.stringify(uploads));
  } else {
    // If it exists but isn't index 0, move it to index 0
    const idx = uploads.findIndex(item => item.name === "Active_Scan_Viewport.jpg");
    uploads[idx].assetPath = DEFAULT_SCAN_ASSET;
    uploads[idx].resultAssetPath = DEFAULT_SCAN_ASSET;
    if (idx > 0) {
      const item = uploads.splice(idx, 1)[0];
      uploads.unshift(item);
    }
    localStorage.setItem("purityloop_uploads", JSON.stringify(uploads));
  }

  // Fallback default simulation list if nothing else is left
  if (uploads.length <= 1) {
    uploads = [
      { name: "Active_Scan_Viewport.jpg", size: 145000, assetPath: DEFAULT_SCAN_ASSET },
      { name: "Recycled_PET_PlasticBottle.jpg", size: 45000, assetPath: "assets/items/plastic-bottle.png" },
      { name: "Crushed_SodaCan_Metal.png", size: 34000, assetPath: "assets/items/aluminum-can.png" },
      { name: "Waste_Battery_Hazard.jpg", size: 28000, assetPath: "assets/items/battery.png" },
      { name: "Cardboard_Box_Package.jpg", size: 89000, assetPath: "assets/items/cardboard.png" },
      { name: "Organics_BananaPeel_Contaminant.png", size: 52000, assetPath: "assets/items/food-waste.png" }
    ];
    localStorage.setItem("purityloop_uploads", JSON.stringify(uploads));
  }

  let activeIndex = 0;
  let activeImageObj = null;

  // Keep page headings aligned with the upload-to-result workflow
  const eyebrowEl = document.querySelector(".main-content .eyebrow");
  if (eyebrowEl) eyebrowEl.textContent = "AI Classification Hub";

  const headingEl = document.querySelector(".main-content h1");
  if (headingEl) headingEl.textContent = "Image Classification Results";

  const descEl = document.querySelector(".main-content header p");
  if (descEl) descEl.textContent = "Review uploaded images, confidence scores, contaminants, and recommended sorting action.";

  // Rename sidebar menu
  const sidebarNote = document.querySelector(".sidebar-note");
  if (sidebarNote) {
    sidebarNote.innerHTML = `
      <strong>Classification Hub</strong>
      <p>Audit uploaded datasets and webcam frame results before database ledger logging.</p>
    `;
  }

  // Change VIEW DETAILED BUTTON action to Approve and Log
  if (activeBeltDetailBtn) {
    activeBeltDetailBtn.textContent = "Verify & Approve Scan Result";
    activeBeltDetailBtn.className = "primary-btn full-btn";
    activeBeltDetailBtn.id = "verifyApproveBtn";
  }

  // Redesign "Review Logs" link button
  if (reviewLogsBtn) {
    reviewLogsBtn.textContent = "Go to Verification Logs";
    reviewLogsBtn.href = "alerts.php";
  }

  // Render Finder Grid and Load Active image
  renderFinderGrid();
  loadActiveImage();

  // Redraw canvas on window resize to stay responsive
  window.addEventListener('resize', () => {
    if (activeImageObj) drawCanvasFrame();
  });

  // Handle Verify & Approve Action
  const approveBtn = document.getElementById("verifyApproveBtn");
  if (approveBtn) {
    approveBtn.addEventListener("click", () => {
      const activeFile = uploads[activeIndex];
      if (!activeFile) return;
      const result = detectWasteTypeFromFileName(activeFile.name);

      // Save to audit log ledger
      const currentLedger = getAuditLedger();
      const newLog = {
        id: "LOG-" + Math.floor(1000 + Math.random() * 9000),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: activeFile.name,
        sourceKey: activeFile.name && activeFile.name.toLowerCase().endsWith(".zip") ? "ZIP-BATCH" : "SINGLE-IMAGE",
        category: result.category,
        weight: result.weight,
        confidence: result.confidence,
        status: result.statusClass === "safe" ? "Cleared" : result.statusClass === "danger" ? "Quarantined" : "Review Needed"
      };

      currentLedger.unshift(newLog);
      saveAuditLedger(currentLedger);

      // Show toast notification
      showToast(`Audit verified. ${result.category} was added to the review ledger.`, "success");

      // Mark row in queue as processed
      activeFile.processed = true;
      renderFinderGrid();
    });
  }

  // Live Auto-Scan simulation
  const autoScanCheckbox = document.getElementById("autoScanCheckbox");
  let autoScanInterval = null;

  function startAutoScanSimulation() {
    if (autoScanInterval) clearInterval(autoScanInterval);
    autoScanInterval = setInterval(() => {
      const itemsList = [
        { prefix: "SCAN_PlasticBottle_", names: ["plastic-bottle.png"] },
        { prefix: "SCAN_AluminiumCan_", names: ["aluminum-can.png"] },
        { prefix: "SCAN_GlassJar_", names: ["glass-jar.png"] },
        { prefix: "SCAN_BatteryHazard_", names: ["battery.png"] },
        { prefix: "SCAN_OrganicPeel_", names: ["food-waste.png"] },
        { prefix: "SCAN_TextileScrap_", names: ["textile.png"] },
        { prefix: "SCAN_CardboardBox_", names: ["cardboard.png"] },
        { prefix: "SCAN_PaperCrumpled_", names: ["crumpled-paper.png"] },
        { prefix: "SCAN_CoffeeCup_", names: ["coffee-cup.png"] }
      ];
      const choice = itemsList[Math.floor(Math.random() * itemsList.length)];
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const filename = `${choice.prefix}${randomId}.jpg`;

      const newScan = {
        name: filename,
        size: Math.floor(12000 + Math.random() * 45000),
        assetPath: `assets/items/${choice.names[0]}`,
        isNewGlow: true
      };

      uploads.push(newScan);

      // Keep max 24 items in queue folder to prevent memory bloat
      if (uploads.length > 24) {
        uploads.shift();
        // Clamp activeIndex but DON'T change the active view
        if (activeIndex >= uploads.length) activeIndex = uploads.length - 1;
      }

      localStorage.setItem("purityloop_uploads", JSON.stringify(uploads));

      // Re-render the grid WITHOUT switching the active image
      renderFinderGrid();

      // Scroll content pane to bottom to reveal new scan
      const contentPane = document.querySelector(".finder-content-pane");
      if (contentPane) {
        contentPane.scrollTop = contentPane.scrollHeight;
      }
    }, 4000);
  }

  function stopAutoScanSimulation() {
    if (autoScanInterval) {
      clearInterval(autoScanInterval);
      autoScanInterval = null;
    }
  }

  if (autoScanCheckbox) {
    autoScanCheckbox.addEventListener("change", () => {
      if (autoScanCheckbox.checked) {
        startAutoScanSimulation();
      } else {
        stopAutoScanSimulation();
      }
    });
  }

  function renderFinderGrid() {
    const grid = document.getElementById("finderGrid");
    const countText = document.getElementById("finderCountText");
    if (!grid) return;
    grid.innerHTML = "";
    if (countText) countText.textContent = `${uploads.length} item(s)`;

    uploads.forEach((file, index) => {
      const fileResult = detectWasteTypeFromFileName(file.name);
      let tagColor = "green";
      if (fileResult.statusClass === "danger") tagColor = "red";
      if (fileResult.statusClass === "warning") tagColor = "yellow";

      const card = document.createElement("div");
      card.className = `finder-file-card ${index === activeIndex ? "active" : ""}`;
      if (file.isNewGlow) {
        card.classList.add("new-file-glow");
        setTimeout(() => {
          card.classList.remove("new-file-glow");
          delete file.isNewGlow;
        }, 3000);
      }

      const imgSrc = file.dataUrl || file.assetPath || "assets/items/plastic-bottle.png";

      card.innerHTML = `
        <span class="finder-tag-dot ${tagColor}"></span>
        <div class="finder-thumbnail-wrap">
          <img src="${imgSrc}" alt="${file.name}">
        </div>
        <div class="finder-filename" title="${file.name}">${file.name}</div>
      `;

      card.addEventListener("click", () => {
        activeIndex = index;
        const cards = grid.querySelectorAll(".finder-file-card");
        cards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        loadActiveImage();
      });

      grid.appendChild(card);
    });
  }

  function loadActiveImage() {
    const activeFile = uploads[activeIndex];
    if (activeBeltTitle) activeBeltTitle.textContent = activeFile.name;

    activeImageObj = new Image();
    if (activeFile.resultAssetPath) {
      activeImageObj.src = activeFile.resultAssetPath;
    } else if (activeFile.dataUrl) {
      activeImageObj.src = activeFile.dataUrl;
    } else {
      activeImageObj.src = activeFile.assetPath || "assets/items/plastic-bottle.png";
    }

    activeImageObj.onload = function () {
      drawCanvasFrame();
    };

    const result = detectWasteTypeFromFileName(activeFile.name);
    updateResultDetails(result, activeFile);
  }

  function updateResultDetails(result, file) {
    const scannedVal = document.getElementById("liveScanned");
    const purityVal = document.getElementById("livePurity");
    const actionPanel = document.getElementById("liveActionPanel");

    const boxes = getDetectedObjectsForFile(file.name);
    document.body.classList.remove("result-detected");
    requestAnimationFrame(() => document.body.classList.add("result-detected"));

    // Calculate overall purity (percentage of recyclables)
    let recyclableCount = 0;
    boxes.forEach(box => {
      if (box.label.includes("Alert") || box.label.toLowerCase().includes("hazard") || box.label.toLowerCase().includes("contaminant")) {
        return; // Contaminants do not count toward recyclable purity
      }
      const labelLower = box.label.toLowerCase();
      if (labelLower.includes("pet bottle") ||
        labelLower.includes("plastic") ||
        labelLower.includes("metal") ||
        labelLower.includes("can") ||
        labelLower.includes("aluminum") ||
        labelLower.includes("glass") ||
        labelLower.includes("paper") ||
        labelLower.includes("cardboard") ||
        labelLower.includes("bottle") ||
        labelLower.includes("jar") ||
        labelLower.includes("box")) {
        recyclableCount++;
      }
    });

    const purityPct = Math.round((recyclableCount / boxes.length) * 100);

    if (scannedVal) scannedVal.textContent = `${boxes.length} items`;
    if (purityVal) {
      purityVal.textContent = `${purityPct}%`;

      const ringFill = document.getElementById("purityRingFill");
      const circumference = 314.16;
      const offset = circumference - (purityPct / 100) * circumference;

      if (ringFill) {
        ringFill.style.strokeDashoffset = offset;
      }

      // Color-code the purity value
      if (purityPct === 100) {
        purityVal.style.color = "var(--green)";
        if (ringFill) ringFill.style.stroke = "var(--green)";
      } else if (purityPct >= 70) {
        purityVal.style.color = "var(--warning)";
        if (ringFill) ringFill.style.stroke = "var(--warning)";
      } else {
        purityVal.style.color = "var(--danger)";
      }
    }

    const marketValue = (recyclableCount * 0.05).toFixed(2);
    const co2Offset = (recyclableCount * 0.2).toFixed(1);
    const marketValueEl = document.getElementById("liveMarketValue");
    const co2OffsetEl = document.getElementById("liveCO2Offset");
    if (marketValueEl) marketValueEl.textContent = `$${marketValue}`;
    if (co2OffsetEl) co2OffsetEl.textContent = `${co2Offset} kg`;

    // Next Steps Action Guide Generator
    if (actionText) {
      const hasBattery = boxes.some(b => b.label.toLowerCase().includes("battery"));
      const hasContaminant = purityPct < 100;

      let badgeHtml = "";
      if (hasBattery) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card review-required";
        badgeHtml = `
          <strong>Human Review Required</strong>
          <p>
            Lithium battery detected in this upload. Extract the battery and place it in fire-safe quarantine storage. Reject the contaminated record after review.
          </p>
        `;
      } else if (hasContaminant) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card review-required";
        const contaminantsList = [];
        boxes.forEach(b => {
          const label = b.label.toLowerCase();
          if (label.includes("alert") || label.includes("trash") || label.includes("textile") || label.includes("contaminant")) {
            contaminantsList.push(b.label.replace(" Alert", "").replace(" Contaminant", ""));
          }
        });
        const uniqContaminants = [...new Set(contaminantsList)];
        badgeHtml = `
          <strong>Human Review Required</strong>
          <p>
            Contamination rate is ${100 - purityPct}%. Remove or verify the highlighted material${uniqContaminants.length > 1 ? "s" : ""}: <em>${uniqContaminants.join(", ") || "mixed contaminants"}</em>.
          </p>
        `;
      } else {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card recovery-clear";
        badgeHtml = `
          <strong>Accept Batch</strong>
          <p>
            100% recyclable purity. No contaminants or hazards were detected. Verify this result to add it to the review ledger.
          </p>
        `;
      }
      actionText.innerHTML = badgeHtml;
    }

    if (liveFeed) {
      liveFeed.innerHTML = "";

      const listContainer = document.createElement("div");
      listContainer.style.display = "flex";
      listContainer.style.flexDirection = "column";
      listContainer.style.gap = "6px";
      listContainer.style.marginBottom = "10px";

      boxes.forEach((box, index) => {
        const itemDiv = document.createElement("div");
        const isContaminant = box.label.toLowerCase().includes("contaminant") ||
          box.label.toLowerCase().includes("hazard") ||
          box.label.toLowerCase().includes("alert") ||
          box.label.toLowerCase().includes("trash");
        itemDiv.className = `material-row ${isContaminant ? "contaminant" : "recyclable"}`;
        itemDiv.style.setProperty("--row-delay", `${index * 70}ms`);
        itemDiv.style.setProperty("--material-color", isContaminant ? "#ff4d57" : box.color);

        itemDiv.innerHTML = `
          <span>
            <strong>${box.label.replace(" Contaminant", "")}</strong>
            <small>${isContaminant ? "Contaminant" : "Recyclable"} | Qty 1</small>
          </span>
          <b>${box.confidence}</b>
        `;
        listContainer.appendChild(itemDiv);
      });
      liveFeed.appendChild(listContainer);

      const infoDiv = document.createElement("div");
      infoDiv.className = "material-meta";
      infoDiv.innerHTML = `
        <div><strong>Disposal Bin:</strong> ${result.bin}</div>
        <div><strong>Object Weight:</strong> ${file.size ? formatFileSize(file.size) : result.weight}</div>
      `;
      liveFeed.appendChild(infoDiv);
    }

    renderStationDetail("UPLOAD-HUB", { activate: false });
    renderMaterialDetail(result.category, { activate: false });
  }

  // Helper to draw rounded rectangle pills
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawCanvasFrame() {
    if (!canvas || !activeImageObj) return;

    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height || Math.round(rect.width * (9 / 16));

    // - 1. Draw image filling the entire canvas (object-fit: cover style) -
    const imgW = activeImageObj.width;
    const imgH = activeImageObj.height;
    const scale = Math.max(canvas.width / imgW, canvas.height / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = (canvas.height - drawH) / 2;

    ctx2d.drawImage(activeImageObj, drawX, drawY, drawW, drawH);

    // - 2. Subtle dark vignette overlay (like NANDO AI dims the image slightly) -
    ctx2d.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);

    // - 3. Redraw image at 88% brightness on top (creates the "dim background" look) -
    ctx2d.globalAlpha = 0.88;
    ctx2d.drawImage(activeImageObj, drawX, drawY, drawW, drawH);
    ctx2d.globalAlpha = 1.0;

    // - 4. Draw all bounding boxes (NANDO AI static style) -
    const activeFile = uploads[activeIndex];
    const boxes = getDetectedObjectsForFile(activeFile.name);

    boxes.forEach(box => {
      const boxX = drawX + drawW * box.x;
      const boxY = drawY + drawH * box.y;
      const boxW = drawW * box.w;
      const boxH = drawH * box.h;

      // Determine if this is a hazard/contaminant (red) vs recyclable (green/other)
      const isHazard = box.color === "#b42318" || box.color === "#ff8000" ||
        box.label.includes("Alert") || box.label.includes("Hazard") ||
        box.label.includes("Trash") || box.label.includes("Textile") ||
        box.label.includes("Film") || box.label.includes("Contaminant");
      const borderColor = isHazard ? "#e63030" : box.color;

      // Semi-transparent colored fill inside box (NANDO AI signature look)
      ctx2d.fillStyle = isHazard
        ? "rgba(240, 68, 56, 0.34)"
        : hexToRgba(borderColor, 0.30);
      ctx2d.fillRect(boxX, boxY, boxW, boxH);

      // Solid border - 2px, matches NANDO AI
      ctx2d.strokeStyle = borderColor;
      ctx2d.lineWidth = 2.4;
      ctx2d.strokeRect(boxX, boxY, boxW, boxH);

      // - Label tag at top-left of box (NANDO AI flat dark chip style) -
      ctx2d.font = "bold 11.5px 'Courier New', monospace";
      const rawLabel = box.label.replace(" Alert", "").replace(" Contaminant", "").toUpperCase().replace(/ /g, "_");
      const labelText = `${rawLabel} ${box.confidence}`;
      const textW = ctx2d.measureText(labelText).width;
      const tagW = textW + 14;
      const tagH = 21;
      const tagX = boxX;
      const tagY = boxY;

      // Dark chip background (exactly like NANDO AI - very dark, slight transparency)
      ctx2d.fillStyle = "rgba(4, 8, 6, 0.88)";
      ctx2d.fillRect(tagX, tagY, tagW, tagH);

      // Thin colored top border on tag (category color accent)
      ctx2d.fillStyle = borderColor;
      ctx2d.fillRect(tagX, tagY, tagW, 2);

      // White label text
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fillText(labelText, tagX + 7, tagY + 15);
    });

    // - 5. Bottom telemetry bar (subtle, minimal - doesn't distract from image) -
    const hudY = canvas.height - 30;
    ctx2d.fillStyle = "rgba(4, 8, 6, 0.70)";
    ctx2d.fillRect(0, hudY, canvas.width, 30);
    ctx2d.fillStyle = "rgba(46, 204, 113, 0.85)";
    ctx2d.font = "10px 'Courier New', monospace";
    const now = new Date();
    const tsStr = now.toISOString().replace("T", "  ").substring(0, 19) + " UTC";
    ctx2d.fillText(`YOLOv8x  |  ${boxes.length} objects detected  |  ${tsStr}`, 14, hudY + 19);
  }

  // Utility: convert hex colour to rgba string
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }


  function triggerAuditLoggedNotification() {
    const badge = document.createElement("div");
    badge.className = "audit-badge-animation";
    badge.innerHTML = `Audit verified<br><strong>Logged to Ledger</strong>`;

    document.body.appendChild(badge);

    setTimeout(() => {
      badge.remove();
    }, 2800);

    if (!document.getElementById("badgeAnimStyles")) {
      const styles = document.createElement("style");
      styles.id = "badgeAnimStyles";
      styles.textContent = `
        .audit-badge-animation {
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--green-dark);
          color: #ffffff;
          border: 2px solid #20b26b;
          border-radius: var(--radius);
          padding: 20px 40px;
          text-align: center;
          font-size: 18px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          z-index: 9999;
          animation: floatUpBadge 2.8s ease-out;
        }
        @keyframes floatUpBadge {
          0% { opacity: 0; transform: translate(-50%, -30%); }
          15% { opacity: 1; transform: translate(-50%, -50%); }
          80% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, -70%); }
        }
      `;
      document.head.appendChild(styles);
    }
  }
}

/**************************************
 * 3. VERIFICATION LEDGER AUDIT PAGE  *
 **************************************/
function initReviewModal() {
  const modal = document.getElementById("reviewModal");
  if (!modal) return; // Not on verification ledger page

  const tableBody = document.querySelector(".ledger-table tbody");
  const reviewTitle = document.getElementById("reviewTitle");
  const reviewDescription = document.getElementById("reviewDescription");
  const closeButton = document.getElementById("closeReviewModal");
  const clearButton = document.getElementById("clearSegment");
  const quarantineButton = document.getElementById("quarantineSegment");

  let activeLogId = null;
  let activeRow = null;

  // Change heading titles to match upload-based audit logs
  const sectionKicker = document.querySelector(".ledger-panel .eyebrow");
  if (sectionKicker) sectionKicker.textContent = "Audit verification";

  const sectionTitle = document.querySelector(".ledger-panel h2");
  if (sectionTitle) sectionTitle.textContent = "Uploaded Image Ledger";

  const mainHeaderTitle = document.querySelector(".main-content h1");
  if (mainHeaderTitle) mainHeaderTitle.textContent = "Human Review Logs";

  const mainHeaderDesc = document.querySelector(".main-content header p");
  if (mainHeaderDesc) mainHeaderDesc.textContent = "Validate uploaded image results before they become final classification records.";

  const ledgerSidebarNote = document.querySelector(".sidebar-note");
  if (ledgerSidebarNote) {
    ledgerSidebarNote.innerHTML = `
      <strong>Human review</strong>
      <p>Open records marked review needed to approve, correct, or reject AI classifications.</p>
    `;
  }

  // Adjust table columns to the upload-only workflow
  const tableHeaders = document.querySelectorAll(".ledger-table th");
  if (tableHeaders[1]) tableHeaders[1].textContent = "Upload Source";
  if (tableHeaders[4]) tableHeaders[4].textContent = "AI Confidence";

  // Pre-load reclassification controls inside the modal
  const snapshotItems = document.querySelector(".review-snapshot .snapshot-items");
  const modalActions = document.querySelector(".modal-actions");

  if (modalActions && !document.getElementById("reclassifySelect")) {
    // Inject custom reclassificaton dropdown
    const reclassifyDiv = document.createElement("div");
    reclassifyDiv.style.gridColumn = "span 2";
    reclassifyDiv.style.marginTop = "10px";
    reclassifyDiv.innerHTML = `
      <label for="reclassifySelect" style="display:block; font-weight:800; margin-bottom:6px; font-size:13px;">Manual reclassification category</label>
      <select id="reclassifySelect" style="width:100%; height:42px; border:1px solid var(--line); border-radius:var(--radius); padding:0 10px; background:#fff; font-weight:700;">
        <option value="Plastic">Plastic</option>
        <option value="Metal">Metal</option>
        <option value="Glass">Glass</option>
        <option value="Paper">Paper</option>
        <option value="Cardboard">Cardboard</option>
        <option value="Food Organics">Food Organics</option>
        <option value="General Trash">General Trash</option>
        <option value="Textile">Textile</option>
        <option value="Battery">Battery</option>
      </select>
    `;
    modalActions.parentNode.insertBefore(reclassifyDiv, modalActions);
  }

  // Adjust button text
  if (clearButton) clearButton.textContent = "Verify result";
  if (quarantineButton) quarantineButton.textContent = "Reject as contaminated";

  // Build Table from LocalStorage state with simulated skeleton loading delay
  setTimeout(() => {
    buildLedgerTable();
  }, 800);

  function buildLedgerTable() {
    if (!tableBody) return;
    const ledger = getAuditLedger();
    tableBody.innerHTML = "";

    ledger.forEach(log => {
      const tr = document.createElement("tr");
      tr.id = `row-${log.id}`;
      const sourceLabel = getLogSourceLabel(log);
      const sourceKey = getLogSourceKey(log);

      let confidenceClass = "positive";
      const numConf = parseFloat(log.confidence);
      if (numConf < 60) confidenceClass = "danger-text";
      else if (numConf < 85) confidenceClass = "warning-text";

      let statusPillClass = "cleared";
      let statusText = log.status;
      if (log.status === "Quarantined" || log.status === "Quarantine Active" || log.status === "Quarantine") {
        statusPillClass = "quarantine";
        statusText = "Quarantined";
      } else if (log.status === "Review Needed") {
        statusPillClass = "review review-action";
      } else if (log.status.includes("Corrected") || log.status.includes("Verified")) {
        statusPillClass = "cleared";
      }

      tr.innerHTML = `
        <td>${log.time}</td>
        <td><button type="button" class="text-drill source-drill" data-station-detail="${sourceKey}">${sourceLabel}</button></td>
        <td><button type="button" class="text-drill" data-material-detail="${log.category}">${log.category}</button></td>
        <td>${log.weight}</td>
        <td class="${confidenceClass}">${log.confidence}</td>
        <td>
          ${log.status === "Review Needed"
          ? `<button type="button" class="status-pill review review-action" data-logid="${log.id}">${log.status}</button>`
          : `<span class="status-pill ${statusPillClass}">${statusText}</span>`
        }
        </td>
      `;

      // Set up drill event listeners inside the rows
      const drills = tr.querySelectorAll(".text-drill");
      drills.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (btn.dataset.materialDetail) {
            renderMaterialDetail(btn.dataset.materialDetail);
          } else if (btn.dataset.stationDetail) {
            renderStationDetail(btn.dataset.stationDetail);
          }
        });
      });

      tableBody.appendChild(tr);
    });

    // Attach click listeners for "Review Needed" buttons
    document.querySelectorAll(".review-action").forEach(button => {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        activeLogId = button.dataset.logid;
        activeRow = button.closest("tr");

        const ledger = getAuditLedger();
        const activeLog = ledger.find(l => l.id === activeLogId);

        if (reviewTitle) reviewTitle.textContent = "Audit Record: " + activeLog.id;
        if (reviewDescription) {
          reviewDescription.textContent = "Review this uploaded image result. Overrides update the material category and final audit status.";
        }

        // Load correct mock image asset into snapshot box
        const snapshotFeed = document.querySelector(".review-snapshot .snapshot-feed");
        if (snapshotFeed) {
          snapshotFeed.innerHTML = `
            <span class="snapshot-live"></span>
            <strong>LOW CONFIDENCE - HUMAN AUDIT REQUIRED</strong>
          `;
        }

        // Set matching sample item in review window
        if (snapshotItems) {
          let categoryKey = activeLog.category.toLowerCase().replace(" ", "_");
          if (categoryKey === "food_organics" || categoryKey === "food") categoryKey = "food_organics";
          const itemMeta = detectionResults[categoryKey] || detectionResults.unknown;

          snapshotItems.innerHTML = `
            <img src="${itemMeta.imageSrc}" alt="${activeLog.category}" style="max-height:90px; object-fit:contain;" />
            <div style="display:flex; flex-direction:column; gap:4px; font-size:13px; text-align:left;">
              <div><strong>Initial Prediction:</strong> ${activeLog.category}</div>
              <div><strong>Upload Source:</strong> ${getLogSourceLabel(activeLog)}</div>
              <div><strong>Weight:</strong> ${activeLog.weight}</div>
              <div><strong>Confidence:</strong> ${activeLog.confidence}</div>
            </div>
          `;

          // Select matching item in dropdown
          const reclassifySelect = document.getElementById("reclassifySelect");
          if (reclassifySelect) {
            reclassifySelect.value = activeLog.category;
          }
        }

        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
      });
    });
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    activeLogId = null;
    activeRow = null;
  }

  if (closeButton) closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      if (activeLogId) {
        const ledger = getAuditLedger();
        const activeLog = ledger.find(l => l.id === activeLogId);

        const reclassifySelect = document.getElementById("reclassifySelect");
        const chosenCategory = reclassifySelect ? reclassifySelect.value : activeLog.category;

        let toastMsg = "";
        if (chosenCategory !== activeLog.category) {
          toastMsg = `Record reclassified to ${chosenCategory} and verified.`;
          activeLog.category = chosenCategory;
          activeLog.status = "Verified (Reclassified)";
        } else {
          toastMsg = `Record ${activeLog.id} verified and cleared.`;
          activeLog.status = "Verified (Cleared)";
        }

        saveAuditLedger(ledger);
        buildLedgerTable();
        showToast(toastMsg, "success");
      }
      closeModal();
    });
  }

  if (quarantineButton) {
    quarantineButton.addEventListener("click", function () {
      if (activeLogId) {
        const ledger = getAuditLedger();
        const activeLog = ledger.find(l => l.id === activeLogId);
        activeLog.status = "Quarantined";
        saveAuditLedger(ledger);
        buildLedgerTable();
        showToast(`Record ${activeLog.id} flagged as contaminated and rejected.`, "error");
      }
      closeModal();
    });
  }
}

/******************************************
 * 4. OPERATIONS DASHBOARD PAGE           *
 ******************************************/
function initAnalyticsCharts() {
  const palette = {
    green: "#00F08A",
    blue: "#4F91FF",
    amber: "#D8A448",
    purple: "#7DDFA7",
    slate: "#78938D",
    red: "#D85E70",
    orange: "#00D6D6",
    teal: "#00D6D6",
    darkGreen: "#08211D"
  };

  const compositionCanvas = document.getElementById("compositionChart");
  if (!compositionCanvas) return; // Not on analytics page

  // Live clock ticking in topbar
  const clockEl = document.getElementById("liveClock");
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    clockEl.textContent = timeStr;
  }
  updateClock();
  setInterval(updateClock, 1000);


  // Update recent activity ledger preview list from localStorage
  const recentList = document.getElementById("dashLedgerList");
  if (recentList) {
    const ledger = getAuditLedger().slice(0, 3);
    recentList.innerHTML = "";

    ledger.forEach(log => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "drill-trigger";
      itemDiv.tabIndex = 0;

      let statusClass = "cleared";
      if (log.status === "Review Needed") statusClass = "review";
      if (log.status === "Quarantined" || log.status === "Quarantine") statusClass = "quarantine";

      itemDiv.innerHTML = `
        <span class="status-pill ${statusClass}">${log.status}</span>
        <strong>Scan Verification</strong>
        <p>${log.time}  -  ${getLogSourceLabel(log)}  -  ${log.category} (${log.confidence})</p>
      `;

      itemDiv.addEventListener("click", () => {
        renderMaterialDetail(log.category);
      });

      recentList.appendChild(itemDiv);
    });
  }

  // Draw chart views
  if (!window.Chart) {
    drawFallbackAnalyticsCharts(palette);
    window.addEventListener("resize", function () {
      drawFallbackAnalyticsCharts(palette);
    });
    return;
  }

  // Register datalabels plugin
  if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  const isLight = document.body.classList.contains("light");
  const tickColor = isLight ? "#6c7b74" : "rgba(244,255,249,0.62)";
  const gridColor = isLight ? "#dce7e1" : "rgba(178,255,224,0.16)";
  const labelColor = isLight ? "#14221b" : "rgba(244,255,249,0.88)";
  const legendColor = isLight ? "#6c7b74" : "rgba(244,255,249,0.68)";
  const donutBorderColor = isLight ? "#ffffff" : "rgba(4,15,13,0.92)";

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          boxWidth: 12,
          color: legendColor
        }
      }
    }
  };

  // 1. COMPOSITION CHART (Updated to the new 9 categories)
  new Chart(compositionCanvas, {
    type: "doughnut",
    data: {
      labels: ["Metal", "Plastic", "Glass", "Paper", "Cardboard", "Food Organics", "General Trash", "Textile", "Battery"],
      datasets: [{
        data: [25, 20, 15, 10, 10, 8, 5, 5, 2],
        backgroundColor: [
          palette.green,
          palette.teal,
          palette.blue,
          palette.purple,
          palette.amber,
          "#63CFA2",
          palette.slate,
          "#2FA6A6",
          palette.red
        ],
        borderColor: donutBorderColor,
        borderWidth: 2
      }]
    },
    options: {
      ...chartDefaults,
      cutout: "68%",
      plugins: {
        ...chartDefaults.plugins,
        legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, color: legendColor } },
        datalabels: {
          color: "#ffffff",
          font: { weight: "bold", size: 10 },
          formatter: (value) => value >= 5 ? value + "%" : "",
          display: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 5,
          textShadowColor: "rgba(0,0,0,0.4)",
          textShadowBlur: 3
        }
      }
    }
  });

  // 2. RESALE CHART
  const resaleCanvas = document.getElementById("resaleChart");
  if (resaleCanvas) {
    new Chart(resaleCanvas, {
      type: "bar",
      data: {
        labels: ["Metal", "Plastic", "Glass", "Paper", "Cardboard"],
        datasets: [{
          label: "Resale Value",
          data: [540000, 152000, 107051, 15000, 21000],
          backgroundColor: [palette.green, palette.teal, palette.blue, palette.purple, palette.amber],
          borderColor: "rgba(4,15,13,0.92)",
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: "end",
            align: "top",
            color: labelColor,
            font: { weight: "bold", size: 10.5 },
            formatter: (value) => "$" + (value / 1000).toFixed(0) + "k",
            padding: { bottom: 4 }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => "$" + value / 1000 + "k", color: tickColor },
            grid: { color: gridColor }
          },
          x: { ticks: { color: tickColor }, grid: { display: false } }
        }
      }
    });
  }

  // 3. YIELD CHART
  const yieldCanvas = document.getElementById("yieldChart");
  if (yieldCanvas) {
    new Chart(yieldCanvas, {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
          { label: "Metal", data: [350, 360, 380, 400, 420, 450], borderColor: palette.green, backgroundColor: isLight ? "rgba(0, 240, 138, 0.04)" : "rgba(0, 240, 138, 0.10)", tension: 0.32, fill: true },
          { label: "Plastic", data: [280, 290, 310, 330, 350, 380], borderColor: palette.teal, backgroundColor: isLight ? "rgba(0, 214, 214, 0.04)" : "rgba(0, 214, 214, 0.08)", tension: 0.32, fill: true },
          { label: "Paper", data: [110, 115, 120, 130, 140, 150], borderColor: palette.purple, backgroundColor: isLight ? "rgba(125, 223, 167, 0.04)" : "rgba(125, 223, 167, 0.08)", tension: 0.32, fill: true },
          { label: "Cardboard", data: [90, 95, 105, 120, 130, 140], borderColor: palette.amber, backgroundColor: isLight ? "rgba(216, 164, 72, 0.04)" : "rgba(216, 164, 72, 0.08)", tension: 0.32, fill: true },
          { label: "Glass", data: [90, 95, 105, 110, 120, 127], borderColor: palette.blue, backgroundColor: isLight ? "rgba(79, 145, 255, 0.04)" : "rgba(79, 145, 255, 0.08)", tension: 0.32, fill: true }
        ]
      },
      options: {
        ...chartDefaults,
        plugins: {
          datalabels: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
          x: { ticks: { color: tickColor }, grid: { display: false } }
        }
      }
    });
  }
}

/* Fallback chart drawings inside plain canvas context */
function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(240, Math.floor(rect.width * ratio));
  canvas.height = Math.max(180, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, width: rect.width, height: rect.height };
}

function drawFallbackAnalyticsCharts(palette) {
  const composition = document.getElementById("compositionChart");
  if (composition) {
    const { ctx, width, height } = prepareCanvas(composition);
    const labels = ["Metal", "Plastic", "Glass", "Paper", "Cardboard", "Food Organics", "General Trash", "Textile", "Battery"];
    const values = [25, 20, 15, 10, 10, 8, 5, 5, 2];
    const colors = [palette.amber, palette.blue, palette.purple, palette.slate, palette.orange, palette.green, "#7f8c8d", palette.teal, palette.red];
    const total = values.reduce((sum, value) => sum + value, 0);
    const radius = Math.min(width, height) * 0.28;
    const centerX = width * 0.5;
    const centerY = height * 0.43;
    let start = -Math.PI / 2;

    values.forEach((value, index) => {
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index];
      ctx.fill();
      start += angle;
    });

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = "#14221b";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Material Mix", centerX, centerY + 6);
  }

  const resale = document.getElementById("resaleChart");
  if (resale) {
    const { ctx, width, height } = prepareCanvas(resale);
    const labels = ["Metal", "Plastic", "Glass", "Paper", "Cardboard"];
    const values = [540, 152, 107, 15, 21];
    const colors = [palette.amber, palette.blue, palette.purple, palette.slate, palette.orange];
    drawFallbackBars(ctx, width, height, labels, values, colors, "$", "k");
  }

  const yieldCanvas = document.getElementById("yieldChart");
  if (yieldCanvas) {
    const { ctx, width, height } = prepareCanvas(yieldCanvas);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const series = [
      { label: "Metal", data: [350, 360, 380, 400, 420, 450], color: palette.amber },
      { label: "Plastic", data: [280, 290, 310, 330, 350, 380], color: palette.blue },
      { label: "Paper", data: [110, 115, 120, 130, 140, 150], color: palette.slate },
      { label: "Cardboard", data: [90, 95, 105, 120, 130, 140], color: palette.orange },
      { label: "Glass", data: [90, 95, 105, 110, 120, 127], color: palette.purple }
    ];
    drawFallbackLines(ctx, width, height, months, series);
  }
}

function drawFallbackBars(ctx, width, height, labels, values, colors, prefix, suffix) {
  const max = Math.max(...values) * 1.15;
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const barGap = 14;
  const barWidth = Math.max(20, (chartWidth - barGap * (labels.length - 1)) / labels.length);

  ctx.strokeStyle = "#d9e6df";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + chartHeight);
  ctx.lineTo(left + chartWidth, top + chartHeight);
  ctx.stroke();

  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  labels.forEach((label, index) => {
    const barHeight = (values[index] / max) * chartHeight;
    const x = left + index * (barWidth + barGap);
    const y = top + chartHeight - barHeight;
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#66756f";
    ctx.fillText(label, x + barWidth / 2, height - 20);
    ctx.fillStyle = "#14221b";
    ctx.font = "bold 11px Arial";
    ctx.fillText(prefix + values[index] + suffix, x + barWidth / 2, y - 6);
    ctx.font = "11px Arial";
  });
}

function drawFallbackLines(ctx, width, height, months, series) {
  const allValues = series.flatMap(item => item.data);
  const max = Math.max(...allValues) * 1.15;
  const left = 44;
  const right = 18;
  const top = 18;
  const bottom = 52;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  ctx.strokeStyle = "#d9e6df";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (chartHeight / 4) * i;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + chartWidth, y); ctx.stroke();
  }

  ctx.font = "11px Arial";
  ctx.fillStyle = "#66756f";
  ctx.textAlign = "center";
  months.forEach((label, index) => {
    const x = left + (chartWidth / (months.length - 1)) * index;
    ctx.fillText(label, x, top + chartHeight + 24);
  });

  series.forEach(item => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    item.data.forEach((value, index) => {
      const x = left + (chartWidth / (item.data.length - 1)) * index;
      const y = top + chartHeight - (value / max) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

/******************************************
 * 5. SIDEBAR DRILL-DOWN INTERACTIONS     *
 ******************************************/
const drillMaterialData = {
  Metal: {
    color: "#b7791f",
    isContaminant: false,
    tonnage: "450 tons",
    value: "$540,000",
    rate: "@ $1,200/ton market rate",
    purity: "99.1%",
    status: "Clean recyclable metal grade",
    subtitle: "30-day recovery trend, purity grade, and upload source mix for audited metals.",
    trend: [12, 14, 15, 13, 16, 18, 17, 15, 14, 15, 16, 14, 13, 15, 17, 19, 18, 16, 15, 14],
    zones: [["Single image", 180], ["ZIP batch", 150], ["Demo dataset", 120]]
  },
  Plastic: {
    color: "#2f6f8f",
    isContaminant: false,
    tonnage: "380 tons",
    value: "$152,000",
    rate: "@ $400/ton market rate",
    purity: "97.4%",
    status: "Bale-ready recyclables",
    subtitle: "Plastic recovery trend, resale value, and uploaded image review logs.",
    trend: [10, 11, 12, 11, 13, 14, 13, 12, 11, 12, 13, 11, 10, 12, 14, 15, 14, 12, 11, 10],
    zones: [["Single image", 150], ["ZIP batch", 130], ["Demo dataset", 100]]
  },
  Glass: {
    color: "#8b5cf6",
    isContaminant: false,
    tonnage: "127 tons",
    value: "$107,051",
    rate: "@ $843/ton market rate",
    purity: "91.8%",
    status: "Recalibration recommended",
    subtitle: "Glass recovery is stable, but audit reviews suggest color segregation holds potential value.",
    trend: [2, 3, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3, 4, 3],
    zones: [["Single image", 60], ["ZIP batch", 40], ["Demo dataset", 27]]
  },
  Paper: {
    color: "#8aa0a8",
    isContaminant: false,
    tonnage: "150 tons",
    value: "$15,000",
    rate: "@ $100/ton market rate",
    purity: "93.2%",
    status: "Clean recyclable paper grade",
    subtitle: "Paper recovery logs showing dry-fiber bale consistency.",
    trend: [4, 5, 4, 6, 5, 4, 5, 6, 4, 5, 4, 6, 7, 5, 4, 5, 6, 4, 5, 6],
    zones: [["Single image", 40], ["ZIP batch", 80], ["Demo dataset", 30]]
  },
  Cardboard: {
    color: "#e67e22",
    isContaminant: false,
    tonnage: "140 tons",
    value: "$21,000",
    rate: "@ $150/ton market rate",
    purity: "95.4%",
    status: "Bale-ready high-grade fibers",
    subtitle: "Cardboard recovery, fiber purity, and sorting source distribution.",
    trend: [3, 4, 5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 4],
    zones: [["Single image", 30], ["ZIP batch", 90], ["Demo dataset", 20]]
  },
  "Food Organics": {
    color: "#27ae60",
    isContaminant: true,
    tonnage: "1,420 incidents",
    value: "-$12,000",
    rate: "Estimated washing / bale sorting overhead",
    purity: "Medium",
    status: "High residue hazard",
    subtitle: "Organic contamination flags, cleaning costs, and incident hotspots.",
    trend: [50, 48, 52, 45, 60, 55, 49, 45, 42, 50, 48, 44, 46, 52, 55, 60, 58, 45, 40, 38],
    zones: [["Single image", 600], ["ZIP batch", 500], ["Demo dataset", 320]]
  },
  "General Trash": {
    color: "#7f8c8d",
    isContaminant: true,
    tonnage: "950 incidents",
    value: "-$14,200",
    rate: "Estimated landfill disposal fees",
    purity: "Low",
    status: "Unrecoverable waste logs",
    subtitle: "General trash contamination patterns and landfill diversion rates.",
    trend: [30, 32, 28, 35, 30, 29, 31, 33, 30, 28, 35, 34, 32, 30, 29, 31, 33, 35, 30, 28],
    zones: [["Single image", 400], ["ZIP batch", 350], ["Demo dataset", 200]]
  },
  Textile: {
    color: "#1abc9c",
    isContaminant: true,
    tonnage: "780 incidents",
    value: "-$8,500",
    rate: "Estimated machine downtime cost",
    purity: "High",
    status: "Tangling / Jamming risk",
    subtitle: "Fabric logs showing machine safety overrides and manual redirects.",
    trend: [25, 24, 26, 28, 25, 24, 27, 26, 25, 23, 28, 29, 25, 24, 26, 27, 25, 24, 23, 25],
    zones: [["Single image", 300], ["ZIP batch", 280], ["Demo dataset", 200]]
  },
  Battery: {
    color: "#b42318",
    isContaminant: true,
    tonnage: "210 incidents",
    value: "-$28,000",
    rate: "Estimated fire safety containment risk",
    purity: "Critical",
    status: "Fire risk - immediate quarantine",
    subtitle: "Quarantined lithium battery incidents found in uploaded images.",
    trend: [8, 6, 9, 7, 5, 8, 10, 6, 7, 5, 9, 8, 6, 7, 5, 8, 9, 6, 7, 5],
    zones: [["Single image", 100], ["ZIP batch", 70], ["Demo dataset", 40]]
  }
};

const drillStationData = {
  "UPLOAD-HUB": {
    load: "On-demand",
    capacity: "Upload queue",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Web upload",
    motor: "Online",
    air: "100 MB batch limit",
    action: "Operational",
    insight: "Uploaded images are queued for classification, confidence scoring, and human review.",
    uptime: [["Completed reviews", 82], ["Pending review", 18]],
    composition: [["Single images", 52], ["ZIP batches", 36], ["Demo samples", 12]]
  },
  "SINGLE-IMAGE": {
    load: "Single file",
    capacity: "JPG, PNG, WEBP",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Local image upload",
    motor: "Online",
    air: "10 MB image limit",
    action: "Operational",
    insight: "Single image uploads are processed immediately and can be approved or moved to human review.",
    uptime: [["Auto-cleared", 74], ["Manual review", 26]],
    composition: [["Plastic", 34], ["Metal", 26], ["Paper", 22], ["Contaminants", 18]]
  },
  "ZIP-BATCH": {
    load: "Batch archive",
    capacity: "Up to 100 MB",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Batch Precision",
    scanner: "ZIP image batch",
    motor: "Online",
    air: "50 file cap",
    action: "Review recommended",
    insight: "ZIP batches can contain mixed materials, so low-confidence images are routed into human review.",
    uptime: [["Auto-cleared", 61], ["Manual review", 39]],
    composition: [["Glass", 28], ["Plastic", 24], ["Cardboard", 21], ["Contaminants", 27]]
  },
  "QUARANTINE-UPLOAD": {
    load: "Flagged upload",
    capacity: "Human decision required",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Rejected or hazard image",
    motor: "Online",
    air: "Override required",
    action: "Quarantine",
    insight: "Hazards, organics, textile scraps, and general trash are isolated in the review queue before final logging.",
    uptime: [["Rejected", 68], ["Corrected", 32]],
    composition: [["General Trash", 45], ["Food Organics", 27], ["Batteries", 18], ["Textile", 10]]
  }
};

function activateDetailPanel(targetId) {
  const panel = document.getElementById(targetId);
  if (!panel) return;

  const dock = panel.closest(".detail-dock");
  if (dock) {
    dock.querySelectorAll(".detail-panel").forEach(item => item.classList.remove("active"));
  }
  panel.classList.add("active");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSparkBars(container, values, color) {
  if (!container) return;
  const max = Math.max(...values);
  container.innerHTML = values
    .map(value => `<span style="height:${Math.max(12, (value / max) * 100)}%; background:${color}" title="${value}"></span>`)
    .join("");
}

function renderBarRows(container, rows, color, suffix = "") {
  if (!container) return;
  const max = Math.max(...rows.map(row => row[1]));
  container.innerHTML = rows
    .map(([label, value]) => `
      <div>
        <span>${label}</span>
        <strong>${value}${suffix}</strong>
        <i style="width:${Math.max(4, (value / max) * 100)}%; background:${color}"></i>
      </div>
    `)
    .join("");
}

function renderMaterialDetail(materialName, options = {}) {
  const activate = options.activate !== false;

  // Normalization
  let normName = materialName;
  if (materialName === "Food" || materialName === "Organics" || materialName === "food" || materialName === "food_organics") {
    normName = "Food Organics";
  } else if (materialName === "Trash" || materialName === "trash") {
    normName = "General Trash";
  }

  const data = drillMaterialData[normName] || drillMaterialData.Metal;
  const panel = document.getElementById("detail-material");
  if (!panel) return;

  panel.querySelectorAll("[data-material-title]").forEach(el => { el.textContent = normName; });
  panel.querySelectorAll("[data-material-subtitle]").forEach(el => { el.textContent = data.subtitle; });
  panel.querySelectorAll("[data-material-tonnage]").forEach(el => { el.textContent = data.tonnage; el.style.color = data.color; });
  panel.querySelectorAll("[data-material-value]").forEach(el => { el.textContent = data.value; el.style.color = data.color; });
  panel.querySelectorAll("[data-material-rate]").forEach(el => { el.textContent = data.rate; });
  panel.querySelectorAll("[data-material-purity]").forEach(el => { el.textContent = data.purity; el.style.color = data.color; });
  panel.querySelectorAll("[data-material-status]").forEach(el => { el.textContent = data.status; });
  panel.querySelectorAll("[data-material-kpi-one]").forEach(el => { el.textContent = data.isContaminant ? "Total Flagged" : "Tonnage Recovered"; });
  panel.querySelectorAll("[data-material-kpi-two]").forEach(el => { el.textContent = data.isContaminant ? "Est. Sorting Penalty" : "Commodity Market Value"; });
  panel.querySelectorAll("[data-material-kpi-three]").forEach(el => { el.textContent = data.isContaminant ? "Severity Rating" : "Avg Material Purity"; });
  panel.querySelectorAll("[data-material-trend-title]").forEach(el => { el.textContent = data.isContaminant ? "30-Day Flagged Trend" : "30-Day Recovery Trend"; });
  panel.querySelectorAll("[data-material-zone-title]").forEach(el => { el.textContent = data.isContaminant ? "Flags by upload type" : "Distribution by upload type"; });
  panel.querySelectorAll("[data-material-trend]").forEach(el => renderSparkBars(el, data.trend, data.color));
  panel.querySelectorAll("[data-material-zones]").forEach(el => renderBarRows(el, data.zones, data.color, data.isContaminant ? "" : " t"));

  if (activate) activateDetailPanel("detail-material");
}

function renderStationDetail(stationId, options = {}) {
  const activate = options.activate !== false;

  // Normalize
  let normId = stationId;
  if (stationId === "BELT-A01" || stationId === "BELT-B02" || stationId === "STATION-A01" || stationId === "STATION-B02") normId = "SINGLE-IMAGE";
  if (stationId === "BELT-C03" || stationId === "STATION-C03") normId = "ZIP-BATCH";
  if (stationId === "BELT-D04" || stationId === "STATION-D04") normId = "QUARANTINE-UPLOAD";

  const data = drillStationData[normId] || drillStationData["UPLOAD-HUB"];
  const panel = document.getElementById("detail-belt");
  if (!panel) return;

  const sourceLabel = getUploadSourceDisplayName(normId);
  panel.querySelectorAll("[data-belt-id]").forEach(el => { el.textContent = sourceLabel; });
  panel.querySelectorAll("[data-belt-load]").forEach(el => { el.textContent = data.load; });
  panel.querySelectorAll("[data-belt-capacity]").forEach(el => { el.textContent = data.capacity; });
  panel.querySelectorAll("[data-belt-speed]").forEach(el => { el.textContent = data.speed; });
  panel.querySelectorAll("[data-belt-max-speed]").forEach(el => { el.textContent = data.maxSpeed; });
  panel.querySelectorAll("[data-belt-scanner]").forEach(el => { el.textContent = data.scanner; });
  panel.querySelectorAll("[data-belt-motor]").forEach(el => { el.textContent = data.motor; });
  panel.querySelectorAll("[data-belt-air]").forEach(el => { el.textContent = data.air; });
  panel.querySelectorAll("[data-belt-action]").forEach(el => { el.textContent = data.action; });
  panel.querySelectorAll("[data-belt-insight]").forEach(el => { el.textContent = data.insight; });
  panel.querySelectorAll("[data-belt-uptime]").forEach(el => renderBarRows(el, data.uptime, "#167647", "%"));
  panel.querySelectorAll("[data-belt-composition]").forEach(el => renderBarRows(el, data.composition, "#2f6f8f", "%"));

  // Adjust headings of drill-down to upload-source layout
  const kicker = panel.querySelector(".eyebrow");
  if (kicker) kicker.textContent = "Upload source";
  const title = panel.querySelector("h2");
  if (title) title.innerHTML = `Source: <span data-belt-id>${sourceLabel}</span>`;

  const labels = panel.querySelectorAll(".detail-card h3");
  if (labels[0]) labels[0].textContent = "Upload diagnostics";
  if (labels[1]) labels[1].textContent = "Review reliability and material mix";

  const rows = panel.querySelectorAll(".detail-list dt");
  if (rows[0]) rows[0].textContent = "Input channel";
  if (rows[1]) rows[1].textContent = "Compute state";
  if (rows[2]) rows[2].textContent = "File policy";

  if (activate) activateDetailPanel("detail-belt");
}

function initDrillThrough() {
  document.querySelectorAll("[data-drill-target]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      if (event.target.closest("[data-material-detail], [data-belt-detail]")) return;
      activateDetailPanel(trigger.dataset.drillTarget);
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateDetailPanel(trigger.dataset.drillTarget);
      }
    });
  });

  document.querySelectorAll("[data-material-detail]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      renderMaterialDetail(trigger.dataset.materialDetail);
    });
  });

  document.querySelectorAll("[data-belt-detail]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      renderStationDetail(trigger.dataset.beltDetail);
    });
  });

  if (document.querySelector(".belt-detail-output")) {
    const defaultBelt = document.querySelector("[data-belt-id]")?.textContent?.trim() || "UPLOAD-HUB";
    renderStationDetail(defaultBelt, { activate: false });
  }
}

/* Toast Notification System */
function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success"
    ? '<i class="fa-solid fa-circle-check"></i>'
    : type === "error"
      ? '<i class="fa-solid fa-circle-xmark"></i>'
      : '<i class="fa-solid fa-triangle-exclamation"></i>';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Slide in
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      // Remove container if empty
      if (container.childNodes.length === 0) {
        container.remove();
      }
    }, 350);
  }, 3500);
}

/* Mobile Sidebar Navigation & Toggle */
function initMobileNav() {
  const toggleBtn = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  });

  // Close sidebar on link click
  sidebar.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    });
  });
}

/* 1. Theme Toggle Management */
function initThemeToggle() {
  const savedTheme = localStorage.getItem("purityloop_theme") || "dark";
  if (savedTheme === "light") {
    document.body.classList.add("light");
  } else {
    document.body.classList.remove("light");
  }

  const toggleBtns = document.querySelectorAll(".theme-toggle-btn");

  function updateIcons() {
    const isLight = document.body.classList.contains("light");
    toggleBtns.forEach(btn => {
      const icon = btn.querySelector("i");
      if (icon) {
        if (isLight) {
          icon.className = "fa-solid fa-sun";
        } else {
          icon.className = "fa-solid fa-moon";
        }
      }
    });
  }

  updateIcons();

  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      const newTheme = document.body.classList.contains("light") ? "light" : "dark";
      localStorage.setItem("purityloop_theme", newTheme);
      updateIcons();

      // Smooth transitions for charts & canvases - reload page on analytics/result pages
      const activePage = document.body.getAttribute("data-page");
      if (activePage === "analytics" || activePage === "live-stream") {
        window.location.reload();
      }
    });
  });
}

/* 2. Login Password Reveal Toggle */
function initPasswordToggle() {
  const toggleBtn = document.getElementById("passwordToggle");
  const passwordInput = document.getElementById("password");
  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener("click", () => {
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    const icon = toggleBtn.querySelector("i");
    if (icon) {
      if (type === "text") {
        icon.className = "fa-solid fa-eye-slash";
      } else {
        icon.className = "fa-solid fa-eye";
      }
    }
  });
}

/* KPI Progress Bars Animation */
function animateProgressBars() {
  document.querySelectorAll(".kpi-progress-bar i, .kpi-progress-fill").forEach(bar => {
    const targetWidth = bar.style.width || "0%";
    bar.style.width = "0%";

    // Force reflow
    bar.offsetHeight;

    setTimeout(() => {
      bar.style.width = targetWidth;
    }, 160);
  });
}

/* Page Navigation Match & Trigger */
document.addEventListener("DOMContentLoaded", function () {
  // Navigation terminology updates across all files
  const sideLinks = document.querySelectorAll(".side-nav a");
  sideLinks.forEach(link => {
    const text = link.textContent.trim();
    if (text === "Live AI Stream") {
      link.textContent = "Classification Result";
    } else if (text === "Review Logs") {
      link.textContent = "Verification Logs";
    } else if (text === "Analytics & Reports") {
      link.textContent = "Operations Dashboard";
    }
  });

  initThemeToggle();
  initPasswordToggle();
  // initMobileNav(); // Handled by theme.js
  animateProgressBars();
  initUploadPage();
  initResultPage();
  initReviewModal();
  initAnalyticsCharts();
  initDrillThrough();
});
