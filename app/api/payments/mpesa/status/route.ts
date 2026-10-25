import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const missing = [
    "MPESA_SHORTCODE","MPESA_CONSUMER_KEY","MPESA_CONSUMER_SECRET","MPESA_PASSKEY","MPESA_CALLBACK_TOKEN"
  ].filter(key => !process.env[key]);
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
  if (!["CustomerPayBillOnline","CustomerBuyGoodsOnline"].includes(transactionType)) missing.push("MPESA_TRANSACTION_TYPE");
  return NextResponse.json({
    provider:"mpesa",
    configured:missing.length===0,
    environment:process.env.MPESA_ENV==="production"?"production":"sandbox",
    transactionType,
    missing
  });
}
