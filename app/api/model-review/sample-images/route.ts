import { NextResponse } from "next/server";
import { failure, modelReviewContext } from "@/lib/model-review/context";

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
    filename: "mixed-waste.jpg",
    url: "/assets/items/mixed-waste.jpg",
    materialClass: "mixed",
    groundTruthLabel: "Mixed Household Waste",
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
    filename: "crumpled-paper.png",
    url: "/assets/items/crumpled-paper.png",
    materialClass: "paper",
    groundTruthLabel: "Crumpled Office Paper",
    source: "Paper Fiber Line 1",
    capturedAt: "2026-08-06T15:20:45Z"
  }
];

export async function GET(request: Request) {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;

  const { searchParams } = new URL(request.url);
  const filterClass = searchParams.get("material") || "all";
  const randomOnly = searchParams.get("random") === "true";

  let filtered = SAMPLE_DATABASE_IMAGES;
  if (filterClass !== "all") {
    filtered = SAMPLE_DATABASE_IMAGES.filter(
      (img) => img.materialClass.toLowerCase() === filterClass.toLowerCase()
    );
    if (!filtered.length) filtered = SAMPLE_DATABASE_IMAGES; // fallback if filter returns empty
  }

  if (randomOnly) {
    const randomIndex = Math.floor(Math.random() * filtered.length);
    return NextResponse.json({ image: filtered[randomIndex], totalInPool: filtered.length });
  }

  return NextResponse.json({ samples: filtered, totalCount: filtered.length });
}
