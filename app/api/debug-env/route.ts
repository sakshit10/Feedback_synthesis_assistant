import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    OPENROUTER_API_KEY_EXISTS: !!process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    DATABASE_PATH: process.env.DATABASE_PATH,
    OPEN_KEYS: Object.keys(process.env).filter((k) =>
      k.includes("OPEN")
    ),
  });
}