import { readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_ASSETS = new Set(["jquery-1.8.2.js", "mfs100.js"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;

  if (!ALLOWED_ASSETS.has(asset)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(process.cwd(), "lib", asset);
  const fileContents = await readFile(filePath, "utf-8");

  return new Response(fileContents, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
