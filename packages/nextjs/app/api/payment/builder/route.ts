import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "To get *this* response, you paid $0.01. Thanks :D" });
}
