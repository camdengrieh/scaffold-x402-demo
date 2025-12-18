import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "You have been granted access to the stream after payment",
  });
}
