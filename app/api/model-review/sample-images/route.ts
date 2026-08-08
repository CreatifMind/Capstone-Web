import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";
import { supabase } from "@/lib/supabase";

export type SampleImageRecord = {
  id: string;
  filename: string;
  url: string;
  materialClass: string;
  groundTruthLabel: string;
  source: string;
  capturedAt: string;
};

const SAMPLE_DATABASE_IMAGES: SampleImageRecord[] = [
  // --- BATCH 0 (Inspection Line Alpha) ---
  {
    id: "img-pb-01",
    filename: "plastic-bottle.png",
    url: "/assets/items/plastic-bottle.png",
    materialClass: "plastic",
    groundTruthLabel: "Plastic Bottle",
    source: "Inspection Station Alpha (Camera #1)",
    capturedAt: "2026-08-06T10:14:22Z"
  },
  {
    id: "img-ac-02",
    filename: "aluminum-can.png",
    url: "/assets/items/aluminum-can.png",
    materialClass: "aluminum",
    groundTruthLabel: "Aluminum Can",
    source: "Conveyor Belt Line 2 (Camera #3)",
    capturedAt: "2026-08-06T11:22:05Z"
  },
  {
    id: "img-cb-03",
    filename: "cardboard.png",
    url: "/assets/items/cardboard.png",
    materialClass: "cardboard",
    groundTruthLabel: "Cardboard Box",
    source: "Recycling Intake Bay B",
    capturedAt: "2026-08-06T12:05:40Z"
  },
  {
    id: "img-gj-04",
    filename: "glass-jar.png",
    url: "/assets/items/glass-jar.png",
    materialClass: "glass",
    groundTruthLabel: "Glass Jar",
    source: "Glass Sorting Cell #4",
    capturedAt: "2026-08-06T13:45:18Z"
  },
  {
    id: "img-mw-05",
    filename: "food-waste.png",
    url: "/assets/items/food-waste.png",
    materialClass: "organic",
    groundTruthLabel: "Organic Compost Waste",
    source: "Main Stream Hopper #1",
    capturedAt: "2026-08-06T14:10:00Z"
  },
  {
    id: "img-cc-06",
    filename: "coffee-cup.png",
    url: "/assets/items/coffee-cup.png",
    materialClass: "paper",
    groundTruthLabel: "Disposable Coffee Cup",
    source: "Commercial Waste Stream #2",
    capturedAt: "2026-08-06T14:50:33Z"
  },
  {
    id: "img-bt-07",
    filename: "battery.png",
    url: "/assets/items/battery.png",
    materialClass: "e-waste",
    groundTruthLabel: "AA Battery",
    source: "Hazardous Materials Scanner #1",
    capturedAt: "2026-08-06T15:02:11Z"
  },
  {
    id: "img-cp-08",
    filename: "textile.png",
    url: "/assets/items/textile.png",
    materialClass: "textile",
    groundTruthLabel: "Textile Fabric Scrap",
    source: "Paper Fiber Line 1",
    capturedAt: "2026-08-06T15:20:45Z"
  },

  // --- BATCH 1 (Conveyor Line Beta) ---
  {
    id: "img-b1-01",
    filename: "food-waste.png",
    url: "/assets/items/food-waste.png",
    materialClass: "organic",
    groundTruthLabel: "Organic Food Waste",
    source: "Conveyor Line Beta (Camera #2)",
    capturedAt: "2026-08-07T08:30:00Z"
  },
  {
    id: "img-b1-02",
    filename: "textile.png",
    url: "/assets/items/textile.png",
    materialClass: "textile",
    groundTruthLabel: "Industrial Textile Fabric",
    source: "Metals Optical Sorter #2",
    capturedAt: "2026-08-07T09:15:12Z"
  },
  {
    id: "img-b1-03",
    filename: "mixed-waste.jpg",
    url: "/assets/items/mixed-waste.jpg",
    materialClass: "mixed",
    groundTruthLabel: "Mixed Stream Scrap",
    source: "Intake Bale Press Line",
    capturedAt: "2026-08-07T10:04:55Z"
  },
  {
    id: "img-b1-04",
    filename: "upload-result-reference.png",
    url: "/assets/items/upload-result-reference.png",
    materialClass: "mixed",
    groundTruthLabel: "Conveyor Belt Scan Batch",
    source: "Glass Sorting Cell #2",
    capturedAt: "2026-08-07T11:40:20Z"
  },
  {
    id: "img-b1-05",
    filename: "glass-jar.png",
    url: "/assets/items/glass-jar.png",
    materialClass: "glass",
    groundTruthLabel: "Recycled Glass Container",
    source: "Commercial Stream Hopper #3",
    capturedAt: "2026-08-07T12:22:10Z"
  },
  {
    id: "img-b1-06",
    filename: "crumpled-paper.png",
    url: "/assets/items/crumpled-paper.png",
    materialClass: "paper",
    groundTruthLabel: "Shredded Paper Stream",
    source: "Paper Fiber Line 3",
    capturedAt: "2026-08-07T13:10:44Z"
  },
  {
    id: "img-b1-07",
    filename: "battery.png",
    url: "/assets/items/battery.png",
    materialClass: "e-waste",
    groundTruthLabel: "Lithium Hazardous Cell",
    source: "Hazardous Materials Scanner #2",
    capturedAt: "2026-08-07T14:05:01Z"
  },
  {
    id: "img-b1-08",
    filename: "coffee-cup.png",
    url: "/assets/items/coffee-cup.png",
    materialClass: "paper",
    groundTruthLabel: "Coated Paper Container",
    source: "Commercial Waste Stream #4",
    capturedAt: "2026-08-07T15:18:30Z"
  },

  // --- BATCH 2 (Facility Stream Gamma) ---
  {
    id: "img-b2-01",
    filename: "textile.png",
    url: "/assets/items/textile.png",
    materialClass: "textile",
    groundTruthLabel: "Cotton & Nylon Waste",
    source: "Inspection Bay Gamma (Camera #1)",
    capturedAt: "2026-08-08T07:12:00Z"
  },
  {
    id: "img-b2-02",
    filename: "food-waste.png",
    url: "/assets/items/food-waste.png",
    materialClass: "organic",
    groundTruthLabel: "Compostable Food Scrap",
    source: "Magnetic Separator Line 1",
    capturedAt: "2026-08-08T08:05:22Z"
  },
  {
    id: "img-b2-03",
    filename: "coffee-cup.png",
    url: "/assets/items/coffee-cup.png",
    materialClass: "paper",
    groundTruthLabel: "Paper Cup Package",
    source: "Recycling Intake Bay C",
    capturedAt: "2026-08-08T09:30:15Z"
  },
  {
    id: "img-b2-04",
    filename: "crumpled-paper.png",
    url: "/assets/items/crumpled-paper.png",
    materialClass: "paper",
    groundTruthLabel: "Office Fiber Bundle",
    source: "Glass Sorting Cell #1",
    capturedAt: "2026-08-08T10:45:00Z"
  },
  {
    id: "img-b2-05",
    filename: "mixed-waste.jpg",
    url: "/assets/items/mixed-waste.jpg",
    materialClass: "mixed",
    groundTruthLabel: "Mixed Material Batch",
    source: "Main Stream Hopper #2",
    capturedAt: "2026-08-08T11:20:40Z"
  },
  {
    id: "img-b2-06",
    filename: "upload-result-reference.png",
    url: "/assets/items/upload-result-reference.png",
    materialClass: "mixed",
    groundTruthLabel: "Optical Sensor Inspection",
    source: "Paper Fiber Line 2",
    capturedAt: "2026-08-08T12:00:10Z"
  },
  {
    id: "img-b2-07",
    filename: "plastic-bottle.png",
    url: "/assets/items/plastic-bottle.png",
    materialClass: "plastic",
    groundTruthLabel: "Crushed PET Container",
    source: "Hazardous Materials Scanner #3",
    capturedAt: "2026-08-08T12:55:00Z"
  },
  {
    id: "img-b2-08",
    filename: "aluminum-can.png",
    url: "/assets/items/aluminum-can.png",
    materialClass: "metal",
    groundTruthLabel: "Aluminum Scrap Can",
    source: "Commercial Waste Stream #1",
    capturedAt: "2026-08-08T13:40:12Z"
  }
];

export async function GET(request: Request) {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;

  const { searchParams } = new URL(request.url);
  const filterClass = searchParams.get("material") || "all";
  const randomOnly = searchParams.get("random") === "true";
  const batchParam = Math.max(0, parseInt(searchParams.get("batch") || "0", 10));

  let realDbImages: SampleImageRecord[] = [];
  const client = supabase;

  if (client) {
    try {
      const { data: files } = await client.storage.from("scan-images").list("", {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" }
      });

      if (files && files.length > 0) {
        realDbImages = files
          .filter((f) => f.name && !f.name.startsWith("."))
          .map((file, idx) => {
            const { data: urlData } = client.storage.from("scan-images").getPublicUrl(file.name);
            const cleanName = file.name.replace(/^\d+-/, "");
            const lowerName = cleanName.toLowerCase();
            const matClass = lowerName.includes("bottle") || lowerName.includes("plastic") ? "plastic" :
                             lowerName.includes("can") || lowerName.includes("aluminum") || lowerName.includes("metal") ? "aluminum" :
                             lowerName.includes("box") || lowerName.includes("cardboard") ? "cardboard" :
                             lowerName.includes("glass") || lowerName.includes("jar") ? "glass" :
                             lowerName.includes("paper") || lowerName.includes("cup") ? "paper" :
                             lowerName.includes("battery") ? "e-waste" : "mixed";
            
            const rawLabel = cleanName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
            const groundTruthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

            return {
              id: `db-live-${idx}-${file.name}`,
              filename: file.name,
              url: urlData.publicUrl,
              materialClass: matClass,
              groundTruthLabel: `${groundTruthLabel} (Live Database Scan)`,
              source: "Supabase Live Database Stream (scan-images)",
              capturedAt: file.created_at || new Date().toISOString()
            };
          });
      }
    } catch {
      // Fallback silently if storage list permissions or bucket uninitialized
    }
  }

  const combined = [...realDbImages, ...SAMPLE_DATABASE_IMAGES];

  let filtered = combined;
  if (filterClass !== "all") {
    filtered = combined.filter(
      (img) => img.materialClass.toLowerCase() === filterClass.toLowerCase()
    );
    if (!filtered.length) filtered = combined; // fallback if filter returns empty
  }

  if (randomOnly) {
    const randomIndex = Math.floor(Math.random() * filtered.length);
    return NextResponse.json({ image: filtered[randomIndex], totalInPool: filtered.length });
  }

  // --- DYNAMIC BATCH ROTATION / PAGINATION ---
  const BATCH_SIZE = 8;
  const totalInPool = filtered.length;
  const startIndex = (batchParam * BATCH_SIZE) % Math.max(1, totalInPool);

  const batchSamples: SampleImageRecord[] = [];
  for (let i = 0; i < Math.min(BATCH_SIZE, totalInPool); i++) {
    const idx = (startIndex + i) % totalInPool;
    batchSamples.push(filtered[idx]);
  }

  return NextResponse.json({
    samples: batchSamples,
    totalCount: totalInPool,
    currentBatch: batchParam,
    batchSize: BATCH_SIZE
  });
}
